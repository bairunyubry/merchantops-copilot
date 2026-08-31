import { describe, expect, it } from 'vitest'
import { PublicCsvError, validatePublicCsvUrl } from './csvProxy'

describe('公开 CSV 连接器地址边界', () => {
  it('接受不含凭据的公开 HTTPS 地址', () => {
    expect(validatePublicCsvUrl('https://example.com/store.csv').toString()).toBe('https://example.com/store.csv')
  })

  it.each([
    'http://example.com/store.csv',
    'https://localhost/store.csv',
    'https://127.0.0.1/store.csv',
    'https://192.168.1.8/store.csv',
    'https://user:secret@example.com/store.csv',
  ])('拒绝不安全地址 %s', (url) => {
    expect(() => validatePublicCsvUrl(url)).toThrow(PublicCsvError)
  })
})

