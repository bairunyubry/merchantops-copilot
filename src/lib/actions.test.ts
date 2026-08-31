import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'
import { buildDashboardSnapshot } from './dashboard'
import {
  ACTION_STORAGE_KEY,
  applyMonitoringResult,
  continueMonitoringCycle,
  createActionWorkOrder,
  evaluateWorkOrder,
  readStoredActions,
  updateExecutionStatus,
  writeStoredActions,
  type ActionWorkOrder,
} from './actions'

const loadRows = (file = 'qingyou-refund-spike-30d.csv') => {
  const imported = parseMerchantCsv(readFileSync(resolve('public/data/scenarios', file), 'utf8'))
  return imported.rows
}

const fixture = () => {
  const rows = loadRows()
  const snapshot = buildDashboardSnapshot(rows)
  const finding = snapshot.findings.find((item) => item.category === 'after_sales')!
  const order = createActionWorkOrder({
    finding,
    snapshot,
    scopeKey: 'scenario:refund_spike',
    title: '排查高退款 SKU',
    actionText: finding.ruleSuggestion,
    dueDate: '2026-08-25',
    reviewDate: '2026-08-29',
    createdAt: '2026-08-22',
  })
  return { rows, snapshot, finding, order }
}

describe('action work order lifecycle', () => {
  it('创建时冻结异常证据和 7 日监控口径', () => {
    const { finding, order } = fixture()

    expect(order.findingSnapshot?.findingId).toBe(finding.id)
    expect(order.findingSnapshot?.evidence).toEqual(finding.evidence)
    expect(order.findingSnapshot?.evidence).not.toBe(finding.evidence)
    expect(order.monitoringPlan.metric).toBe('refund_rate')
    expect(order.monitoringPlan.windowDays).toBe(7)
    expect(order.executionStatus).toBe('pending')
    expect(order.monitoringResult.status).toBe('not_started')
  })

  it('未执行时不会把数据变化误判为行动效果', () => {
    const { rows, snapshot, order } = fixture()
    const result = evaluateWorkOrder(order, rows, snapshot.latestCompleteDate)
    expect(result.status).toBe('not_started')
    expect(result.observationFrom).toBeUndefined()
  })

  it('观察窗口不满 7 个自然日时保持监控中', () => {
    const { rows, order } = fixture()
    const executed = updateExecutionStatus(order, 'executed', '2026-08-26')
    const result = evaluateWorkOrder(executed, rows, '2026-08-29')

    expect(result.status).toBe('monitoring')
    expect(result.observationFrom).toBe('2026-08-27')
    expect(result.observationTo).toBe('2026-09-02')
    expect(result.reason).toContain('3/7')
  })

  it('完整窗口达到原规则阈值后反馈已恢复，但不自动关闭', () => {
    const { rows, order } = fixture()
    const recoveredRows = rows.map((row) => row.date >= '2026-08-23'
      ? { ...row, refund_orders: 0, refund_amount: 0 }
      : row)
    const executed = updateExecutionStatus(order, 'executed', '2026-08-22')
    const result = evaluateWorkOrder(executed, recoveredRows, '2026-08-29')

    expect(result.status).toBe('recovered')
    expect(result.currentValue).toBe(0)
    expect(executed.executionStatus).toBe('executed')
  })

  it('完整窗口仍未改善时反馈未恢复', () => {
    const { rows, order } = fixture()
    const executed = updateExecutionStatus(order, 'executed', '2026-08-22')
    const result = evaluateWorkOrder(executed, rows, '2026-08-29')

    expect(result.status).toBe('not_recovered')
    expect(result.evidence).toHaveLength(4)
  })

  it('监控结果写入时间线且重复计算不产生重复记录', () => {
    const { rows, order } = fixture()
    const executed = updateExecutionStatus(order, 'executed', '2026-08-22')
    const result = evaluateWorkOrder(executed, rows, '2026-08-29')
    const first = applyMonitoringResult(executed, result)
    const second = applyMonitoringResult(first, result)

    expect(first.timeline).toHaveLength(executed.timeline.length + 1)
    expect(second).toBe(first)
  })

  it('只有系统判定已恢复后用户才能确认关闭', () => {
    const { rows, order } = fixture()
    const executed = updateExecutionStatus(order, 'executed', '2026-08-22')
    const notRecovered = applyMonitoringResult(executed, evaluateWorkOrder(executed, rows, '2026-08-29'))
    expect(updateExecutionStatus(notRecovered, 'closed', '2026-08-29')).toBe(notRecovered)

    const recoveredRows = rows.map((row) => row.date >= '2026-08-23'
      ? { ...row, refund_orders: 0, refund_amount: 0 }
      : row)
    const recovered = applyMonitoringResult(executed, evaluateWorkOrder(executed, recoveredRows, '2026-08-29'))
    expect(updateExecutionStatus(recovered, 'closed', '2026-08-29').executionStatus).toBe('closed')
  })

  it('继续观察会保留实际执行日并把监控窗口顺延一周期', () => {
    const { rows, order } = fixture()
    const executed = updateExecutionStatus(order, 'executed', '2026-08-22')
    const monitored = applyMonitoringResult(executed, evaluateWorkOrder(executed, rows, '2026-08-29'))
    const continued = continueMonitoringCycle(monitored, '2026-08-29')

    expect(continued.executedAt).toBe('2026-08-22')
    expect(continued.monitoringPlan.cycleStart).toBe('2026-08-29')
    expect(continued.monitoringResult.observationFrom).toBe('2026-08-30')
    expect(continued.monitoringResult.observationTo).toBe('2026-09-05')
    expect(continued.reviewDate).toBe('2026-09-05')
  })

  it('工单可写入和恢复本地存储，损坏内容安全降级为空列表', () => {
    const { order } = fixture()
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    writeStoredActions([order], storage)
    expect(values.has(ACTION_STORAGE_KEY)).toBe(true)
    expect(readStoredActions(storage)).toEqual([order])

    values.set(ACTION_STORAGE_KEY, '{broken')
    expect(readStoredActions(storage)).toEqual([] as ActionWorkOrder[])
  })
})
