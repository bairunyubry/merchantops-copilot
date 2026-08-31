import type { ActionWorkOrder } from './actions'
import { buildDashboardSnapshot, type DashboardSnapshot, type DiagnosisFinding } from './dashboard'
import { summarizePeriod } from './metrics'
import type { PeriodSummary, StoreDataRow } from '../types/data'

export interface ReviewPeriod {
  id: string
  from: string
  to: string
  baselineFrom: string
  baselineTo: string
  label: string
  isFormal: boolean
  dataComplete: boolean
}

export interface WeeklyKpi {
  id: 'gmv' | 'net_revenue' | 'conversion_rate' | 'refund_rate' | 'ship_48h_rate'
  label: string
  current: number | null
  baseline: number | null
  delta: number | null
  deltaKind: 'ratio' | 'pp'
  risk: boolean
}

export interface WeeklyActionReview {
  order: ActionWorkOrder
  hypothesisStatus: 'supported' | 'partially_supported' | 'unsupported' | 'pending'
}

export interface WeeklyReviewData {
  period: ReviewPeriod
  snapshot: DashboardSnapshot
  current: PeriodSummary
  baseline: PeriodSummary
  kpis: WeeklyKpi[]
  orders: ActionWorkOrder[]
  actionReviews: WeeklyActionReview[]
  findings: DiagnosisFinding[]
  coveredFindingCount: number
  reviewableCount: number
  recoveredCount: number
  closedCount: number
  fallbackSummary: string
  experienceCandidate?: ActionWorkOrder
}

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1
const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0

const dateRange = (from: string, to: string) => {
  const dates: string[] = []
  for (let current = from; current <= to; current = shiftDate(current, 1)) dates.push(current)
  return dates
}

const formatPeriodLabel = (from: string, to: string, isFormal: boolean) =>
  `${from.slice(5).replace('-', '.')}–${to.slice(5).replace('-', '.')} · ${isFormal ? '正式周报' : '阶段复盘'}`

export function getReviewPeriods(rows: StoreDataRow[]): ReviewPeriod[] {
  if (rows.length === 0) return []
  const dates = new Set(rows.map((row) => row.date))
  const sortedDates = [...dates].sort()
  const earliest = sortedDates[0]
  const latest = sortedDates.at(-1)!
  const hasCompleteRange = (from: string, to: string) => dateRange(from, to).every((date) => dates.has(date))
  const makePeriod = (from: string, to: string, isFormal: boolean): ReviewPeriod => {
    const baselineFrom = shiftDate(from, -7)
    const baselineTo = shiftDate(from, -1)
    const dataComplete = hasCompleteRange(from, to) && hasCompleteRange(baselineFrom, baselineTo)
    return {
      id: `${from}_${to}`,
      from,
      to,
      baselineFrom,
      baselineTo,
      label: formatPeriodLabel(from, to, isFormal && dataComplete),
      isFormal: isFormal && dataComplete,
      dataComplete,
    }
  }

  const activeFrom = shiftDate(latest, -6)
  const activeAligned = isMonday(activeFrom) && isSunday(latest)
  const periods: ReviewPeriod[] = [makePeriod(activeFrom, latest, activeAligned)]

  const latestDate = new Date(`${latest}T00:00:00Z`)
  const daysSinceSunday = latestDate.getUTCDay()
  let sunday = shiftDate(latest, -daysSinceSunday)
  while (shiftDate(sunday, -6) >= earliest) {
    const monday = shiftDate(sunday, -6)
    const candidate = makePeriod(monday, sunday, true)
    if (candidate.dataComplete && !periods.some((period) => period.id === candidate.id)) periods.push(candidate)
    sunday = shiftDate(sunday, -7)
  }

  return periods.sort((a, b) => b.to.localeCompare(a.to))
}

const ratioDelta = (current: number, baseline: number) => baseline === 0 ? null : (current - baseline) / baseline
const ppDelta = (current: number | null, baseline: number | null) =>
  current === null || baseline === null ? null : (current - baseline) * 100

const hypothesisFor = (order: ActionWorkOrder): WeeklyActionReview['hypothesisStatus'] => {
  if (order.monitoringResult.status === 'recovered') return 'supported'
  if (order.monitoringResult.status === 'improving') return 'partially_supported'
  if (order.monitoringResult.status === 'not_recovered') return 'unsupported'
  return 'pending'
}

