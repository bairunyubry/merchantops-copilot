import { fetchPublicCsv, PublicCsvError } from '../../server/csvProxy'

type FunctionContext = { request: Request }

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

export default async function onRequest(context: FunctionContext) {
  if (context.request.method !== 'POST') {
    return json(405, { error: '仅支持 POST 请求。' }, { Allow: 'POST' })
  }
  let body: Record<string, unknown>
  try {
    body = await context.request.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  try {
    return json(200, await fetchPublicCsv(body.url))
  } catch (error) {
    const status = error instanceof PublicCsvError ? error.status : 500
    return json(status, { error: error instanceof Error ? error.message : '读取在线 CSV 失败。' })
  }
}
