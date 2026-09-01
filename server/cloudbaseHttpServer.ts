import { createServer } from 'node:http'
import { main } from './cloudbaseHandler'

const port = Number(process.env.PORT ?? 9000)

createServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  const result = await main({
    httpMethod: request.method,
    path: requestUrl.pathname,
    body: Buffer.concat(chunks).toString('utf8'),
    isBase64Encoded: false,
  })
  response.statusCode = result.statusCode
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value)
  response.end(result.body)
}).listen(port, '0.0.0.0')