function fallbackSummaryFor(
  current: PeriodSummary,
  baseline: PeriodSummary,
  findings: DiagnosisFinding[],
) {
  const gmvChange = ratioDelta(current.gmv, baseline.gmv)
  const currentNet = current.gmv - current.refundAmount
  const baselineNet = baseline.gmv - baseline.refundAmount
  const netChange = ratioDelta(currentNet, baselineNet)
  const gmvText = gmvChange === null ? 'GMV 暂无有效对比' : `GMV 较前期${gmvChange >= 0 ? '增长' : '下降'} ${Math.abs(gmvChange * 100).toFixed(1)}%`
  const netText = netChange === null ? '净收入暂无有效对比' : `净收入${netChange >= 0 ? '改善' : '下降'} ${Math.abs(netChange * 100).toFixed(1)}%`
  const issueText = findings.length > 0 ? `当前最高优先级问题是“${findings[0].title}”` : '本期没有触发规则阈值的异常'
  return `${gmvText}，${netText}；${issueText}。`
}

export function buildWeeklyReview(
  rows: StoreDataRow[],
  period: ReviewPeriod,
  orders: ActionWorkOrder[],
): WeeklyReviewData {
  const periodRows = rows.filter((row) => row.date <= period.to)
  const snapshot = buildDashboardSnapshot(periodRows)
  const current = summarizePeriod(rows, period.from, period.to)
  const baseline = summarizePeriod(rows, period.baselineFrom, period.baselineTo)
  const currentNet = current.gmv - current.refundAmount
  const baselineNet = baseline.gmv - baseline.refundAmount
  const kpis: WeeklyKpi[] = [
    { id: 'gmv', label: 'GMV', current: current.gmv, baseline: baseline.gmv, delta: ratioDelta(current.gmv, baseline.gmv), deltaKind: 'ratio', risk: current.gmv < baseline.gmv },
    { id: 'net_revenue', label: '净收入', current: currentNet, baseline: baselineNet, delta: ratioDelta(currentNet, baselineNet), deltaKind: 'ratio', risk: currentNet < baselineNet },
    { id: 'conversion_rate', label: '点击—支付转化率', current: current.clickOrderCvr, baseline: baseline.clickOrderCvr, delta: ratioDelta(current.clickOrderCvr ?? 0, baseline.clickOrderCvr ?? 0), deltaKind: 'ratio', risk: (current.clickOrderCvr ?? 0) < (baseline.clickOrderCvr ?? 0) },
    { id: 'refund_rate', label: '退款率', current: current.refundOrderRate, baseline: baseline.refundOrderRate, delta: ppDelta(current.refundOrderRate, baseline.refundOrderRate), deltaKind: 'pp', risk: (current.refundOrderRate ?? 0) > (baseline.refundOrderRate ?? 0) },
    { id: 'ship_48h_rate', label: '48 小时发货达成率', current: current.ship48hRate, baseline: baseline.ship48hRate, delta: ppDelta(current.ship48hRate, baseline.ship48hRate), deltaKind: 'pp', risk: (current.ship48hRate ?? 0) < 0.9 },
  ]

  const periodOrders = orders.filter((order) => order.createdAt <= period.to)
  const actionReviews = periodOrders
    .filter((order) => order.monitoringResult.evaluatedAt >= period.from && order.monitoringResult.evaluatedAt <= period.to)
    .map((order) => ({ order, hypothesisStatus: hypothesisFor(order) }))
    .sort((a, b) => b.order.priority - a.order.priority)
  const coveredFindingIds = new Set(periodOrders.map((order) => order.findingSnapshot?.findingId).filter(Boolean))
  const recovered = periodOrders.filter((order) => order.monitoringResult.status === 'recovered')

  return {
    period,
    snapshot,
    current,
    baseline,
    kpis,
    orders: periodOrders,
    actionReviews,
    findings: snapshot.findings,
    coveredFindingCount: snapshot.findings.filter((finding) => coveredFindingIds.has(finding.id)).length,
    reviewableCount: actionReviews.filter((item) => item.hypothesisStatus !== 'pending').length,
    recoveredCount: recovered.length,
    closedCount: periodOrders.filter((order) => order.executionStatus === 'closed').length,
    fallbackSummary: fallbackSummaryFor(current, baseline, snapshot.findings),
    experienceCandidate: recovered[0],
  }
}

export const weeklyReviewDate = { shift: shiftDate }
