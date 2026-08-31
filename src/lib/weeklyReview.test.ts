import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyMonitoringResult, buildDemoWorkOrders, evaluateWorkOrder } from './actions'
import { parseMerchantCsv } from './csv'
import { buildDashboardSnapshot } from './dashboard'
import { buildWeeklyReview, getReviewPeriods } from './weeklyReview'

const loadRows = () => parseMerchantCsv(
  readFileSync(resolve('public/data/scenarios/qingyou-combo-all-round-30d.csv'), 'utf8'),
).rows

describe('weekly review', () => {
  it('最新数据未对齐周日时生成阶段复盘，同时保留历史正式自然周', () => {
    const periods = getReviewPeriods(loadRows())

    expect(periods[0].from).toBe('2026-08-23')
    expect(periods[0].to).toBe('2026-08-29')
    expect(periods[0].isFormal).toBe(false)
    expect(periods.some((period) => period.from === '2026-08-17' && period.to === '2026-08-23' && period.isFormal)).toBe(true)
  })

  it('数据完整覆盖周一至周日时自动生成正式周报', () => {
    const rows = loadRows()
    const lastDay = rows.filter((row) => row.date === '2026-08-29').map((row) => ({ ...row, date: '2026-08-30' }))
    const periods = getReviewPeriods([...rows, ...lastDay])

    expect(periods[0].from).toBe('2026-08-24')
    expect(periods[0].to).toBe('2026-08-30')
    expect(periods[0].isFormal).toBe(true)
    expect(periods[0].dataComplete).toBe(true)
  })

  it('周报指标使用所选周期并关联同数据范围工单', () => {
    const rows = loadRows()
    const snapshot = buildDashboardSnapshot(rows)
    const period = getReviewPeriods(rows)[0]
    const orders = buildDemoWorkOrders(snapshot, 'scenario:combo_all_round').map((order) =>
      applyMonitoringResult(order, evaluateWorkOrder(order, rows, snapshot.latestCompleteDate)),
    )
    const review = buildWeeklyReview(rows, period, orders)

    expect(review.current.from).toBe(period.from)
    expect(review.current.to).toBe(period.to)
    expect(review.kpis).toHaveLength(5)
    expect(review.findings).toHaveLength(4)
    expect(review.orders).toHaveLength(4)
    expect(review.coveredFindingCount).toBe(4)
    expect(review.actionReviews.length).toBeGreaterThan(0)
    expect(review.fallbackSummary).toContain('当前最高优先级问题')
  })

  it('只有已恢复工单会进入候选经验', () => {
    const rows = loadRows()
    const snapshot = buildDashboardSnapshot(rows)
    const period = getReviewPeriods(rows)[0]
    const [order] = buildDemoWorkOrders(snapshot, 'scenario:combo_all_round')
    const recovered = {
      ...order,
      monitoringResult: {
        ...order.monitoringResult,
        status: 'recovered' as const,
        evaluatedAt: period.to,
        reason: '完整观察窗口内指标达到恢复规则。',
      },
    }
    const review = buildWeeklyReview(rows, period, [recovered])

    expect(review.experienceCandidate?.id).toBe(recovered.id)
    expect(review.actionReviews[0].hypothesisStatus).toBe('supported')
  })
})
