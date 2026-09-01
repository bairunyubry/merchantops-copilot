import { ZodError } from 'zod'
import { AdviceFailure, generateAdvice, safeFallback } from '../../server/advice'
import { adviceRequestSchema } from '../../src/lib/ai'

type FunctionContext = {
  request: Request
  env?: Record<string, string | undefined>
}

const MAX_BODY_BYTES = 100 * 1024

function json(status: number, payload: unknown, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

function runtimeEnv(context: FunctionContext, name: string) {
  return context.env?.[name] ?? process.env[name]
}

export default async function onRequest(context: FunctionContext) {
  if (context.request.method !== 'POST') {
    return json(405, { error: '仅支持 POST 请求。' }, { Allow: 'POST' })
  }

  const contentLength = Number(context.request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) return json(413, { error: '请求体不是有效 JSON 或超过大小限制。' })

  let body: unknown
  try {
    const text = await context.request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return json(413, { error: '请求体不是有效 JSON 或超过大小限制。' })
    }
    body = JSON.parse(text)
  } catch {
    return json(422, { error: '请求体不是有效 JSON 或超过大小限制。' })
  }

  const parsed = adviceRequestSchema.safeParse(body)
  if (!parsed.success) return json(422, { error: '经营问题或上下文不合法。' })

  const expectedCode = runtimeEnv(context, 'DEMO_ACCESS_CODE')
  if (!expectedCode) return json(503, { error: 'AI 演示口令尚未配置。' })
  if (parsed.data.accessCode !== expectedCode) return json(401, { error: '演示口令错误。' })

  try {
    const result = await generateAdvice(parsed.data, {
      apiKey: runtimeEnv(context, 'DEEPSEEK_API_KEY'),
      baseUrl: runtimeEnv(context, 'DEEPSEEK_BASE_URL'),
      model: runtimeEnv(context, 'DEEPSEEK_MODEL'),
    })
    return json(200, result)
  } catch (error) {
    if (error instanceof ZodError) return json(422, { error: '经营问题或上下文不合法。' })
    const reason = error instanceof AdviceFailure ? error.reason : 'unexpected_error'
    return json(200, safeFallback(parsed.data, reason))
  }
}
