import type { DashboardSnapshot, DiagnosisFinding } from './dashboard'
import { summarizePeriod } from './metrics'
import type { StoreDataRow } from '../types/data'

export type ExecutionStatus = 'pending' | 'in_progress' | 'executed' | 'closed'
export type MonitorStatus = 'not_started' | 'monitoring' | 'improving' | 'recovered' | 'not_recovered' | 'insufficient_data'
export type ActionSource = 'rule' | 'ai' | 'manual' | 'demo'
export type MonitorMetric = 'refund_rate' | 'conversion_rate' | 'ship_48h_rate' | 'inventory_cover_days'

export interface FindingSnapshot {
  findingId: string
  findingCode: DiagnosisFinding['code']
  title: string
  severity: DiagnosisFinding['severity']
  relatedSkuId?: string
  relatedSkuName?: string
  periodFrom: string
  periodTo: string
  currentLabel: string
  baselineLabel: string
  thresholdLabel: string
  evidence: string[]
}

export interface MonitoringPlan {
  metric: MonitorMetric
  metricLabel: string
  direction: 'higher' | 'lower'
  creationValue: number
  targetValue: number
  targetLabel: string
  windowDays: number
  relatedSkuId?: string
  cycleStart?: string
}

export interface MonitoringResult {
  status: MonitorStatus
  currentValue?: number
  delta?: number
  observationFrom?: string
  observationTo?: string
  evaluatedAt: string
  reason: string
  evidence: string[]
}

export interface ActionTimelineEvent {
  id: string
  date: string
  type: 'created' | 'status' | 'monitoring' | 'note'
  text: string
}

export interface ActionWorkOrder {
  id: string
  scopeKey: string
  title: string
  actionText: string
  source: ActionSource
  findingSnapshot?: FindingSnapshot
  expectedImpact: number
  confidence: number
  effort: number
  priority: number
  executionStatus: ExecutionStatus
  createdAt: string
  dueDate: string
  reviewDate: string
  executedAt?: string
  closedAt?: string
  notes: string
  monitoringPlan: MonitoringPlan
  monitoringResult: MonitoringResult
  timeline: ActionTimelineEvent[]
  isDemo?: boolean
}

export const ACTION_STORAGE_KEY = 'merchantops.action-work-orders.v1'

