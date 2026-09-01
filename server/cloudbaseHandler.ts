import { ZodError } from 'zod'
import { adviceRequestSchema } from '../src/lib/ai'
import { AdviceFailure, generateAdvice, safeFallback } from './advice'
import { fetchPublicCsv, PublicCsvError } from './csvProxy'

type CloudBaseHttpEvent = {
  httpMethod?: string
  path?: string
  body?: string | null
  isBase64Encoded?: boolean
}

type CloudBaseResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
  isBase64Encoded: false
}

const MAX_BODY_BYTES = 100 * 1024
const commonHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

function response(statusCode: number, payload: unknown, headers: Record<string, string> = {}): CloudBaseResponse {
  return {
    statusCode,
    headers: { ...commonHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  }
}

function requestBody(event: CloudBaseHttpEvent) {
  const body = event.body ?? ''
  const text = event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Error('body_too_large')
  return JSON.parse(text) as unknown
}

async function advice(event: CloudBaseHttpEvent) {
  let body: unknown
  try {
    body = requestBody(event)
  } catch (error) {
    return response(error instanceof Error && error.message === 'body_too_large' ? 413 : 422, {
      error: '请求体不是有效 JSON 或超过大小限制。',
    })
  }

  const parsed = adviceRequestSchema.safeParse(body)
  if (!parsed.success) return response(422, { error: '经营问题或上下文不合法。' })
  if (!process.env.DEMO_ACCESS_CODE) return response(503, { error: 'AI 演示口令尚未配置。' })
  if (parsed.data.accessCode !== process.env.DEMO_ACCESS_CODE) return response(401, { error: '演示口令错误。' })

  try {
    const result = await generateAdvice(parsed.data, {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL,
    })
    return response(200, result)
  } catch (error) {
    if (error instanceof ZodError) return response(422, { error: '经营问题或上下文不合法。' })
    const reason = error instanceof AdviceFailure ? error.reason : 'unexpected_error'
    return response(200, safeFallback(parsed.data, reason))
  }
}

async function csvProxy(event: CloudBaseHttpEvent) {
  try {
    const body = requestBody(event) as { url?: unknown }
    return response(200, await fetchPublicCsv(body.url))
  } catch (error) {
    if (error instanceof PublicCsvError) return response(error.status, { error: error.message })
    return response(422, { error: error instanceof Error ? error.message : '读取在线 CSV 失败。' })
  }
}

export async function main(event: CloudBaseHttpEvent): Promise<CloudBaseResponse> {
  const method = (event.httpMethod ?? 'GET').toUpperCase()
  const path = event.path ?? '/'
  if (method === 'OPTIONS') return response(204, null)
  if (path.endsWith('/advice')) return method === 'POST' ? advice(event) : response(405, { error: '仅支持 POST 请求。' })
  if (path.endsWith('/csv-proxy')) return method === 'POST' ? csvProxy(event) : response(405, { error: '仅支持 POST 请求。' })
  if (path.endsWith('/demo-live.csv')) {
    return response(410, { error: '请直接使用静态数据源 /data/live/qingyou-live-v1-30d.csv。' })
  }
  return response(404, { error: 'API 路径不存在。' })
}
