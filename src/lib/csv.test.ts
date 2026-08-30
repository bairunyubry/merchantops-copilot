import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMerchantCsv } from './csv'

const validHeader =
  'date,sku_id,sku_name,impressions,clicks,orders,units_sold,gmv,refund_orders,refund_amount,stock,shipped_orders,shipped_within_48h_orders,avg_ship_hours'
const validRow = '2026-08-29,QY-001,示例SKU,100,20,3,4,199.00,0,0,100,3,3,18'

describe('parseMerchantCsv', () => {
  it('阻止缺少字段的文件', () => {
    const result = parseMerchantCsv('date,sku_id\n2026-08-29,QY-001')
    expect(result.blocked).toBe(true)
    expect(result.missingFields).toContain('gmv')
  })

  it('阻止空文件', () => {
    expect(parseMerchantCsv('  ').blocked).toBe(true)
  })

  it('跳过非法数字但保留合法行', () => {
    const csv = `${validHeader}\n${validRow}\n2026-08-28,QY-002,错误SKU,100,20,bad,4,199,0,0,100,3,3,18`
    const result = parseMerchantCsv(csv)
    expect(result.blocked).toBe(false)
    expect(result.rows).toHaveLength(1)
    expect(result.skippedRows).toBe(1)
  })

  it('跳过重复 date + sku_id 主键', () => {
    const result = parseMerchantCsv(`${validHeader}\n${validRow}\n${validRow}`)
    expect(result.rows).toHaveLength(1)
    expect(result.issues.some((issue) => issue.code === 'duplicate_key')).toBe(true)
  })

  it('跳过跨字段约束错误', () => {
    const invalid = '2026-08-29,QY-001,示例SKU,10,20,21,20,199,22,200,10,22,23,18'
    const result = parseMerchantCsv(`${validHeader}\n${invalid}`)
    expect(result.blocked).toBe(true)
    expect(result.issues[0].message).toContain('clicks 不能大于 impressions')
  })

  it('模板示例行合法', () => {
    const template = readFileSync(resolve('public/data/csv-template.csv'), 'utf8')
    const result = parseMerchantCsv(template)
    expect(result.blocked).toBe(false)
    expect(result.rows).toHaveLength(1)
  })
})

