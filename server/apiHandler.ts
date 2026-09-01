import type { IncomingMessage, ServerResponse } from 'node:http'
import { ZodError } from 'zod'
import { AdviceFailure, generateAdvice, safeFallback } from './advice'
import { adviceRequestSchema } from '../src/lib/ai'

type ApiRequest = IncomingMessage & { body?: unknown }
const MAX_BODY_BYTES = 100 * 1024

async function readBody(req: ApiRequest) {
  if (req.body !== undefined) {
    const serialized = JSON.stringify(req.body)
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new Error('body_too_large')
    return req.body
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('body_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    send(res, 405, { error: '仅支持 POST 请求。' })
    return
  }
  let body: unknown
  try {
    body = await readBody(req)
  } catch (error) {
    send(res, error instanceof Error && error.message === 'body_too_large' ? 413 : 422, { error: '请求体不是有效 JSON 或超过大小限制。' })
    return
  }
  const parsed = adviceRequestSchema.safeParse(body)
  if (!parsed.success) {
    send(res, 422, { error: '经营问题或上下文不合法。' })
    return
  }
  const expectedCode = process.env.DEMO_ACCESS_CODE
  if (!expectedCode) {
    send(res, 503, { error: 'AI 演示口令尚未配置。' })
    return
  }
  if (parsed.data.accessCode !== expectedCode) {
    send(res, 401, { error: '演示口令错误。' })
    return
  }
  try {
    const result = await generateAdvice(parsed.data, {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL,
    })
    send(res, 200, result)
  } catch (error) {
    if (error instanceof ZodError) {
      send(res, 422, { error: '经营问题或上下文不合法。' })
      return
    }
    const reason = error instanceof AdviceFailure ? error.reason : 'unexpected_error'
    send(res, 200, safeFallback(parsed.data, reason))
  }
}
