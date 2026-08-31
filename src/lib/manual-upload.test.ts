import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'
import { buildDashboardSnapshot } from './dashboard'

describe('手工上传验收数据', () => {
  it('可被导入并识别为履约异常', () => {
    const text = readFileSync(
      resolve('test-data/xiaoman-beauty-fulfillment-test-30d.csv'),
      'utf8',
    )
    const imported = parseMerchantCsv(text)
    expect(imported.blocked).toBe(false)
    expect(imported.skippedRows).toBe(0)
    expect(imported.rows).toHaveLength(240)

    const snapshot = buildDashboardSnapshot(imported.rows)
    expect(snapshot.skuCount).toBe(8)
    expect(snapshot.latestCompleteDate).toBe('2026-08-30')
    expect(snapshot.current.ship48hRate).toBeLessThan(0.9)
    expect(snapshot.primaryFinding.code).toBe('fulfillment_delay')
  })
})
