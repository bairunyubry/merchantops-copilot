type FunctionContext = { request: Request }

export default function onRequest(context: FunctionContext) {
  const requestUrl = new URL(context.request.url)
  const requested = Number(requestUrl.searchParams.get('version') ?? 1)
  const version = Number.isInteger(requested) ? Math.min(4, Math.max(1, requested)) : 1
  return new Response(null, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store',
      'X-MerchantOps-Live-Version': String(version),
      Location: `/data/live/qingyou-live-v${version}-30d.csv`,
    },
  })
}
