export const REQUIRED_CSV_FIELDS = [
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
] as const

export type CsvField = (typeof REQUIRED_CSV_FIELDS)[number]

export interface StoreDataRow {
  date: string
  sku_id: string
  sku_name: string
  impressions: number
  clicks: number
  orders: number
  units_sold: number
  gmv: number
  refund_orders: number
  refund_amount: number
  stock: number
  shipped_orders: number
  shipped_within_48h_orders: number
  avg_ship_hours: number
}

export type FindingCode =
  | 'conversion_drop'
  | 'refund_spike'
  | 'fulfillment_delay'
  | 'inventory_shortage'
  | 'sku_concentration'

export interface PeriodSummary {
  from: string
  to: string
  impressions: number
  clicks: number
  orders: number
  unitsSold: number
  gmv: number
  refundOrders: number
  refundAmount: number
  shippedOrders: number
  shippedWithin48hOrders: number
  clickOrderCvr: number | null
  refundOrderRate: number | null
  ship48hRate: number | null
  avgShipHours: number | null
}

export interface ScenarioEvaluation {
  latestCompleteDate: string
  baseline: PeriodSummary
  current: PeriodSummary
  findingCodes: FindingCode[]
  topRefundContributor?: {
    skuId: string
    contribution: number
  }
  lowStockSkus: Array<{
    skuId: string
    coverDays: number
  }>
}

