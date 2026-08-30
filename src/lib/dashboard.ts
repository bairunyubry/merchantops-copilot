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

export interface PrimaryFinding {
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

export interface DashboardSnapshot {
  latestCompleteDate: string
  dateRange: { from: string; to: string }
  baseline: ReturnType<typeof summarizePeriod>
  current: ReturnType<typeof summarizePeriod>
  daily: DailyPoint[]
  skuContributions: SkuContribution[]
  health: HealthDimension[]
  primaryFinding: PrimaryFinding
  findingCodes: FindingCode[]
  rowCount: number
  skuCount: number
}

const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(2)}%`)
const ppChange = (current: number | null, baseline: number | null) =>
  current === null || baseline === null ? 0 : (current - baseline) * 100

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
  const dates = [...new Set(rows.map((row) => row.date))].sort()
  return dates.map((date) => {
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
    let value = 0

    if (code === 'conversion_drop') {
      value = Math.max(0, (baseline.clickOrderCvr ?? 0) * current.clicks - current.orders)
    } else if (code === 'refund_spike' || code === 'sku_concentration') {
      value = Math.max(0, current.refundOrders - current.orders * (baseline.refundOrderRate ?? 0))
    } else if (code === 'fulfillment_delay') {
      value = Math.max(0, current.shippedOrders - current.shippedWithin48hOrders)
    } else if (code === 'inventory_shortage') {
      value = Math.max(0, 7 - (lowStock.get(skuId) ?? 7))
    } else {
      value = current.gmv
    }
    return { skuId, skuName, value }
  })
  return normalizeContributions(values)
}

const findSkuName = (rows: StoreDataRow[], skuId?: string) => {
  if (!skuId) return undefined
  return [...rows]
    .filter((row) => row.sku_id === skuId)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.sku_name
}

function buildFinding(
  rows: StoreDataRow[],
  snapshot: ReturnType<typeof evaluateScenario>,
  contributions: SkuContribution[],
): PrimaryFinding {
  const codes = snapshot.findingCodes
  const code: FindingCode | 'no_material_issue' = codes.includes('sku_concentration')
    ? 'sku_concentration'
    : codes.includes('refund_spike')
      ? 'refund_spike'
      : codes.includes('conversion_drop')
        ? 'conversion_drop'
        : codes.includes('fulfillment_delay')
          ? 'fulfillment_delay'
          : codes.includes('inventory_shortage')
            ? 'inventory_shortage'
            : 'no_material_issue'
  const top = contributions[0]
  const current = snapshot.current
  const baseline = snapshot.baseline

  if (code === 'sku_concentration') {
    const skuId = snapshot.topRefundContributor?.skuId ?? top?.skuId
    const skuName = findSkuName(rows, skuId) ?? top?.skuName ?? '重点 SKU'
    const skuCurrent = summarizePeriod(rows.filter((row) => row.sku_id === skuId), current.from, current.to)
    return {
      code,
      title: `${skuName}贡献了全店退款增量的 ${Math.round((snapshot.topRefundContributor?.contribution ?? 0) * 100)}%`,
      summary: `当前退款率 ${percent(current.refundOrderRate)}，较前 7 日上升 ${ppChange(current.refundOrderRate, baseline.refundOrderRate).toFixed(2)} 个百分点。`,
      evidence: [
        `关联 SKU：${skuId}`,
        `该 SKU 本期退款 ${skuCurrent.refundOrders} 单`,
        `该 SKU 平均发货 ${skuCurrent.avgShipHours?.toFixed(1) ?? '—'} 小时`,
      ],
      caveat: '发货变慢与退款上升存在相关性，仍需抽查订单和退款原因，不能直接判断为确定因果。',
      severity: 'high',
      confidence: 0.86,
      relatedSkuId: skuId,
      relatedSkuName: skuName,
    }
  }

  if (code === 'refund_spike') {
    return {
      code,
      title: `全店退款率较基线上升 ${ppChange(current.refundOrderRate, baseline.refundOrderRate).toFixed(2)} 个百分点`,
      summary: `本期退款率 ${percent(current.refundOrderRate)}，异常分散在多个 SKU，需要按退款原因继续拆分。`,
      evidence: [`本期退款 ${current.refundOrders} 单`, `前期退款率 ${percent(baseline.refundOrderRate)}`, `最高 SKU 贡献约 ${Math.round((top?.contribution ?? 0) * 100)}%`],
      caveat: '当前数据只能定位退款异常分布，具体原因仍需结合退款原因或订单抽样验证。',
      severity: 'high',
      confidence: 0.82,
      relatedSkuId: top?.skuId,
      relatedSkuName: top?.skuName,
    }
  }

  if (code === 'conversion_drop') {
    const relative = baseline.clickOrderCvr
      ? ((current.clickOrderCvr ?? 0) - baseline.clickOrderCvr) / baseline.clickOrderCvr
      : 0
    return {
      code,
      title: `点击—支付转化率较前期下降 ${Math.abs(relative * 100).toFixed(1)}%`,
      summary: `本期转化率 ${percent(current.clickOrderCvr)}，前期为 ${percent(baseline.clickOrderCvr)}。`,
      evidence: [`本期点击 ${current.clicks.toLocaleString('zh-CN')} 次`, `本期支付订单行 ${current.orders.toLocaleString('zh-CN')}`, `影响最大的 SKU：${top?.skuName ?? '—'}`],
      caveat: '转化下降可能同时受到流量结构、商品信息和价格变化影响，需进一步验证。',
      severity: 'high',
      confidence: 0.84,
      relatedSkuId: top?.skuId,
      relatedSkuName: top?.skuName,
    }
  }

  if (code === 'fulfillment_delay') {
    return {
      code,
      title: `48 小时发货达成率降至 ${percent(current.ship48hRate)}`,
      summary: '当前履约水平低于 90% 规则阈值，需要优先排查延迟订单集中的 SKU。',
      evidence: [`本期已发货 ${current.shippedOrders} 单`, `48 小时内发货 ${current.shippedWithin48hOrders} 单`, `延迟贡献最高：${top?.skuName ?? '—'}`],
      caveat: '需要确认延迟来自缺货、仓内处理还是物流揽收，聚合数据无法直接区分。',
      severity: 'high',
      confidence: 0.9,
      relatedSkuId: top?.skuId,
      relatedSkuName: top?.skuName,
    }
  }

  if (code === 'inventory_shortage') {
    const cover = snapshot.lowStockSkus[0]
    const skuName = findSkuName(rows, cover?.skuId) ?? top?.skuName ?? '重点 SKU'
    return {
      code,
      title: `${skuName}库存预计不足 7 天销量`,
      summary: `按最近 7 天销量估算，当前库存仅可覆盖 ${cover?.coverDays.toFixed(1) ?? '—'} 天。`,
      evidence: [`关联 SKU：${cover?.skuId ?? '—'}`, `规则阈值：库存覆盖天数 < 7`, '该 SKU 最近 7 天至少有 3 个有效销售日'],
      caveat: '库存覆盖天数基于近期平均销量，不包含活动、补货在途和季节性变化。',
      severity: 'medium',
      confidence: 0.88,
      relatedSkuId: cover?.skuId,
      relatedSkuName: skuName,
    }
  }

  return {
    code,
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

  const health = (
    id: HealthDimension['id'],
    label: string,
    score: number,
  ): HealthDimension => ({
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
  const primaryCode: FindingCode | 'no_material_issue' = evaluation.findingCodes.includes('sku_concentration')
    ? 'sku_concentration'
    : evaluation.findingCodes[0] ?? 'no_material_issue'
  const lowStock = new Map(evaluation.lowStockSkus.map((item) => [item.skuId, item.coverDays]))
  const skuContributions = contributionForCode(
    rows,
    primaryCode,
    evaluation.baseline.from,
    evaluation.baseline.to,
    evaluation.current.from,
    evaluation.current.to,
    lowStock,
  )

  return {
    latestCompleteDate: evaluation.latestCompleteDate,
    dateRange: { from: sortedDates[0], to: sortedDates.at(-1)! },
    baseline: evaluation.baseline,
    current: evaluation.current,
    daily: buildDaily(rows),
    skuContributions,
    health: buildHealth(evaluation),
    primaryFinding: buildFinding(rows, evaluation, skuContributions),
    findingCodes: evaluation.findingCodes,
    rowCount: rows.length,
    skuCount: new Set(rows.map((row) => row.sku_id)).size,
  }
}