const parseLabelNumber = (label: string) => {
  const match = label.match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const formatRate = (value: number) => `${(value * 100).toFixed(2)}%`

export const formatMonitorValue = (metric: MonitorMetric, value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (metric === 'inventory_cover_days') return `${value.toFixed(1)} 天`
  return formatRate(value)
}

export const EXECUTION_LABEL: Record<ExecutionStatus, string> = {
  pending: '待处理',
  in_progress: '进行中',
  executed: '已执行',
  closed: '已关闭',
}

export const MONITOR_LABEL: Record<MonitorStatus, string> = {
  not_started: '未开始',
  monitoring: '监控中',
  improving: '改善中',
  recovered: '已恢复',
  not_recovered: '未恢复',
  insufficient_data: '数据不足',
}

function monitoringPlanForFinding(
  finding: DiagnosisFinding,
  snapshot: DashboardSnapshot,
): MonitoringPlan {
  if (finding.category === 'after_sales') {
    const creationValue = snapshot.current.refundOrderRate ?? parseLabelNumber(finding.metric.currentLabel) / 100
    const targetValue = (snapshot.baseline.refundOrderRate ?? 0) + 0.03
    return {
      metric: 'refund_rate',
      metricLabel: '退款率',
      direction: 'lower',
      creationValue,
      targetValue,
      targetLabel: `< ${formatRate(targetValue)}`,
      windowDays: 7,
      relatedSkuId: finding.relatedSkuId,
    }
  }

  if (finding.category === 'conversion') {
    const creationValue = snapshot.current.clickOrderCvr ?? parseLabelNumber(finding.metric.currentLabel) / 100
    const targetValue = (snapshot.baseline.clickOrderCvr ?? 0) * 0.8
    return {
      metric: 'conversion_rate',
      metricLabel: '点击—支付转化率',
      direction: 'higher',
      creationValue,
      targetValue,
      targetLabel: `≥ ${formatRate(targetValue)}`,
      windowDays: 7,
      relatedSkuId: finding.relatedSkuId,
    }
  }

  if (finding.category === 'fulfillment') {
    return {
      metric: 'ship_48h_rate',
      metricLabel: '48 小时发货达成率',
      direction: 'higher',
      creationValue: snapshot.current.ship48hRate ?? parseLabelNumber(finding.metric.currentLabel) / 100,
      targetValue: 0.9,
      targetLabel: '≥ 90.00%',
      windowDays: 7,
      relatedSkuId: finding.relatedSkuId,
    }
  }

  const creationValue = parseLabelNumber(finding.metric.currentLabel)
  return {
    metric: 'inventory_cover_days',
    metricLabel: '库存覆盖天数',
    direction: 'higher',
    creationValue,
    targetValue: 7,
    targetLabel: '≥ 7.0 天',
    windowDays: 7,
    relatedSkuId: finding.relatedSkuId,
  }
}

const priorityFor = (expectedImpact: number, confidence: number, effort: number) =>
  Math.round(expectedImpact * confidence / Math.max(effort, 1) * 10) / 10

export function createActionWorkOrder({
  finding,
  snapshot,
  scopeKey,
  title,
  actionText,
  dueDate,
  reviewDate,
  source = 'rule',
  effort = 2,
  createdAt = snapshot.latestCompleteDate,
}: {
  finding: DiagnosisFinding
  snapshot: DashboardSnapshot
  scopeKey: string
  title: string
  actionText: string
  dueDate: string
  reviewDate: string
  source?: ActionSource
  effort?: number
  createdAt?: string
}): ActionWorkOrder {
  const expectedImpact = finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1
  const confidence = finding.confidence
  const id = `WO-${createdAt.replaceAll('-', '')}-${Date.now().toString(36).toUpperCase()}`
  return {
    id,
    scopeKey,
    title,
    actionText,
    source,
    findingSnapshot: {
      findingId: finding.id,
      findingCode: finding.code,
      title: finding.title,
      severity: finding.severity,
      relatedSkuId: finding.relatedSkuId,
      relatedSkuName: finding.relatedSkuName,
      periodFrom: snapshot.current.from,
      periodTo: snapshot.current.to,
      currentLabel: finding.metric.currentLabel,
      baselineLabel: finding.metric.baselineLabel,
      thresholdLabel: finding.metric.thresholdLabel,
      evidence: [...finding.evidence],
    },
    expectedImpact,
    confidence,
    effort,
    priority: priorityFor(expectedImpact, confidence, effort),
    executionStatus: 'pending',
    createdAt,
    dueDate,
    reviewDate,
    notes: '',
    monitoringPlan: monitoringPlanForFinding(finding, snapshot),
    monitoringResult: {
      status: 'not_started',
      evaluatedAt: snapshot.latestCompleteDate,
      reason: '行动尚未标记为已执行，监控窗口还未开始。',
      evidence: ['记录实际执行日期后，系统开始计算行动后 7 个完整自然日。'],
    },
    timeline: [{
      id: `${id}-created`,
      date: createdAt,
      type: 'created',
      text: '创建工单并冻结关联异常的数据快照与监控口径',
    }],
  }
}

function metricValue(
  plan: MonitoringPlan,
  rows: StoreDataRow[],
  from: string,
  to: string,
): number | null {
  const scopedRows = plan.relatedSkuId && plan.metric === 'inventory_cover_days'
    ? rows.filter((row) => row.sku_id === plan.relatedSkuId)
    : rows
  if (scopedRows.length === 0) return null

  const summary = summarizePeriod(scopedRows, from, to)
  if (plan.metric === 'refund_rate') return summary.refundOrderRate
  if (plan.metric === 'conversion_rate') return summary.clickOrderCvr
  if (plan.metric === 'ship_48h_rate') return summary.ship48hRate

  const periodRows = scopedRows.filter((row) => row.date >= from && row.date <= to)
  const latest = [...periodRows].sort((a, b) => b.date.localeCompare(a.date))[0]
  const units = periodRows.reduce((sum, row) => sum + row.units_sold, 0)
  const days = new Set(periodRows.map((row) => row.date)).size
  if (!latest || units <= 0 || days === 0) return null
  return latest.stock / (units / days)
}

export function evaluateWorkOrder(
  order: ActionWorkOrder,
  rows: StoreDataRow[],
  latestCompleteDate: string,
): MonitoringResult {
  if (order.executionStatus === 'closed') return order.monitoringResult
  if (order.executionStatus !== 'executed' || !order.executedAt) {
    return {
      status: 'not_started',
      evaluatedAt: latestCompleteDate,
      reason: '行动尚未标记为已执行，监控窗口还未开始。',
      evidence: ['执行完成后记录实际日期，系统才会读取行动后的经营数据。'],
    }
  }

  const observationAnchor = order.monitoringPlan.cycleStart ?? order.executedAt
  const observationFrom = shiftDate(observationAnchor, 1)
  const observationTo = shiftDate(observationAnchor, order.monitoringPlan.windowDays)
  const postActionRows = rows.filter((row) => row.date >= observationFrom && row.date <= latestCompleteDate)
  if (postActionRows.length === 0) {
    return {
      status: 'insufficient_data',
      observationFrom,
      observationTo,
      evaluatedAt: latestCompleteDate,
      reason: '当前数据没有覆盖行动执行后的日期。',
      evidence: [`需要补充 ${observationFrom} 之后的经营数据。`],
    }
  }

  const effectiveTo = latestCompleteDate < observationTo ? latestCompleteDate : observationTo
  const currentValue = metricValue(order.monitoringPlan, rows, observationFrom, effectiveTo)
  if (currentValue === null) {
    return {
      status: 'insufficient_data',
      observationFrom,
      observationTo,
      evaluatedAt: latestCompleteDate,
      reason: '行动后的数据缺少计算监控指标所需的有效样本。',
      evidence: [`无法计算${order.monitoringPlan.metricLabel}，请检查字段与关联 SKU。`],
    }
  }

  const delta = currentValue - order.monitoringPlan.creationValue
  if (latestCompleteDate < observationTo) {
    const daysCovered = new Set(postActionRows.map((row) => row.date)).size
    return {
      status: 'monitoring',
      currentValue,
      delta,
      observationFrom,
      observationTo,
      evaluatedAt: latestCompleteDate,
      reason: `监控窗口尚未完整，目前覆盖 ${daysCovered}/${order.monitoringPlan.windowDays} 个自然日。`,
      evidence: [`当前${order.monitoringPlan.metricLabel} ${formatMonitorValue(order.monitoringPlan.metric, currentValue)}`, `完整观察窗口截至 ${observationTo}`],
    }
  }

  const recovered = order.monitoringPlan.direction === 'higher'
    ? currentValue >= order.monitoringPlan.targetValue
    : currentValue < order.monitoringPlan.targetValue
  const improved = order.monitoringPlan.direction === 'higher'
    ? currentValue > order.monitoringPlan.creationValue
    : currentValue < order.monitoringPlan.creationValue
  const status: MonitorStatus = recovered ? 'recovered' : improved ? 'improving' : 'not_recovered'
  return {
    status,
    currentValue,
    delta,
    observationFrom,
    observationTo,
    evaluatedAt: latestCompleteDate,
    reason: recovered
      ? `完整观察窗口内${order.monitoringPlan.metricLabel}达到恢复规则。`
      : improved
        ? `${order.monitoringPlan.metricLabel}方向改善，但仍未达到恢复规则。`
        : `${order.monitoringPlan.metricLabel}未出现有效改善，原问题仍需继续处理。`,
    evidence: [
      `创建时 ${formatMonitorValue(order.monitoringPlan.metric, order.monitoringPlan.creationValue)}`,
      `行动后 ${formatMonitorValue(order.monitoringPlan.metric, currentValue)}`,
      `恢复规则 ${order.monitoringPlan.targetLabel}`,
      `观察窗口 ${observationFrom} 至 ${observationTo}`,
    ],
  }
}

export function applyMonitoringResult(order: ActionWorkOrder, result: MonitoringResult): ActionWorkOrder {
  const unchanged = order.monitoringResult.status === result.status
    && order.monitoringResult.currentValue === result.currentValue
    && order.monitoringResult.evaluatedAt === result.evaluatedAt
  if (unchanged) return order
  const eventText = `数据监控反馈“${MONITOR_LABEL[result.status]}”：${result.reason}`
  const timeline = order.timeline.some((event) => event.date === result.evaluatedAt && event.text === eventText)
    ? order.timeline
    : [...order.timeline, {
        id: `${order.id}-monitor-${result.evaluatedAt}-${result.status}`,
        date: result.evaluatedAt,
        type: 'monitoring' as const,
        text: eventText,
      }]
  return { ...order, monitoringResult: result, timeline }
}

export function updateExecutionStatus(
  order: ActionWorkOrder,
  status: ExecutionStatus,
  date: string,
): ActionWorkOrder {
  if (status === 'closed' && order.monitoringResult.status !== 'recovered') return order
  const text = status === 'executed'
    ? '标记行动已执行，开始等待行动后监控数据'
    : status === 'closed'
      ? '用户确认问题解决并关闭工单'
      : `执行状态更新为“${EXECUTION_LABEL[status]}”`
  return {
    ...order,
    executionStatus: status,
    executedAt: status === 'executed' ? date : order.executedAt,
    closedAt: status === 'closed' ? date : order.closedAt,
    timeline: [...order.timeline, { id: `${order.id}-status-${Date.now()}`, date, type: 'status', text }],
  }
}

export function continueMonitoringCycle(order: ActionWorkOrder, date: string): ActionWorkOrder {
  if (order.executionStatus !== 'executed' || !order.executedAt) return order
  const cycleStart = order.monitoringResult.observationTo
    ?? order.monitoringPlan.cycleStart
    ?? order.executedAt
  return {
    ...order,
    reviewDate: shiftDate(cycleStart, order.monitoringPlan.windowDays),
    monitoringPlan: { ...order.monitoringPlan, cycleStart },
    monitoringResult: {
      status: 'insufficient_data',
      observationFrom: shiftDate(cycleStart, 1),
      observationTo: shiftDate(cycleStart, order.monitoringPlan.windowDays),
      evaluatedAt: date,
      reason: '已开启下一观察周期，等待补充新的经营数据。',
      evidence: [`下一周期从 ${shiftDate(cycleStart, 1)} 开始，共观察 ${order.monitoringPlan.windowDays} 个完整自然日。`],
    },
    timeline: [...order.timeline, {
      id: `${order.id}-continue-${Date.now()}`,
      date,
      type: 'note',
      text: '用户选择继续观察一个周期，系统保留原执行日期并顺延监控窗口',
    }],
  }
}

export function buildDemoWorkOrders(
  snapshot: DashboardSnapshot,
  scopeKey: string,
): ActionWorkOrder[] {
  return snapshot.findings.map((finding, index) => {
    const order = createActionWorkOrder({
      finding,
      snapshot,
      scopeKey,
      title: finding.ruleSuggestion.replace(/[。.]$/, ''),
      actionText: finding.ruleSuggestion,
      dueDate: shiftDate(snapshot.latestCompleteDate, index + 2),
      reviewDate: shiftDate(snapshot.latestCompleteDate, 7),
      source: 'demo',
      effort: Math.min(3, 1 + index),
      createdAt: shiftDate(snapshot.latestCompleteDate, -7 + Math.min(index, 3)),
    })
    const executionStatus: ExecutionStatus = index < 2 ? 'executed' : index === 2 ? 'in_progress' : 'pending'
    const executedAt = executionStatus === 'executed'
      ? shiftDate(snapshot.latestCompleteDate, index === 0 ? -7 : -3)
      : undefined
    return {
      ...order,
      id: `DEMO-${scopeKey}-${index + 1}`,
      executionStatus,
      executedAt,
      reviewDate: executedAt ? shiftDate(executedAt, order.monitoringPlan.windowDays) : order.reviewDate,
      isDemo: true,
      timeline: [
        { id: `demo-${index}-created`, date: order.createdAt, type: 'created', text: '创建演示工单并冻结异常快照' },
        ...(executedAt ? [{ id: `demo-${index}-executed`, date: executedAt, type: 'status' as const, text: '标记行动已执行，开始等待行动后监控数据' }] : []),
      ],
    }
  })
}

export function readStoredActions(storage: Pick<Storage, 'getItem'> = window.localStorage): ActionWorkOrder[] {
  try {
    const raw = storage.getItem(ACTION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeStoredActions(
  actions: ActionWorkOrder[],
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  storage.setItem(ACTION_STORAGE_KEY, JSON.stringify(actions))
}

export const actionDate = { shift: shiftDate }
