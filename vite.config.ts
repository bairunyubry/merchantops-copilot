import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fetchPublicCsv, PublicCsvError } from './server/csvProxy.ts'

function localApi() {
  return {
    name: 'merchantops-local-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (requestUrl.pathname === '/api/demo-live.csv') {
          const requested = Number(requestUrl.searchParams.get('version') ?? 1)
          const version = Number.isInteger(requested) ? Math.min(4, Math.max(1, requested)) : 1
          res.statusCode = 307
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('X-MerchantOps-Live-Version', String(version))
          res.setHeader('Location', `/data/live/qingyou-live-v${version}-30d.csv`)
          res.end()
          return
        }
        if (requestUrl.pathname !== '/api/csv-proxy') {
          next()
          return
        }
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: '仅支持 POST 请求。' }))
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { url?: unknown }
          const result = await fetchPublicCsv(body.url)
          res.statusCode = 200
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = error instanceof PublicCsvError ? error.status : 500
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : '读取在线 CSV 失败。' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
})
