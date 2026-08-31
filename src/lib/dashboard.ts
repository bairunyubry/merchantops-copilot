import type { FindingCode, StoreDataRow } from '../types/data'
import { evaluateScenario, summarizePeriod } from './metrics'

export interface DailyPoint {
  date: string
  gmv: number
  netRevenue: number
  orders: number
  clickOrderCvr: number | null
  refundOrderRate: number | null
  ship48hRate: number | null
}

export interface SkuContribution {
  skuId: string
  skuName: string
  contribution: number
  evidenceValue: number
}

export interface HealthDimension {
  id: 'product' | 'inventory' | 'fulfillment' | 'after_sales'
  label: string
  score: number
  status: 'good' | 'attention' | 'risk'
}

export type FindingCategory = 'conversion' | 'after_sales' | 'fulfillment' | 'inventory'

export interface FindingPriority {
  total: number
  severity: number
  impact: number
  urgency: number
  confidence: number
  reasons: string[]
}

export interface FindingMetric {
  label: string
  currentLabel: string
  baselineLabel: string
  deltaLabel: string
  thresholdLabel: string
  sampleLabel: string
}

export interface FindingTrendPoint {
  date: string
  value: number | null
}

export interface PrimaryFinding {
  id: string
  code: FindingCode | 'no_material_issue'
  title: string
  summary: string
  evidence: string[]
  caveat: string
  severity: 'high' | 'medium' | 'low'
  confidence: number
  relatedSkuId?: string
  relatedSkuName?: string
}

export interface DiagnosisFinding extends PrimaryFinding {
  category: FindingCategory
  ruleCodes: FindingCode[]
  priority: FindingPriority
  metric: FindingMetric
  trendLabel: string
  trendUnit: string
  trendThreshold?: number
  trend: FindingTrendPoint[]
  skuContributions: SkuContribution[]
  ruleSuggestion: string
  verification: string
}

export interface DashboardSnapshot {
  latestCompleteDate: string
  dateRange: { from: string; to: string }
  baseline: ReturnType<typeof summarizePeriod>
  current: ReturnType<typeof summarizePeriod>
  daily: DailyPoint[]
  skuContributions: SkuContribution[]
  health: HealthDimension[]
  primaryFinding: PrimaryFinding
  findings: DiagnosisFinding[]
  findingCodes: FindingCode[]
  rawFindingCount: number
  rowCount: number
  skuCount: number
}

