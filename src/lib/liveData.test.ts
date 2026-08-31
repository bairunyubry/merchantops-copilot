import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'
import { buildDashboardSnapshot } from './dashboard'
import { demoLiveUrl, demoVersionFromUrl, nextDemoVersion, sourceIdForUrl, withDemoVersion } from './dataSource'
import { evaluateScenario } from './metrics'
import { continueMonitoringCycle, createActionWorkOrder, evaluateWorkOrder, updateExecutionStatus } from './actions'
import type { FindingCode } from '../types/data'

const versions: Array<{ version: number; latest: string; expected: FindingCode[] }> = [
  { version: 1, latest: '2026-08-29', expected: [] },
  { version: 2, latest: '2026-09-05', expected: ['conversion_drop', 'refund_spike', 'sku_concentration', 'fulfillment_delay', 'inventory_shortage'] },
  { version: 3, latest: '2026-09-12', expected: ['fulfillment_delay', 'inventory_shortage'] },
  { version: 4, latest: '2026-09-19', expected: [] },
]

function rowsFor(version: number) {
  const text = readFileSync(resolve(`public/data/live/qingyou-live-v${version}-30d.csv`), 'utf8')
  const imported = parseMerchantCsv(text)
  expect(imported.blocked).toBe(false)
  expect(imported.rows).toHaveLength(360)
  return imported.rows
}

describe('模拟在线 CSV v1—v4', () => {
  it.each(versions)('v$version 提供完整滚动快照并命中预期规则', ({ version, latest, expected }) => {
    const rows = rowsFor(version)
    const evaluation = evaluateScenario(rows)
    expect(evaluation.latestCompleteDate).toBe(latest)
    expect(evaluation.findingCodes.sort()).toEqual([...expected].sort())
    expect(new Set(rows.map((row) => row.date))).toHaveLength(30)
    expect(new Set(rows.map((row) => row.sku_id))).toHaveLength(12)
  })

  it('呈现正常、异常、改善、恢复的确定性变化', () => {
    const snapshots = [1, 2, 3, 4].map((version) => buildDashboardSnapshot(rowsFor(version)))
    expect(snapshots[0].findings).toHaveLength(0)
    expect(snapshots[1].findings).toHaveLength(4)
    expect(snapshots[2].current.refundOrderRate).toBeLessThan(snapshots[1].current.refundOrderRate ?? 0)
    expect(snapshots[2].current.ship48hRate).toBeGreaterThan(snapshots[1].current.ship48hRate ?? 1)
    expect(snapshots[3].findings).toHaveLength(0)
    expect(snapshots[3].current.ship48hRate).toBeGreaterThanOrEqual(0.9)
  })

  it('稳定推进模拟接口版本并保持同一数据源标识', () => {
    const first = demoLiveUrl('https://merchantops.example', 1)
    expect(demoVersionFromUrl(first)).toBe(1)
    expect(nextDemoVersion(first)).toBe(2)
    expect(demoVersionFromUrl(withDemoVersion(first, 4))).toBe(4)
    expect(nextDemoVersion(withDemoVersion(first, 4))).toBe(4)
    expect(sourceIdForUrl(first)).toBe('qingyou-live')
  })

  it('用同一 scope 将 v2 异常工单联动到 v3 改善和 v4 恢复', () => {
    const v2Rows = rowsFor(2)
    const v2 = buildDashboardSnapshot(v2Rows)
    const fulfillmentFinding = v2.findings.find((finding) => finding.category === 'fulfillment')
    expect(fulfillmentFinding).toBeDefined()
    let order = createActionWorkOrder({
      finding: fulfillmentFinding!,
      snapshot: v2,
      scopeKey: 'online:qingyou-live',
      title: '核查延迟订单与履约环节',
      actionText: fulfillmentFinding!.ruleSuggestion,
      dueDate: '2026-09-06',
      reviewDate: '2026-09-12',
    })
    order = updateExecutionStatus(order, 'executed', v2.latestCompleteDate)

    const v3 = buildDashboardSnapshot(rowsFor(3))
    const firstCycle = evaluateWorkOrder(order, rowsFor(3), v3.latestCompleteDate)
    expect(firstCycle.status).toBe('improving')

    order = { ...continueMonitoringCycle({ ...order, monitoringResult: firstCycle }, v3.latestCompleteDate) }
    const v4 = buildDashboardSnapshot(rowsFor(4))
    const secondCycle = evaluateWorkOrder(order, rowsFor(4), v4.latestCompleteDate)
    expect(secondCycle.status).toBe('recovered')
  })
})
