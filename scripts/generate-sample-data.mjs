import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scenarioDir = path.join(root, 'public', 'data', 'scenarios')
fs.mkdirSync(scenarioDir, { recursive: true })

const headers = [
  'date',
  'sku_id',
  'sku_name',
  'impressions',
  'clicks',
  'orders',
  'units_sold',
  'gmv',
  'refund_orders',
  'refund_amount',
  'stock',
  'shipped_orders',
  'shipped_within_48h_orders',
  'avg_ship_hours',
]

const skus = [
  ['QY-CLEAN-001', '氨基酸净澈洁面乳', 69, 1.18],
  ['QY-SERUM-002', '烟酰胺焕亮精华', 129, 1.08],
  ['QY-CREAM-003', '神经酰胺修护面霜', 119, 1.04],
  ['QY-MASK-004', '水润玻尿酸面膜', 79, 1.12],
  ['QY-SUN-005', '清透防晒乳 SPF50+', 99, 1.16],
  ['QY-TONER-006', '积雪草舒缓爽肤水', 89, 1.02],
  ['QY-SHAMPOO-007', '控油蓬松洗发水', 79, 1.1],
  ['QY-CONDITIONER-008', '柔顺修护护发素', 69, 0.94],
  ['QY-BODY-009', '烟酰胺身体乳', 99, 0.98],
  ['QY-HAND-010', '乳木果护手霜', 49, 0.9],
  ['QY-LIP-011', '滋润修护润唇膏', 39, 0.88],
  ['QY-CLEANSING-012', '温和卸妆膏', 109, 1.0],
].map(([id, name, price, demand]) => ({ id, name, price, demand }))

