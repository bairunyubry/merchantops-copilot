import type {
  FindingCode,
  PeriodSummary,
  ScenarioEvaluation,
  StoreDataRow,
} from '../types/data'

const divide = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const rowsInPeriod = (rows: StoreDataRow[], from: string, to: string) =>
  rows.filter((row) => row.date >= from && row.date <= to)

export function summarizePeriod(rows: StoreDataRow[], from: string, to: string): PeriodSummary {
  const periodRows = rowsInPeriod(rows, from, to)
  const total = (key: keyof StoreDataRow) =>
    periodRows.reduce((sum, row) => sum + Number(row[key]), 0)
  const shippedOrders = total('shipped_orders')
  const weightedShipHours = periodRows.reduce(
    (sum, row) => sum + row.avg_ship_hours * row.shipped_orders,
    0,
  )

  const impressions = total('impressions')
  const clicks = total('clicks')
  const orders = total('orders')
  const gmv = total('gmv')
  const refundOrders = total('refund_orders')
  const shippedWithin48hOrders = total('shipped_within_48h_orders')

  return {
    from,
    to,
    impressions,
    clicks,
    orders,
    unitsSold: total('units_sold'),
    gmv,
    refundOrders,
    refundAmount: total('refund_amount'),
    shippedOrders,
    shippedWithin48hOrders,
    clickOrderCvr: divide(orders, clicks),
    refundOrderRate: divide(refundOrders, orders),
    ship48hRate: divide(shippedWithin48hOrders, shippedOrders),
    avgShipHours: divide(weightedShipHours, shippedOrders),
  }
}

function evaluateInventory(rows: StoreDataRow[], currentFrom: string, currentTo: string) {
  const currentRows = rowsInPeriod(rows, currentFrom, currentTo)
  const bySku = new Map<string, StoreDataRow[]>()
  currentRows.forEach((row) => bySku.set(row.sku_id, [...(bySku.get(row.sku_id) ?? []), row]))

  return [...bySku.entries()]
    .map(([skuId, skuRows]) => {
      const sorted = [...skuRows].sort((a, b) => a.date.localeCompare(b.date))
      const units = sorted.reduce((sum, row) => sum + row.units_sold, 0)
      const activeDays = sorted.filter((row) => row.units_sold > 0).length
      const averageDailyUnits = units / 7
      const coverDays = averageDailyUnits === 0 ? Number.POSITIVE_INFINITY : sorted.at(-1)!.stock / averageDailyUnits
      return { skuId, activeDays, coverDays }
    })
    .filter((item) => item.activeDays >= 3 && item.coverDays < 7)
    .map(({ skuId, coverDays }) => ({ skuId, coverDays }))
    .sort((a, b) => a.coverDays - b.coverDays)
}

function evaluateRefundContribution(
  rows: StoreDataRow[],
  baselineFrom: string,
  baselineTo: string,
  currentFrom: string,
  currentTo: string,
) {
  const skuIds = [...new Set(rows.map((row) => row.sku_id))]
  const contributions = skuIds.map((skuId) => {
    const skuRows = rows.filter((row) => row.sku_id === skuId)
    const baseline = summarizePeriod(skuRows, baselineFrom, baselineTo)
    const current = summarizePeriod(skuRows, currentFrom, currentTo)
    const excess =
      baseline.orders === 0 || baseline.refundOrderRate === null
        ? 0
        : Math.max(0, current.refundOrders - current.orders * baseline.refundOrderRate)
    return { skuId, excess }
  })
  const totalExcess = contributions.reduce((sum, item) => sum + item.excess, 0)
  if (totalExcess === 0) return undefined
  const top = contributions.sort((a, b) => b.excess - a.excess)[0]
  return { skuId: top.skuId, contribution: top.excess / totalExcess }
}

export function evaluateScenario(rows: StoreDataRow[]): ScenarioEvaluation {
  if (rows.length === 0) throw new Error('无法评估空数据集')
  const latestCompleteDate = rows.reduce((latest, row) => (row.date > latest ? row.date : latest), rows[0].date)
  const currentFrom = shiftDate(latestCompleteDate, -6)
  const baselineTo = shiftDate(latestCompleteDate, -7)
  const baselineFrom = shiftDate(latestCompleteDate, -13)
  const current = summarizePeriod(rows, currentFrom, latestCompleteDate)
  const baseline = summarizePeriod(rows, baselineFrom, baselineTo)
  const findingCodes: FindingCode[] = []

  if (
    current.clickOrderCvr !== null &&
    baseline.clickOrderCvr !== null &&
    baseline.clicks >= 100 &&
    current.clicks >= 100 &&
    (current.clickOrderCvr - baseline.clickOrderCvr) / baseline.clickOrderCvr < -0.2
  ) {
    findingCodes.push('conversion_drop')
  }

  const refundTriggered =
    current.refundOrderRate !== null &&
    baseline.refundOrderRate !== null &&
    current.orders >= 20 &&
    baseline.orders >= 20 &&
    current.refundOrderRate - baseline.refundOrderRate >= 0.03
  if (refundTriggered) findingCodes.push('refund_spike')

  if (
    current.ship48hRate !== null &&
    current.shippedOrders >= 20 &&
    current.ship48hRate < 0.9
  ) {
    findingCodes.push('fulfillment_delay')
  }

  const lowStockSkus = evaluateInventory(rows, currentFrom, latestCompleteDate)
  if (lowStockSkus.length > 0) findingCodes.push('inventory_shortage')

  const topRefundContributor = evaluateRefundContribution(
    rows,
    baselineFrom,
    baselineTo,
    currentFrom,
    latestCompleteDate,
  )
  if (refundTriggered && topRefundContributor && topRefundContributor.contribution > 0.4) {
    findingCodes.push('sku_concentration')
  }

  return {
    latestCompleteDate,
    baseline,
    current,
    findingCodes,
    topRefundContributor,
    lowStockSkus,
  }
}

