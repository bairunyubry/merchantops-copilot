import { describe, expect, it, vi } from 'vitest'
import { AdviceFailure, generateAdvice, SYSTEM_PROMPT } from './advice'
import { adviceRequestFixture } from './advice.fixture'

const content = {
  answer: '当前优先处理洁面 SKU 退款率异常。',
  evidence: [{ findingId: 'finding-refund', text: '退款率由 5% 升至 15%' }],
  hypotheses: [{ statement: '履约可能影响退款', verification: '抽查退款原因与履约记录' }],
  priorityActions: [{ findingId: 'finding-refund', action: '抽查退款订单', reason: '退款率增加 10pp', verification: '观察后 7 日退款率' }],
  caveats: ['模拟数据，不代表真实商家结果。'],
}

const responseWith = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })

describe('DeepSeek advice service', () => {
  it('在未配置 API Key 时返回规则降级结果', async () => {
    const result = await generateAdvice(adviceRequestFixture)
    expect(result.mode).toBe('rule_fallback')
    expect(result.meta.fallbackReason).toBe('api_key_missing')
  })

  it('校验合法 JSON 并返回 AI 结果', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => responseWith({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] }))
    const result = await generateAdvice(adviceRequestFixture, { apiKey: 'key', fetchImpl: fetchMock as unknown as typeof fetch })
    expect(result.mode).toBe('ai')
    expect(result.priorityActions[0]?.findingId).toBe('finding-refund')
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(sent.response_format).toEqual({ type: 'json_object' })
    expect(sent.thinking).toEqual({ type: 'disabled' })
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain('demo-code')
  })

  it('拒绝非法 JSON', async () => {
    const fetchImpl = vi.fn(async () => responseWith({ choices: [{ message: { content: 'not-json' } }] })) as unknown as typeof fetch
    await expect(generateAdvice(adviceRequestFixture, { apiKey: 'key', fetchImpl })).rejects.toMatchObject({ reason: 'invalid_json' })
  })

  it('把超时标记为可降级错误', async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException('aborted', 'AbortError') }) as typeof fetch
    await expect(generateAdvice(adviceRequestFixture, { apiKey: 'key', fetchImpl })).rejects.toMatchObject({ reason: 'upstream_timeout' })
  })

  it('删除模型编造的 findingId，并用规则建议补齐行动', async () => {
    const invalid = { ...content, priorityActions: [{ ...content.priorityActions[0], findingId: 'invented' }] }
    const fetchImpl = vi.fn(async () => responseWith({ choices: [{ message: { content: JSON.stringify(invalid) } }] })) as typeof fetch
    const result = await generateAdvice(adviceRequestFixture, { apiKey: 'key', fetchImpl })
    expect(result.mode).toBe('ai')
    expect(result.priorityActions[0]?.findingId).toBe('finding-refund')
    expect(result.caveats.join('')).toContain('规则建议补齐')
  })

  it('系统提示词明确规则事实层和因果边界', () => {
    expect(SYSTEM_PROMPT).toContain('系统规则是唯一事实层')
    expect(SYSTEM_PROMPT).toContain('不得把相关性写成确定因果')
  })
})