const scenarios = [
  {
    id: 'conversion_drop',
    file: 'qingyou-conversion-drop-30d.csv',
    name: '转化下降场景',
    expectedFindings: ['conversion_drop'],
    description: '最近7天点击后下单转化率较基线下降超过20%，两期点击量均满足最小样本。',
    effects: { conversionMultiplier: 0.67 },
  },
  {
    id: 'refund_spike',
    file: 'qingyou-refund-spike-30d.csv',
    name: '退款异常场景',
    expectedFindings: ['refund_spike'],
    description: '最近7天订单退款率较基线增加至少3个百分点，异常分散在多个SKU。',
    effects: { refundRate: 0.095 },
  },
  {
    id: 'fulfillment_delay',
    file: 'qingyou-fulfillment-delay-30d.csv',
    name: '履约异常场景',
    expectedFindings: ['fulfillment_delay'],
    description: '最近7天全店48小时发货达成率低于90%，且已发货订单满足最小样本。',
    effects: { shipRate: 0.81, avgShipHours: 49 },
  },
  {
    id: 'inventory_shortage',
    file: 'qingyou-inventory-shortage-30d.csv',
    name: '库存不足场景',
    expectedFindings: ['inventory_shortage'],
    description: '防晒SKU期末库存不足近7天平均销量的7天覆盖量。',
    effects: { lowStockSkus: ['QY-SUN-005'] },
  },
  {
    id: 'sku_concentration',
    file: 'qingyou-sku-concentration-30d.csv',
    name: '单SKU异常集中场景（默认旗舰）',
    expectedFindings: ['refund_spike', 'sku_concentration'],
    description: '洁面SKU贡献超过40%的超额退款，并伴随该SKU发货变慢；仅作为待验证关联。',
    effects: { concentratedRefundSku: 'QY-CLEAN-001', concentratedRefundRate: 0.42, concentratedShipRate: 0.56 },
  },
  {
    id: 'combo_growth_pressure',
    file: 'qingyou-combo-growth-pressure-30d.csv',
    name: '组合A｜增长承压',
    expectedFindings: ['conversion_drop', 'refund_spike'],
    description: '转化率显著下降，同时出现分散型退款上升，用于验收两个独立问题的排序切换。',
    effects: { conversionMultiplier: 0.62, refundRate: 0.088 },
  },
  {
    id: 'combo_service_breakdown',
    file: 'qingyou-combo-service-breakdown-30d.csv',
    name: '组合B｜服务链路失速',
    expectedFindings: ['refund_spike', 'sku_concentration', 'fulfillment_delay', 'inventory_shortage'],
    description: '重点SKU退款集中、全店履约下降且两个SKU库存不足，合并后形成三个独立问题。',
    effects: {
      concentratedRefundSku: 'QY-CLEAN-001',
      concentratedRefundRate: 0.55,
      shipRate: 0.78,
      avgShipHours: 54,
      lowStockSkus: ['QY-SUN-005', 'QY-SERUM-002'],
    },
  },
  {
    id: 'combo_all_round',
    file: 'qingyou-combo-all-round-30d.csv',
    name: '组合C｜全链路告警',
    expectedFindings: ['conversion_drop', 'refund_spike', 'sku_concentration', 'fulfillment_delay', 'inventory_shortage'],
    description: '转化、售后、履约与库存四个维度同时异常，用于验收完整列表、合并关系和优先级排序。',
    effects: {
      conversionMultiplier: 0.58,
      concentratedRefundSku: 'QY-CREAM-003',
      concentratedRefundRate: 0.46,
      shipRate: 0.74,
      avgShipHours: 59,
      lowStockSkus: ['QY-SUN-005', 'QY-CREAM-003', 'QY-MASK-004'],
    },
  },
  {
    id: 'combo_cashflow_risk',
    file: 'qingyou-combo-cashflow-risk-30d.csv',
    name: '组合D｜收入与供给风险',
    expectedFindings: ['conversion_drop', 'refund_spike', 'inventory_shortage'],
    description: '转化下降叠加分散型高退款，并出现热销SKU库存不足，形成三个独立问题。',
    effects: {
      conversionMultiplier: 0.69,
      refundRate: 0.118,
      lowStockSkus: ['QY-SERUM-002', 'QY-SUN-005'],
    },
  },
  {
    id: 'combo_operations_overload',
    file: 'qingyou-combo-operations-overload-30d.csv',
    name: '组合E｜运营承载不足',
    expectedFindings: ['conversion_drop', 'fulfillment_delay', 'inventory_shortage'],
    description: '无明显退款异常，但转化、履约和库存同时恶化，用于验证非售后问题也能排到第一。',
    effects: {
      conversionMultiplier: 0.64,
      shipRate: 0.69,
      avgShipHours: 64,
      lowStockSkus: ['QY-SUN-005', 'QY-MASK-004', 'QY-SERUM-002'],
    },
  },
]

const round2 = (value) => Math.round(value * 100) / 100
const countAtRate = (total, rate, salt) =>
  Math.min(total, Math.floor(total * rate + ((salt * 37) % 100) / 100))

const formatDate = (index) => {
  const date = new Date(Date.UTC(2026, 6, 31 + index))
  return date.toISOString().slice(0, 10)
}

