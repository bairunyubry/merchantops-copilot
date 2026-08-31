import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

export class PublicCsvError extends Error {
  status: number

  constructor(message: string, status = 422) {
    super(message)
    this.name = 'PublicCsvError'
    this.status = status
  }
}

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false
  const [a, b] = parts
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address)
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb')
  }
  return true
}

export function validatePublicCsvUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new PublicCsvError('请输入有效的公开 CSV 链接。')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new PublicCsvError('链接格式不正确。')
  }
  if (url.protocol !== 'https:') throw new PublicCsvError('仅支持 HTTPS 公开链接。')
  if (url.username || url.password) throw new PublicCsvError('链接中不能包含账号或密码。')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new PublicCsvError('不能读取本机或内网地址。')
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) throw new PublicCsvError('不能读取本机或内网地址。')
  return url
}

async function assertPublicDns(url: URL) {
  const addresses = await lookup(url.hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new PublicCsvError('目标域名解析到了本机或内网地址。')
  }
}

export async function fetchPublicCsv(value: unknown) {
  let url = validatePublicCsvUrl(value)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicDns(url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.2', 'user-agent': 'MerchantOps-CsvConnector/1.0' },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError'
      throw new PublicCsvError(timedOut ? '连接超时，请检查链接后重试。' : '无法连接该数据源。', 502)
    } finally {
      clearTimeout(timer)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new PublicCsvError('数据源重定向次数过多。', 502)
      url = validatePublicCsvUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new PublicCsvError(`数据源返回 HTTP ${response.status}。`, 502)
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_BYTES) throw new PublicCsvError('CSV 超过 5MB 限制。', 413)
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) throw new PublicCsvError('CSV 超过 5MB 限制。', 413)
    const csvText = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    return {
      csvText,
      meta: {
        finalUrl: url.toString(),
        bytes: buffer.byteLength,
        contentType: response.headers.get('content-type') ?? 'unknown',
        fetchedAt: new Date().toISOString(),
      },
    }
  }
  throw new PublicCsvError('无法读取该数据源。', 502)
}

