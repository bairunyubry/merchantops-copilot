import { z } from 'zod'
import type { ActionWorkOrder } from './actions'
import type { DashboardSnapshot } from './dashboard'
import type { WeeklyReviewData } from './weeklyReview'
import type { CsvImportResult } from './csv'

export const aiSurfaceSchema = z.enum(['overview', 'diagnosis', 'review'])
export type AiSurface = z.infer<typeof aiSurfaceSchema>

const nullableNumber = z.number().finite().nullable()
const metricRecord = z.record(z.string(), nullableNumber)

export const aiFindingSchema = z.object({
  id: z.string().min(1).max(100),
  rank: z.number().int().positive(),
  category: z.string().min(1).max(40),
  title: z.string().min(1).max(180),
  severity: z.enum(['high', 'medium', 'low']),
  priorityScore: z.number().min(0).max(100),
  metric: z.object({
    label: z.string().max(80),
    current: z.string().max(80),
    baseline: z.string().max(80),
    delta: z.string().max(80),
    threshold: z.string().max(120),
  }),
  relatedSkuId: z.string().max(100).nullable(),
  relatedSkuName: z.string().max(160).nullable(),
  evidence: z.array(z.string().max(300)).max(8),
  caveat: z.string().max(500),
  ruleSuggestion: z.string().max(500),
  verification: z.string().max(500),
})

export const aiActionSchema = z.object({
  id: z.string().max(120),
  findingId: z.string().max(100).nullable(),
  title: z.string().max(180),
  actionText: z.string().max(500),
  executionStatus: z.string().max(40),
  monitorStatus: z.string().max(40),
  monitorMetric: z.string().max(80),
  creationValue: nullableNumber,
  latestValue: nullableNumber,
  targetLabel: z.string().max(120),
  monitorReason: z.string().max(500),
})

export const aiContextSchema = z.object({
  store: z.object({
    name: z.string().max(100),
    industry: z.string().max(100),
    sourceName: z.string().max(240),
    sourceType: z.enum(['sample', 'local_csv', 'online_csv']),
    isSynthetic: z.boolean(),
    latestCompleteDate: z.string().max(20),
    period: z.object({ from: z.string().max(20), to: z.string().max(20) }),
    baselinePeriod: z.object({ from: z.string().max(20), to: z.string().max(20) }),
  }),
  metrics: z.object({ current: metricRecord, baseline: metricRecord, deltas: metricRecord }),
  findings: z.array(aiFindingSchema).max(10),
  actions: z.array(aiActionSchema).max(20),
  weeklyReview: z.object({
    periodLabel: z.string().max(120),
    fallbackSummary: z.string().max(500),
    reviewableCount: z.number().int().nonnegative(),
    recoveredCount: z.number().int().nonnegative(),
    closedCount: z.number().int().nonnegative(),
  }).nullable(),
  dataQuality: z.object({
    validRows: z.number().int().nonnegative(),
    skippedRows: z.number().int().nonnegative(),
    issues: z.array(z.string().max(240)).max(10),
  }),
})

export const adviceRequestSchema = z.object({
  accessCode: z.string().max(100),
  question: z.string().trim().min(1).max(300),
  surface: aiSurfaceSchema,
  selectedFindingId: z.string().max(100).nullable(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1200),
  })).max(8).optional(),
  context: aiContextSchema,
})

const evidenceSchema = z.object({
  findingId: z.string().max(100).nullable(),
  text: z.string().min(1).max(400),
})
const hypothesisSchema = z.object({
  statement: z.string().min(1).max(400),
  verification: z.string().min(1).max(500),
})
const priorityActionSchema = z.object({
  findingId: z.string().min(1).max(100),
  action: z.string().min(1).max(500),
  reason: z.string().min(1).max(500),
  verification: z.string().min(1).max(500),
})

export const adviceContentSchema = z.object({
  answer: z.string().min(1).max(1200),
  evidence: z.array(evidenceSchema).max(8),
  hypotheses: z.array(hypothesisSchema).max(5),
  priorityActions: z.array(priorityActionSchema).max(5),
  caveats: z.array(z.string().min(1).max(500)).max(6),
})

export const adviceResponseSchema = adviceContentSchema.extend({
  mode: z.enum(['ai', 'rule_fallback']),
  meta: z.object({
    model: z.string().max(100),
    generatedAt: z.string(),
    fallbackReason: z.string().max(120).nullable(),
  }),
})

export type AiContext = z.infer<typeof aiContextSchema>
export type AdviceRequest = z.infer<typeof adviceRequestSchema>
export type AdviceResponse = z.infer<typeof adviceResponseSchema>

const ratio = (current: number, baseline: number) => baseline === 0 ? null : (current - baseline) / baseline
const delta = (current: number | null, baseline: number | null) => current === null || baseline === null ? null : current - baseline

