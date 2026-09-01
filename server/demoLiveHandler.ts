import type { IncomingMessage, ServerResponse } from 'node:http'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/api/demo-live.csv', 'https://merchantops.local')
  const requested = Number(requestUrl.searchParams.get('version') ?? 1)
  const version = Number.isInteger(requested) ? Math.min(4, Math.max(1, requested)) : 1
  res.statusCode = 307
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-MerchantOps-Live-Version', String(version))
  res.setHeader('Location', `/data/live/qingyou-live-v${version}-30d.csv`)
  res.end()
}
