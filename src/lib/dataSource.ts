import { parseMerchantCsv, type CsvImportResult } from './csv'
import type { StoreDataRow } from '../types/data'

export type OnlineSyncMode = 'manual' | 'interval_30m'

export interface OnlineSourceConfig {
  sourceId: string
  name: string
  url: string
  syncMode: OnlineSyncMode
  version: number | null
  lastSyncedAt: string
  nextSyncAt: string | null
}

export interface OnlineCsvMeta {
  finalUrl: string
  bytes: number
  contentType: string
  fetchedAt: string
  durationMs: number
}

export interface OnlineCsvResult {
  importResult: CsvImportResult
  meta: OnlineCsvMeta
  requestedUrl: string
}

interface StoredOnlineSource {
  config: OnlineSourceConfig
  rows: StoreDataRow[]
  importResult: CsvImportResult
}

export const ONLINE_SOURCE_STORAGE_KEY = 'merchantops.online-source.v1'
export const ONLINE_SYNC_INTERVAL_MS = 30 * 60 * 1000
const currentOrigin = () => typeof window === 'undefined' ? 'http://127.0.0.1:5173' : window.location.origin

export function demoLiveUrl(origin = currentOrigin(), version = 1) {
  return `${origin}/api/demo-live.csv?version=${version}`
}

export function demoVersionFromUrl(value: string) {
  try {
    const url = new URL(value, currentOrigin())
    if (url.pathname !== '/api/demo-live.csv') return null
    const version = Number(url.searchParams.get('version') ?? 1)
    return Number.isInteger(version) ? Math.min(4, Math.max(1, version)) : 1
  } catch {
    return null
  }
}

export function withDemoVersion(value: string, version: number) {
  const url = new URL(value, currentOrigin())
  url.searchParams.set('version', String(Math.min(4, Math.max(1, version))))
  return url.toString()
}

export function nextDemoVersion(value: string) {
  const current = demoVersionFromUrl(value)
  return current === null ? null : Math.min(4, current + 1)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function sourceIdForUrl(value: string) {
  if (demoVersionFromUrl(value) !== null) return 'qingyou-live'
  const url = new URL(value)
  url.searchParams.delete('version')
  return `online-${stableHash(url.toString())}`
}

export function nextSyncTime(mode: OnlineSyncMode, from = Date.now()) {
  return mode === 'interval_30m' ? new Date(from + ONLINE_SYNC_INTERVAL_MS).toISOString() : null
}

export async function fetchOnlineCsv(value: string): Promise<OnlineCsvResult> {
  const startedAt = performance.now()
  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    throw new Error('链接格式不正确。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP(S) CSV 链接。')

  let csvText = ''
  let remoteMeta: Omit<OnlineCsvMeta, 'durationMs'>
  if (url.origin === window.location.origin) {
    const response = await fetch(url, { headers: { accept: 'text/csv,text/plain' }, cache: 'no-store' })
    if (!response.ok) throw new Error(`数据源返回 HTTP ${response.status}。`)
    csvText = await response.text()
    remoteMeta = {
      finalUrl: response.url || url.toString(),
      bytes: new TextEncoder().encode(csvText).byteLength,
      contentType: response.headers.get('content-type') ?? 'text/csv',
      fetchedAt: new Date().toISOString(),
    }
  } else {
    if (url.protocol !== 'https:') throw new Error('外部数据源仅支持 HTTPS 公开链接。')
    const response = await fetch('/api/csv-proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url.toString() }),
    })
    const payload = await response.json() as { csvText?: string; meta?: Omit<OnlineCsvMeta, 'durationMs'>; error?: string }
    if (!response.ok || !payload.csvText || !payload.meta) throw new Error(payload.error ?? '读取在线 CSV 失败。')
    csvText = payload.csvText
    remoteMeta = payload.meta
  }

  return {
    requestedUrl: url.toString(),
    importResult: parseMerchantCsv(csvText),
    meta: { ...remoteMeta, durationMs: Math.max(1, Math.round(performance.now() - startedAt)) },
  }
}

export function saveOnlineSource(config: OnlineSourceConfig, rows: StoreDataRow[], importResult: CsvImportResult) {
  const value: StoredOnlineSource = { config, rows, importResult }
  localStorage.setItem(ONLINE_SOURCE_STORAGE_KEY, JSON.stringify(value))
}

export function readOnlineSource(): StoredOnlineSource | null {
  try {
    const raw = localStorage.getItem(ONLINE_SOURCE_STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as StoredOnlineSource
    if (!value?.config?.url || !Array.isArray(value.rows) || value.rows.length === 0) return null
    return value
  } catch {
    return null
  }
}

export function clearOnlineSource() {
  localStorage.removeItem(ONLINE_SOURCE_STORAGE_KEY)
}