export function buildAiContext({
  snapshot,
  sourceName,
  sourceType,
  isSynthetic,
  orders,
  weeklyReview,
  importResult,
}: {
  snapshot: DashboardSnapshot
  sourceName: string
  sourceType: 'sample' | 'local_csv' | 'online_csv'
  isSynthetic: boolean
  orders: ActionWorkOrder[]
  weeklyReview: WeeklyReviewData | null
  importResult: CsvImportResult | null
}): AiContext {
  const { current, baseline } = snapshot
  const currentNet = current.gmv - current.refundAmount
  const baselineNet = baseline.gmv - baseline.refundAmount
  return {
    store: {
      name: '青柚研究所',
      industry: '美妆个护',
      sourceName,
      sourceType,
      isSynthetic,
      latestCompleteDate: snapshot.latestCompleteDate,
      period: { from: current.from, to: current.to },
      baselinePeriod: { from: baseline.from, to: baseline.to },
    },
    metrics: {
      current: {
        gmv: current.gmv,
        netRevenue: currentNet,
        orders: current.orders,
        conversionRate: current.clickOrderCvr,
        refundRate: current.refundOrderRate,
        ship48hRate: current.ship48hRate,
      },
      baseline: {
        gmv: baseline.gmv,
        netRevenue: baselineNet,
        orders: baseline.orders,
        conversionRate: baseline.clickOrderCvr,
        refundRate: baseline.refundOrderRate,
        ship48hRate: baseline.ship48hRate,
      },
      deltas: {
        gmvRatio: ratio(current.gmv, baseline.gmv),
        netRevenueRatio: ratio(currentNet, baselineNet),
        ordersRatio: ratio(current.orders, baseline.orders),
        conversionRatio: current.clickOrderCvr === null || baseline.clickOrderCvr === null ? null : ratio(current.clickOrderCvr, baseline.clickOrderCvr),
        refundPp: delta(current.refundOrderRate, baseline.refundOrderRate) === null ? null : delta(current.refundOrderRate, baseline.refundOrderRate)! * 100,
        ship48hPp: delta(current.ship48hRate, baseline.ship48hRate) === null ? null : delta(current.ship48hRate, baseline.ship48hRate)! * 100,
      },
    },
    findings: snapshot.findings.map((finding, index) => ({
      id: finding.id,
      rank: index + 1,
      category: finding.category,
      title: finding.title,
      severity: finding.severity,
      priorityScore: finding.priority.total,
      metric: {
        label: finding.metric.label,
        current: finding.metric.currentLabel,
        baseline: finding.metric.baselineLabel,
        delta: finding.metric.deltaLabel,
        threshold: finding.metric.thresholdLabel,
      },
      relatedSkuId: finding.relatedSkuId ?? null,
      relatedSkuName: finding.relatedSkuName ?? null,
      evidence: finding.evidence,
      caveat: finding.caveat,
      ruleSuggestion: finding.ruleSuggestion,
      verification: finding.verification,
    })),
    actions: orders.slice(0, 20).map((order) => ({
      id: order.id,
      findingId: order.findingSnapshot?.findingId ?? null,
      title: order.title,
      actionText: order.actionText,
      executionStatus: order.executionStatus,
      monitorStatus: order.monitoringResult.status,
      monitorMetric: order.monitoringPlan.metricLabel,
      creationValue: order.monitoringPlan.creationValue,
      latestValue: order.monitoringResult.currentValue ?? null,
      targetLabel: order.monitoringPlan.targetLabel,
      monitorReason: order.monitoringResult.reason,
    })),
    weeklyReview: weeklyReview ? {
      periodLabel: weeklyReview.period.label,
      fallbackSummary: weeklyReview.fallbackSummary,
      reviewableCount: weeklyReview.reviewableCount,
      recoveredCount: weeklyReview.recoveredCount,
      closedCount: weeklyReview.closedCount,
    } : null,
    dataQuality: {
      validRows: importResult?.rows.length ?? snapshot.rowCount,
      skippedRows: importResult?.skippedRows ?? 0,
      issues: (importResult?.issues ?? []).slice(0, 10).map((issue) => issue.message),
    },
  }
}

export function buildRuleFallback(request: Omit<AdviceRequest, 'accessCode'>, reason: string): AdviceResponse {
  const selected = request.context.findings.find((finding) => finding.id === request.selectedFindingId)
    ?? request.context.findings[0]
  const syntheticCaveat = request.context.store.isSynthetic ? '当前为模拟经营数据，不代表真实商家经营结果。' : null
  if (!selected) {
    return {
      mode: 'rule_fallback',
      answer: '当前没有发现达到规则阈值的经营异常，建议继续观察核心指标和数据完整性。',
      evidence: [{ findingId: null, text: `当前周期 ${request.context.store.period.from} 至 ${request.context.store.period.to}，规则未识别到需优先处理的问题。` }],
      hypotheses: [],
      priorityActions: [],
      caveats: [syntheticCaveat, '规则只覆盖当前 MVP 定义的经营异常。'].filter((item): item is string => Boolean(item)),
      meta: { model: 'rule-engine', generatedAt: new Date().toISOString(), fallbackReason: reason },
    }
  }
  return {
    mode: 'rule_fallback',
    answer: request.surface === 'review' && request.context.weeklyReview
      ? `${request.context.weeklyReview.fallbackSummary} 当前优先关注“${selected.title}”。`
      : `当前优先关注“${selected.title}”。该结论来自规则排序，需要结合业务现场验证具体原因。`,
    evidence: selected.evidence.slice(0, 4).map((text) => ({ findingId: selected.id, text })),
    hypotheses: [{ statement: selected.caveat, verification: selected.verification }],
    priorityActions: [{ findingId: selected.id, action: selected.ruleSuggestion, reason: `该问题规则优先级为第 ${selected.rank} 位，评分 ${selected.priorityScore}。`, verification: selected.verification }],
    caveats: [syntheticCaveat, '当前为规则建议模式，未生成额外的 AI 解释。'].filter((item): item is string => Boolean(item)),
    meta: { model: 'rule-engine', generatedAt: new Date().toISOString(), fallbackReason: reason },
  }
}

export async function requestAdvice(request: AdviceRequest): Promise<AdviceResponse> {
  const parsed = adviceRequestSchema.parse(request)
  const response = await fetch('/api/advice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `AI 服务请求失败（${response.status}）`)
  return adviceResponseSchema.parse(payload)
}