function createRow(scenario, dayIndex, skuIndex) {
  const sku = skus[skuIndex]
  const effects = scenario.effects ?? {}
  const isCurrent = dayIndex >= 23
  const isBaseline = dayIndex >= 16 && dayIndex <= 22
  const dayFactor = 1 + ((dayIndex % 7) - 3) * 0.018
  const impressions = Math.round((930 + skuIndex * 62) * sku.demand * dayFactor)
  const ctr = 0.108 + ((skuIndex % 4) - 1.5) * 0.004
  const clicks = Math.max(1, Math.round(impressions * ctr))

  let cvr = 0.118 + ((skuIndex % 3) - 1) * 0.006
  if (effects.conversionMultiplier && isCurrent) cvr *= effects.conversionMultiplier
  const orders = Math.max(1, Math.round(clicks * cvr))
  const unitsSold = orders + Math.round(orders * (0.12 + (skuIndex % 2) * 0.05))
  const gmv = round2(unitsSold * sku.price * (0.965 + (dayIndex % 3) * 0.008))

  let refundRate = 0.032
  if (effects.refundRate && isCurrent) refundRate = effects.refundRate
  if (effects.concentratedRefundSku && isCurrent) {
    refundRate = sku.id === effects.concentratedRefundSku
      ? effects.concentratedRefundRate ?? 0.42
      : 0.038
  }
  if (!isCurrent && !isBaseline) refundRate = 0.03
  const refundOrders = countAtRate(orders, refundRate, dayIndex + skuIndex * 3)
  const refundAmount =
    orders === 0 ? 0 : round2(Math.min(gmv, refundOrders * (gmv / orders) * 0.94))

  let stock = 270 + skuIndex * 11 + (29 - dayIndex) * 2
  if (effects.lowStockSkus?.includes(sku.id)) {
    const targetIndex = effects.lowStockSkus.indexOf(sku.id)
    stock = Math.max(4 + targetIndex * 3, Math.round(95 - Math.max(0, dayIndex - 13) * (6 + targetIndex)))
  }

  const shippedOrders = Math.max(0, orders - ((dayIndex + skuIndex) % 2))
  let shipRate = 0.965
  let avgShipHours = 19 + ((dayIndex + skuIndex) % 7)
  if (effects.shipRate && isCurrent) {
    shipRate = effects.shipRate
    avgShipHours = (effects.avgShipHours ?? 49) + ((dayIndex + skuIndex) % 10)
  }
  if (effects.concentratedShipRate && isCurrent && sku.id === effects.concentratedRefundSku) {
    shipRate = effects.concentratedShipRate
    avgShipHours = 58 + (dayIndex % 7)
  }
  const shippedWithin48hOrders = countAtRate(
    shippedOrders,
    shipRate,
    dayIndex * 2 + skuIndex,
  )

  return {
    date: formatDate(dayIndex),
    sku_id: sku.id,
    sku_name: sku.name,
    impressions,
    clicks,
    orders,
    units_sold: unitsSold,
    gmv,
    refund_orders: refundOrders,
    refund_amount: refundAmount,
    stock,
    shipped_orders: shippedOrders,
    shipped_within_48h_orders: shippedWithin48hOrders,
    avg_ship_hours: round2(avgShipHours),
  }
}

const escapeCsv = (value) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const toCsv = (rows) =>
  [headers.join(','), ...rows.map((row) => headers.map((field) => escapeCsv(row[field])).join(','))].join('\n') + '\n'

for (const scenario of scenarios) {
  const rows = []
  for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
    for (let skuIndex = 0; skuIndex < skus.length; skuIndex += 1) {
      rows.push(createRow(scenario, dayIndex, skuIndex))
    }
  }
  fs.writeFileSync(path.join(scenarioDir, scenario.file), toCsv(rows), 'utf8')
}

const templateRows = [
  {
    date: '2026-08-29',
    sku_id: 'YOUR-SKU-001',
    sku_name: '示例商品（上传前请替换或删除本行）',
    impressions: 1000,
    clicks: 120,
    orders: 15,
    units_sold: 17,
    gmv: 1188,
    refund_orders: 1,
    refund_amount: 69,
    stock: 200,
    shipped_orders: 14,
    shipped_within_48h_orders: 13,
    avg_ship_hours: 22.5,
  },
]
fs.writeFileSync(path.join(root, 'public', 'data', 'csv-template.csv'), toCsv(templateRows), 'utf8')

const manifest = {
  storeName: '青柚研究所',
  industry: '美妆个护',
  timezone: 'Asia/Shanghai',
  currency: 'CNY',
  latestCompleteDate: '2026-08-29',
  dateRange: { from: '2026-07-31', to: '2026-08-29', days: 30 },
  baselinePeriod: { from: '2026-08-16', to: '2026-08-22' },
  currentPeriod: { from: '2026-08-23', to: '2026-08-29' },
  skuCount: skus.length,
  rowsPerScenario: 30 * skus.length,
  dataNotice: '合成经营数据，仅用于产品演示，不代表真实商家或平台经营结果。',
  structureReference: 'UCI Online Retail 交易字段结构参考；曝光、点击、库存、履约和退款为合成字段。',
  scenarios,
}
fs.writeFileSync(
  path.join(scenarioDir, 'scenario-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)

console.log(`Generated ${scenarios.length} scenarios × 360 rows and 1 CSV template.`)
