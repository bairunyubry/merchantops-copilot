import Papa from 'papaparse'
import { z } from 'zod'
import { REQUIRED_CSV_FIELDS, type StoreDataRow } from '../types/data'

export interface DataQualityIssue {
  row: number | null
  severity: 'error' | 'warning'
  code:
    | 'empty_file'
    | 'missing_fields'
    | 'invalid_row'
    | 'duplicate_key'
    | 'sku_name_conflict'
  message: string
}

export interface CsvImportResult {
  blocked: boolean
  rows: StoreDataRow[]
  missingFields: string[]
  skippedRows: number
  issues: DataQualityIssue[]
}

const nonEmptyText = z.string().trim().min(1)

const dateString = z.string().trim().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'date 必须是有效的 YYYY-MM-DD')

const numericValue = (integer: boolean) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'string' && value.trim() === '') return undefined
      return typeof value === 'number' ? value : Number(value)
    },
    integer ? z.number().finite().int().nonnegative() : z.number().finite().nonnegative(),
  )

const rowSchema = z
  .object({
    date: dateString,
    sku_id: nonEmptyText,
    sku_name: nonEmptyText,
    impressions: numericValue(true),
    clicks: numericValue(true),
    orders: numericValue(true),
    units_sold: numericValue(true),
    gmv: numericValue(false),
    refund_orders: numericValue(true),
    refund_amount: numericValue(false),
    stock: numericValue(true),
    shipped_orders: numericValue(true),
    shipped_within_48h_orders: numericValue(true),
    avg_ship_hours: numericValue(false),
  })
  .superRefine((row, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (row.clicks > row.impressions) add('clicks 不能大于 impressions')
    if (row.orders > row.clicks) add('orders 不能大于 clicks')
    if (row.units_sold < row.orders) add('units_sold 不能小于 orders')
    if (row.refund_orders > row.orders) add('refund_orders 不能大于 orders')
    if (row.refund_amount > row.gmv) add('refund_amount 不能大于 gmv')
    if (row.shipped_orders > row.orders) add('shipped_orders 不能大于 orders')
    if (row.shipped_within_48h_orders > row.shipped_orders) {
      add('shipped_within_48h_orders 不能大于 shipped_orders')
    }
  })

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => issue.message).join('；')

export function parseMerchantCsv(csvText: string): CsvImportResult {
  if (!csvText.trim()) {
    return {
      blocked: true,
      rows: [],
      missingFields: [...REQUIRED_CSV_FIELDS],
      skippedRows: 0,
      issues: [{ row: null, severity: 'error', code: 'empty_file', message: '文件为空' }],
    }
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })
  const fields = parsed.meta.fields ?? []
  const missingFields = REQUIRED_CSV_FIELDS.filter((field) => !fields.includes(field))
  if (missingFields.length > 0) {
    return {
      blocked: true,
      rows: [],
      missingFields,
      skippedRows: parsed.data.length,
      issues: [
        {
          row: null,
          severity: 'error',
          code: 'missing_fields',
          message: `缺少必填字段：${missingFields.join(', ')}`,
        },
      ],
    }
  }

  const rows: StoreDataRow[] = []
  const issues: DataQualityIssue[] = []
  const keys = new Set<string>()
  const skuNames = new Map<string, string>()

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 2
    const result = rowSchema.safeParse(raw)
    if (!result.success) {
      issues.push({
        row: rowNumber,
        severity: 'error',
        code: 'invalid_row',
        message: formatZodError(result.error),
      })
      return
    }

    const row = result.data as StoreDataRow
    const key = `${row.date}::${row.sku_id}`
    if (keys.has(key)) {
      issues.push({
        row: rowNumber,
        severity: 'error',
        code: 'duplicate_key',
        message: `重复主键：${row.date} + ${row.sku_id}`,
      })
      return
    }
    keys.add(key)

    const previousName = skuNames.get(row.sku_id)
    if (previousName && previousName !== row.sku_name) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        code: 'sku_name_conflict',
        message: `${row.sku_id} 出现名称变化，将在聚合时采用最新日期名称`,
      })
    }
    skuNames.set(row.sku_id, row.sku_name)
    rows.push(row)
  })

  const skippedRows = issues.filter((issue) => issue.severity === 'error').length
  return {
    blocked: rows.length === 0,
    rows,
    missingFields: [],
    skippedRows,
    issues,
  }
}

