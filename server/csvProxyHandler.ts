import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchPublicCsv, PublicCsvError } from './csvProxy'

type ApiRequest = IncomingMessage & { body?: unknown }

async function readJson(req: ApiRequest) {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end(JSON.stringify({ error: '仅支持 POST 请求。' }))
    return
  }
  try {
    const body = await readJson(req)
    const result = await fetchPublicCsv(body.url)
    res.statusCode = 200
    res.end(JSON.stringify(result))
  } catch (error) {
    const status = error instanceof PublicCsvError ? error.status : 500
    res.statusCode = status
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : '读取在线 CSV 失败。' }))
  }
}
