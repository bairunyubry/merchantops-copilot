import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'
import { evaluateScenario } from './metrics'
import { buildDashboardSnapshot } from './dashboard'
import type { FindingCode } from '../types/data'

const scenarios: Array<{ file: string; expected: FindingCode[] }> = [
  { file: 'qingyou-conversion-drop-30d.csv', expected: ['conversion_drop'] },
  { file: 'qingyou-refund-spike-30d.csv', expected: ['refund_spike'] },
  { file: 'qingyou-fulfillment-delay-30d.csv', expected: ['fulfillment_delay'] },
  { file: 'qingyou-inventory-shortage-30d.csv', expected: ['inventory_shortage'] },
  {
    file: 'qingyou-sku-concentration-30d.csv',
    expected: ['refund_spike', 'sku_concentration'],
  },
  { file: 'qingyou-combo-growth-pressure-30d.csv', expected: ['conversion_drop', 'refund_spike'] },
  { file: 'qingyou-combo-service-breakdown-30d.csv', expected: ['refund_spike', 'sku_concentration', 'fulfillment_delay', 'inventory_shortage'] },
  { file: 'qingyou-combo-all-round-30d.csv', expected: ['conversion_drop', 'refund_spike', 'sku_concentration', 'fulfillment_delay', 'inventory_shortage'] },
  { file: 'qingyou-combo-cashflow-risk-30d.csv', expected: ['conversion_drop', 'refund_spike', 'inventory_shortage'] },
  { file: 'qingyou-combo-operations-overload-30d.csv', expected: ['conversion_drop', 'fulfillment_delay', 'inventory_shortage'] },
]

describe('30 天平行示例数据', () => {
  it.each(scenarios)('$file 包含完整数据并命中预期规则', ({ file, expected }) => {
    const text = readFileSync(resolve('public/data/scenarios', file), 'utf8')
    const imported = parseMerchantCsv(text)
    expect(imported.blocked).toBe(false)
    expect(imported.skippedRows).toBe(0)
    expect(imported.rows).toHaveLength(360)
    expect(new Set(imported.rows.map((row) => row.date))).toHaveLength(30)
    expect(new Set(imported.rows.map((row) => row.sku_id))).toHaveLength(12)

    const evaluation = evaluateScenario(imported.rows)
    expect(evaluation.latestCompleteDate).toBe('2026-08-29')
    expect(evaluation.findingCodes.sort()).toEqual([...expected].sort())
  })

  it.each([
    ['qingyou-combo-growth-pressure-30d.csv', 2],
    ['qingyou-combo-service-breakdown-30d.csv', 3],
    ['qingyou-combo-all-round-30d.csv', 4],
    ['qingyou-combo-cashflow-risk-30d.csv', 3],
    ['qingyou-combo-operations-overload-30d.csv', 3],
  ] as const)('$0 会生成 $1 个独立且有序的经营问题', (file, independentCount) => {
    const imported = parseMerchantCsv(readFileSync(resolve('public/data/scenarios', file), 'utf8'))
    const snapshot = buildDashboardSnapshot(imported.rows)
    expect(snapshot.findings).toHaveLength(independentCount)
    expect(new Set(snapshot.findings.map((finding) => finding.category))).toHaveLength(independentCount)
    expect(snapshot.findings.map((finding) => finding.priority.total)).toEqual(
      [...snapshot.findings].map((finding) => finding.priority.total).sort((a, b) => b - a),
    )
  })
})
