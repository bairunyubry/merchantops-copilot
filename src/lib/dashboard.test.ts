import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'
import { buildDashboardSnapshot } from './dashboard'

const load = (file: string) => {
  const imported = parseMerchantCsv(readFileSync(resolve('public/data/scenarios', file), 'utf8'))
  return buildDashboardSnapshot(imported.rows)
}

describe('buildDashboardSnapshot', () => {
  it('为旗舰异常生成完整经营总览快照', () => {
    const snapshot = load('qingyou-sku-concentration-30d.csv')
    expect(snapshot.daily).toHaveLength(30)
    expect(snapshot.skuCount).toBe(12)
    expect(snapshot.primaryFinding.code).toBe('sku_concentration')
    expect(snapshot.primaryFinding.relatedSkuId).toBe('QY-CLEAN-001')
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
})
