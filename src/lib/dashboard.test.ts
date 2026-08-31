import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'
import { buildDashboardSnapshot } from './dashboard'

const loadRows = (file: string) => {
  const imported = parseMerchantCsv(readFileSync(resolve('public/data/scenarios', file), 'utf8'))
  return imported.rows
}
const load = (file: string) => buildDashboardSnapshot(loadRows(file))

describe('buildDashboardSnapshot', () => {
  it('为旗舰异常生成完整经营总览快照', () => {
    const snapshot = load('qingyou-sku-concentration-30d.csv')
    expect(snapshot.daily).toHaveLength(30)
    expect(snapshot.skuCount).toBe(12)
    expect(snapshot.primaryFinding.code).toBe('sku_concentration')
    expect(snapshot.primaryFinding.relatedSkuId).toBe('QY-CLEAN-001')
    expect(snapshot.findings).toHaveLength(1)
    expect(snapshot.findings[0].ruleCodes).toEqual(['refund_spike', 'sku_concentration'])
    expect(snapshot.rawFindingCount).toBe(2)
    expect(snapshot.skuContributions[0].contribution).toBeGreaterThan(0.7)
    expect(snapshot.current.gmv - snapshot.current.refundAmount).toBeGreaterThan(0)
  })

  it('不同演示场景会生成对应最高优先级异常', () => {
    expect(load('qingyou-conversion-drop-30d.csv').primaryFinding.code).toBe('conversion_drop')
    expect(load('qingyou-refund-spike-30d.csv').primaryFinding.code).toBe('refund_spike')
    expect(load('qingyou-fulfillment-delay-30d.csv').primaryFinding.code).toBe('fulfillment_delay')
    expect(load('qingyou-inventory-shortage-30d.csv').primaryFinding.code).toBe('inventory_shortage')
  })

  it('经营健康始终返回四个维度和有效分数', () => {
    const health = load('qingyou-sku-concentration-30d.csv').health
    expect(health).toHaveLength(4)
    health.forEach((item) => expect(item.score).toBeGreaterThanOrEqual(0))
    health.forEach((item) => expect(item.score).toBeLessThanOrEqual(100))
  })

  it('组合数据展示全部独立异常，并按动态优先级排序', () => {
    const rows = loadRows('qingyou-sku-concentration-30d.csv').map((row) => {
      if (row.date < '2026-08-24') return row
      return {
        ...row,
        shipped_within_48h_orders: Math.floor(row.shipped_orders * 0.7),
        avg_ship_hours: Math.max(row.avg_ship_hours, 58),
        stock: row.sku_id === 'QY-SUN-005' ? 1 : row.stock,
      }
    })
    const snapshot = buildDashboardSnapshot(rows)
    const categories = snapshot.findings.map((finding) => finding.category)

    expect(categories).toContain('after_sales')
    expect(categories).toContain('fulfillment')
    expect(categories).toContain('inventory')
    expect(snapshot.findings).toHaveLength(3)
    expect(snapshot.rawFindingCount).toBe(4)
    expect(snapshot.findings[0].priority.total).toBeGreaterThanOrEqual(snapshot.findings[1].priority.total)
    expect(snapshot.findings[1].priority.total).toBeGreaterThanOrEqual(snapshot.findings[2].priority.total)
    snapshot.findings.forEach((finding) => {
      expect(finding.priority.total).toBeGreaterThanOrEqual(0)
      expect(finding.priority.total).toBeLessThanOrEqual(100)
      expect(finding.evidence.length).toBeGreaterThanOrEqual(3)
    })
  })
})