const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(2)}%`)
const ppChange = (current: number | null, baseline: number | null) =>
  current === null || baseline === null ? 0 : (current - baseline) * 100
const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, value))
const sampleConfidence = (sample: number, fullSample: number) => clamp(55 + sample / fullSample * 40, 55, 95)
const priorityTotal = (severity: number, impact: number, urgency: number, confidence: number) =>
  Math.round(severity * 0.3 + impact * 0.3 + urgency * 0.25 + confidence * 0.15)
const priorityLevel = (score: number): PrimaryFinding['severity'] => score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low'

const groupBySku = (rows: StoreDataRow[]) => {
  const groups = new Map<string, StoreDataRow[]>()
  rows.forEach((row) => groups.set(row.sku_id, [...(groups.get(row.sku_id) ?? []), row]))
  return groups
}

const normalizeContributions = (
  values: Array<{ skuId: string; skuName: string; value: number }>,
): SkuContribution[] => {
  const positive = values.filter((item) => item.value > 0).sort((a, b) => b.value - a.value)
  const total = positive.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return []
  return positive.slice(0, 5).map((item) => ({
    skuId: item.skuId,
    skuName: item.skuName,
    contribution: item.value / total,
    evidenceValue: item.value,
  }))
}

function buildDaily(rows: StoreDataRow[]): DailyPoint[] {
  return [...new Set(rows.map((row) => row.date))].sort().map((date) => {
    const summary = summarizePeriod(rows, date, date)
    return {
      date,
      gmv: summary.gmv,
      netRevenue: summary.gmv - summary.refundAmount,
      orders: summary.orders,
      clickOrderCvr: summary.clickOrderCvr,
      refundOrderRate: summary.refundOrderRate,
      ship48hRate: summary.ship48hRate,
    }
  })
}

function contributionForCode(
  rows: StoreDataRow[],
  code: FindingCode | 'no_material_issue',
  baselineFrom: string,
  baselineTo: string,
  currentFrom: string,
  currentTo: string,
  lowStock: Map<string, number>,
) {
  const values = [...groupBySku(rows).entries()].map(([skuId, skuRows]) => {
    const sorted = [...skuRows].sort((a, b) => a.date.localeCompare(b.date))
    const skuName = sorted.at(-1)?.sku_name ?? skuId
    const baseline = summarizePeriod(skuRows, baselineFrom, baselineTo)
    const current = summarizePeriod(skuRows, currentFrom, currentTo)
    let value = current.gmv
    if (code === 'conversion_drop') value = Math.max(0, (baseline.clickOrderCvr ?? 0) * current.clicks - current.orders)
    if (code === 'refund_spike' || code === 'sku_concentration') value = Math.max(0, current.refundOrders - current.orders * (baseline.refundOrderRate ?? 0))
    if (code === 'fulfillment_delay') value = Math.max(0, current.shippedOrders - current.shippedWithin48hOrders)
    if (code === 'inventory_shortage') value = Math.max(0, 7 - (lowStock.get(skuId) ?? 7))
    return { skuId, skuName, value }
  })
  return normalizeContributions(values)
}

const findSkuName = (rows: StoreDataRow[], skuId?: string) => {
  if (!skuId) return undefined
  return [...rows].filter((row) => row.sku_id === skuId)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.sku_name
}

function makePriority(
  severity: number,
  impact: number,
  urgency: number,
  confidence: number,
  reasons: string[],
): FindingPriority {
  return {
    severity: Math.round(clamp(severity)),
    impact: Math.round(clamp(impact)),
    urgency: Math.round(clamp(urgency)),
    confidence: Math.round(clamp(confidence)),
    total: priorityTotal(severity, impact, urgency, confidence),
    reasons,
  }
}

function findingContributions(
  rows: StoreDataRow[],
  evaluation: ReturnType<typeof evaluateScenario>,
  code: FindingCode,
) {
  return contributionForCode(
    rows,
    code,
    evaluation.baseline.from,
    evaluation.baseline.to,
    evaluation.current.from,
    evaluation.current.to,
    new Map(evaluation.lowStockSkus.map((item) => [item.skuId, item.coverDays])),
  )
}

function buildRefundFinding(
  rows: StoreDataRow[],
  evaluation: ReturnType<typeof evaluateScenario>,
  daily: DailyPoint[],
): DiagnosisFinding {
  const { current, baseline } = evaluation
  const contributions = findingContributions(rows, evaluation, 'refund_spike')
  const top = contributions[0]
  const concentrated = evaluation.findingCodes.includes('sku_concentration')
  const skuId = evaluation.topRefundContributor?.skuId ?? top?.skuId
  const skuName = findSkuName(rows, skuId) ?? top?.skuName ?? '重点 SKU'
  const skuCurrent = summarizePeriod(rows.filter((row) => row.sku_id === skuId), current.from, current.to)
  const delta = ppChange(current.refundOrderRate, baseline.refundOrderRate)
  const concentration = evaluation.topRefundContributor?.contribution ?? top?.contribution ?? 0
  const priority = makePriority(
    60 + (delta - 3) / 5 * 35,
    52 + concentration * 42 + current.refundAmount / Math.max(current.gmv, 1) * 120,
    76 + delta * 2.4,
    sampleConfidence(Math.min(current.orders, baseline.orders), 250),
    [
      `退款率超过规则阈值 ${delta.toFixed(2)} 个百分点`,
      concentrated ? `单一 SKU 贡献 ${Math.round(concentration * 100)}% 退款增量，定位明确` : '退款增量分散，需要进一步按原因拆分',
      `本期已发生退款金额 ¥${current.refundAmount.toFixed(0)}，属于已实现损失`,
    ],
  )
  return {
    id: 'finding-refund',
    code: concentrated ? 'sku_concentration' : 'refund_spike',
    category: 'after_sales',
    ruleCodes: concentrated ? ['refund_spike', 'sku_concentration'] : ['refund_spike'],
    title: concentrated
      ? `${skuName}贡献了全店退款增量的 ${Math.round(concentration * 100)}%`
      : `全店退款率较基线上升 ${delta.toFixed(2)} 个百分点`,
    summary: `当前退款率 ${percent(current.refundOrderRate)}，较前 7 日上升 ${delta.toFixed(2)} 个百分点。${concentrated ? '异常增量集中在一个 SKU，可优先定点核查。' : '异常分散在多个 SKU，需要按退款原因继续拆分。'}`,
    evidence: [
      `本期退款 ${current.refundOrders} 单，退款金额 ¥${current.refundAmount.toFixed(0)}`,
      `前 7 日退款率 ${percent(baseline.refundOrderRate)}`,
      concentrated ? `${skuName}本期退款 ${skuCurrent.refundOrders} 单，贡献退款增量 ${Math.round(concentration * 100)}%` : `最高 SKU 贡献退款增量约 ${Math.round(concentration * 100)}%`,
      concentrated ? `该 SKU 平均发货 ${skuCurrent.avgShipHours?.toFixed(1) ?? '—'} 小时` : `本期支付订单行 ${current.orders}`,
    ],
    caveat: concentrated
      ? '发货变慢与退款上升存在相关性，仍需抽查订单和退款原因，不能直接判断为确定因果。'
      : '当前数据只能定位退款异常分布，具体原因仍需结合退款原因或订单抽样验证。',
    severity: priorityLevel(priority.total),
    confidence: priority.confidence / 100,
    relatedSkuId: skuId,
    relatedSkuName: skuName,
    priority,
    metric: {
      label: '退款率',
      currentLabel: percent(current.refundOrderRate),
      baselineLabel: percent(baseline.refundOrderRate),
      deltaLabel: `+${delta.toFixed(2)}pp`,
      thresholdLabel: '较前 7 日上升 ≥ 3pp',
      sampleLabel: `本期 ${current.orders} 个支付订单行`,
    },
    trendLabel: '日退款率',
    trendUnit: '%',
    trendThreshold: (baseline.refundOrderRate ?? 0) * 100 + 3,
    trend: daily.map((point) => ({ date: point.date, value: point.refundOrderRate === null ? null : point.refundOrderRate * 100 })),
    skuContributions: contributions,
    ruleSuggestion: concentrated
      ? `优先抽查 ${skuName} 最近批次质量，并将延迟发货订单与退款原因交叉核对。`
      : '先按退款原因和 SKU 拆分异常订单，优先处理贡献最高且可快速验证的问题。',
    verification: '记录处理日期，7 天后复查重点 SKU 与全店退款率，并确认订单量没有明显缩小。',
  }
}

function buildConversionFinding(
  rows: StoreDataRow[],
  evaluation: ReturnType<typeof evaluateScenario>,
  daily: DailyPoint[],
): DiagnosisFinding {
  const { current, baseline } = evaluation
  const contributions = findingContributions(rows, evaluation, 'conversion_drop')
  const top = contributions[0]
  const relative = baseline.clickOrderCvr
    ? ((current.clickOrderCvr ?? 0) - baseline.clickOrderCvr) / baseline.clickOrderCvr
    : 0
  const lostOrders = contributions.reduce((sum, item) => sum + item.evidenceValue, 0)
  const priority = makePriority(
    60 + (Math.abs(relative) - 0.2) / 0.3 * 35,
    52 + lostOrders / Math.max(current.orders, 1) * 120,
    78,
    sampleConfidence(Math.min(current.clicks, baseline.clicks), 1200),
    [
      `转化率相对下降 ${Math.abs(relative * 100).toFixed(1)}%，超过 20% 阈值`,
      `按前期转化水平估算，约少产生 ${Math.round(lostOrders)} 个支付订单行`,
      '当前期与基线期点击样本均超过规则最低要求',
    ],
  )
  return {
    id: 'finding-conversion',
    code: 'conversion_drop',
    category: 'conversion',
    ruleCodes: ['conversion_drop'],
    title: `点击—支付转化率较前期下降 ${Math.abs(relative * 100).toFixed(1)}%`,
    summary: `本期转化率 ${percent(current.clickOrderCvr)}，前 7 日为 ${percent(baseline.clickOrderCvr)}。`,
    evidence: [
      `本期点击 ${current.clicks.toLocaleString('zh-CN')} 次`,
      `本期支付订单行 ${current.orders.toLocaleString('zh-CN')}`,
      `按前期水平估算少产生约 ${Math.round(lostOrders)} 个支付订单行`,
      `影响最大的 SKU：${top?.skuName ?? '—'}`,
    ],
    caveat: '转化下降可能同时受到流量结构、商品信息和价格变化影响，聚合数据不能直接确认具体原因。',
    severity: priorityLevel(priority.total),
    confidence: priority.confidence / 100,
    relatedSkuId: top?.skuId,
    relatedSkuName: top?.skuName,
    priority,
    metric: {
      label: '点击—支付转化率',
      currentLabel: percent(current.clickOrderCvr),
      baselineLabel: percent(baseline.clickOrderCvr),
      deltaLabel: `${(relative * 100).toFixed(1)}%`,
      thresholdLabel: '较前 7 日相对下降 > 20%',
      sampleLabel: `本期 ${current.clicks} 次点击`,
    },
    trendLabel: '日点击—支付转化率',
    trendUnit: '%',
    trendThreshold: (baseline.clickOrderCvr ?? 0) * 80,
    trend: daily.map((point) => ({ date: point.date, value: point.clickOrderCvr === null ? null : point.clickOrderCvr * 100 })),
    skuContributions: contributions,
    ruleSuggestion: '检查高影响 SKU 的商品信息、价格和流量结构变化，并对关键页面做小范围修正。',
    verification: '记录修改时间，7 天后比较点击—支付转化率，同时观察点击量和流量结构是否稳定。',
  }
}

function buildFulfillmentFinding(
  rows: StoreDataRow[],
  evaluation: ReturnType<typeof evaluateScenario>,
  daily: DailyPoint[],
): DiagnosisFinding {
  const { current, baseline } = evaluation
  const contributions = findingContributions(rows, evaluation, 'fulfillment_delay')
  const top = contributions[0]
  const currentRate = current.ship48hRate ?? 0
  const gap = (0.9 - currentRate) * 100
  const lateOrders = current.shippedOrders - current.shippedWithin48hOrders
  const priority = makePriority(
    60 + gap / 20 * 38,
    48 + lateOrders / Math.max(current.shippedOrders, 1) * 120,
    82 + gap,
    sampleConfidence(current.shippedOrders, 250),
    [
      `48 小时发货达成率低于 90% 阈值 ${gap.toFixed(2)} 个百分点`,
      `本期共有 ${lateOrders} 个已发货订单行超过 48 小时`,
      '履约异常仍在当前周期发生，需先区分缺货、仓内和揽收环节',
    ],
  )
  return {
    id: 'finding-fulfillment',
    code: 'fulfillment_delay',
    category: 'fulfillment',
    ruleCodes: ['fulfillment_delay'],
    title: `48 小时发货达成率降至 ${percent(current.ship48hRate)}`,
    summary: `当前履约水平低于 90% 规则阈值 ${gap.toFixed(2)} 个百分点，需要排查延迟订单集中的 SKU。`,
    evidence: [
      `本期已发货 ${current.shippedOrders} 单`,
      `48 小时内发货 ${current.shippedWithin48hOrders} 单`,
      `超过 48 小时 ${lateOrders} 单`,
      `延迟贡献最高：${top?.skuName ?? '—'}`,
    ],
    caveat: '聚合数据不能直接区分延迟来自缺货、仓内处理还是物流揽收，需要订单抽样验证。',
    severity: priorityLevel(priority.total),
    confidence: priority.confidence / 100,
    relatedSkuId: top?.skuId,
    relatedSkuName: top?.skuName,
    priority,
    metric: {
      label: '48 小时发货达成率',
      currentLabel: percent(current.ship48hRate),
      baselineLabel: percent(baseline.ship48hRate),
      deltaLabel: `${ppChange(current.ship48hRate, baseline.ship48hRate).toFixed(2)}pp`,
      thresholdLabel: '当前值 < 90%',
      sampleLabel: `本期 ${current.shippedOrders} 个已发货订单行`,
    },
    trendLabel: '日 48 小时发货达成率',
    trendUnit: '%',
    trendThreshold: 90,
    trend: daily.map((point) => ({ date: point.date, value: point.ship48hRate === null ? null : point.ship48hRate * 100 })),
    skuContributions: contributions,
    ruleSuggestion: '核对延迟订单集中的 SKU，区分缺货、仓内处理和物流揽收三个环节。',
    verification: '7 天后复查 48 小时发货达成率，并按延迟环节确认改善是否持续。',
  }
}

function buildInventoryFinding(
  rows: StoreDataRow[],
  evaluation: ReturnType<typeof evaluateScenario>,
): DiagnosisFinding {
  const { current } = evaluation
  const contributions = findingContributions(rows, evaluation, 'inventory_shortage')
  const cover = evaluation.lowStockSkus[0]
  const skuName = findSkuName(rows, cover?.skuId) ?? contributions[0]?.skuName ?? '重点 SKU'
  const coverDays = cover?.coverDays ?? 7
  const skuRows = [...rows].filter((row) => row.sku_id === cover?.skuId)
    .sort((a, b) => a.date.localeCompare(b.date))
  const skuCurrent = summarizePeriod(skuRows, current.from, current.to)
  const latestStock = skuRows.at(-1)?.stock ?? 0
  const priority = makePriority(
    58 + (7 - coverDays) / 7 * 40,
    48 + skuCurrent.unitsSold / Math.max(current.unitsSold, 1) * 150,
    62 + (7 - coverDays) / 7 * 36,
    sampleConfidence(skuCurrent.unitsSold, 80),
    [
      `库存覆盖仅 ${coverDays.toFixed(1)} 天，低于 7 天规则阈值`,
      `${skuName}贡献本期销量的 ${Math.round(skuCurrent.unitsSold / Math.max(current.unitsSold, 1) * 100)}%`,
      '按最近 7 天日均销量估算，未计入在途补货和活动波动',
    ],
  )
  return {
    id: 'finding-inventory',
    code: 'inventory_shortage',
    category: 'inventory',
    ruleCodes: ['inventory_shortage'],
    title: `${skuName}库存预计不足 7 天销量`,
    summary: `按最近 7 天销量估算，当前库存 ${latestStock} 件，可覆盖约 ${coverDays.toFixed(1)} 天。`,
    evidence: [
      `关联 SKU：${cover?.skuId ?? '—'}`,
      `当前期销售 ${skuCurrent.unitsSold} 件，期末库存 ${latestStock} 件`,
      `库存覆盖天数 ${coverDays.toFixed(1)} 天`,
      `共有 ${evaluation.lowStockSkus.length} 个 SKU 触发库存规则`,
    ],
    caveat: '库存覆盖天数基于近期平均销量，不包含活动、补货在途和季节性变化。',
    severity: priorityLevel(priority.total),
    confidence: priority.confidence / 100,
    relatedSkuId: cover?.skuId,
    relatedSkuName: skuName,
    priority,
    metric: {
      label: '库存覆盖天数',
      currentLabel: `${coverDays.toFixed(1)} 天`,
      baselineLabel: '不适用',
      deltaLabel: `距阈值 -${(7 - coverDays).toFixed(1)} 天`,
      thresholdLabel: '覆盖天数 < 7 天',
      sampleLabel: `最近 7 日销售 ${skuCurrent.unitsSold} 件`,
    },
    trendLabel: `${skuName}日末库存`,
    trendUnit: '件',
    trend: skuRows.map((row) => ({ date: row.date, value: row.stock })),
    skuContributions: contributions,
    ruleSuggestion: '确认在途补货和未来活动计划，在缺货前调整补货量或降低该 SKU 的投放强度。',
    verification: '每日更新期末库存和在途量，7 天后确认库存覆盖天数是否恢复至阈值以上。',
  }
}

function buildFindings(
  rows: StoreDataRow[],
  evaluation: ReturnType<typeof evaluateScenario>,
  daily: DailyPoint[],
) {
  const findings: DiagnosisFinding[] = []
  if (evaluation.findingCodes.includes('refund_spike')) findings.push(buildRefundFinding(rows, evaluation, daily))
  if (evaluation.findingCodes.includes('conversion_drop')) findings.push(buildConversionFinding(rows, evaluation, daily))
  if (evaluation.findingCodes.includes('fulfillment_delay')) findings.push(buildFulfillmentFinding(rows, evaluation, daily))
  if (evaluation.findingCodes.includes('inventory_shortage')) findings.push(buildInventoryFinding(rows, evaluation))
  return findings.sort((a, b) => b.priority.total - a.priority.total || a.id.localeCompare(b.id))
}

function buildNoIssueFinding(current: ReturnType<typeof summarizePeriod>): PrimaryFinding {
  return {
    id: 'finding-none',
    code: 'no_material_issue',
    title: '本期未发现达到规则阈值的高优先级异常',
    summary: '建议继续观察核心指标，并结合实际经营计划判断是否需要主动优化。',
    evidence: [`本期 GMV ¥${current.gmv.toFixed(0)}`, `退款率 ${percent(current.refundOrderRate)}`, `48 小时发货达成率 ${percent(current.ship48hRate)}`],
    caveat: '未触发规则不代表经营没有问题，规则只覆盖当前 MVP 的五类异常。',
    severity: 'low',
    confidence: 0.72,
  }
}

function buildHealth(snapshot: ReturnType<typeof evaluateScenario>): HealthDimension[] {
  const conversionRisk = snapshot.findingCodes.includes('conversion_drop')
  const inventoryRisk = snapshot.findingCodes.includes('inventory_shortage')
  const fulfillmentRate = snapshot.current.ship48hRate ?? 0
  const refundRate = snapshot.current.refundOrderRate ?? 0
  const refundDelta = ppChange(snapshot.current.refundOrderRate, snapshot.baseline.refundOrderRate)
  const health = (id: HealthDimension['id'], label: string, score: number): HealthDimension => ({
    id,
    label,
    score: Math.max(0, Math.min(100, Math.round(score))),
    status: score < 60 ? 'risk' : score < 80 ? 'attention' : 'good',
  })
  return [
    health('product', '商品', conversionRisk ? 52 : 86),
    health('inventory', '库存', inventoryRisk ? 44 : 89),
    health('fulfillment', '履约', fulfillmentRate * 100),
    health('after_sales', '售后', refundDelta >= 3 ? 42 : Math.max(62, 100 - refundRate * 500)),
  ]
}

export function buildDashboardSnapshot(rows: StoreDataRow[]): DashboardSnapshot {
  const evaluation = evaluateScenario(rows)
  const sortedDates = [...new Set(rows.map((row) => row.date))].sort()
  const daily = buildDaily(rows)
  const findings = buildFindings(rows, evaluation, daily)
  const primaryFinding = findings[0] ?? buildNoIssueFinding(evaluation.current)
  return {
    latestCompleteDate: evaluation.latestCompleteDate,
    dateRange: { from: sortedDates[0], to: sortedDates.at(-1)! },
    baseline: evaluation.baseline,
    current: evaluation.current,
    daily,
    skuContributions: findings[0]?.skuContributions ?? [],
    health: buildHealth(evaluation),
    primaryFinding,
    findings,
    findingCodes: evaluation.findingCodes,
    rawFindingCount: evaluation.findingCodes.length,
    rowCount: rows.length,
    skuCount: new Set(rows.map((row) => row.sku_id)).size,
  }
}
