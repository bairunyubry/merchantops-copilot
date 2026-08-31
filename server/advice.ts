import { z } from 'zod'
import {
  adviceContentSchema,
  adviceRequestSchema,
  adviceResponseSchema,
  buildRuleFallback,
  type AdviceRequest,
  type AdviceResponse,
} from '../src/lib/ai'

export const SYSTEM_PROMPT = `你是“商家经营罗盘”的经营分析助手。你会收到一份系统自动生成的 JSON 经营上下文和一个用户问题。

你的职责：解释已有经营事实、提出待验证假设、给出可执行且可复盘的行动建议。

必须遵守：
1. 只能使用输入 JSON 中存在的指标、异常、证据、工单和复盘事实，禁止编造数字、平台规则、用户行为或外部行业结论。
2. 系统规则是唯一事实层。不得新增规则未触发的“确定异常”，不得修改 Finding 排名、严重程度、工单状态、监控状态或恢复结论。
3. 不得把相关性写成确定因果。原因只能写为“可能原因”或“待验证假设”，并必须给出验证方法。
4. 回答用户问题时优先引用 selectedFindingId；如果存在更高优先级问题，需要同时提醒，但不能篡改排序。
5. 每条行动建议必须关联一个已有 findingId；若无法关联，则不要生成该行动。
6. 行动建议必须包含动作、数据依据和执行后的验证方法，禁止声称一定带来增长或收益。
7. 如果数据不足以回答，明确说明缺少什么数据，不得用常识补齐为事实。
8. 输入标记 isSynthetic=true 时，明确这是模拟经营数据，不得称为真实商家结果。
9. 不输出 Markdown，不输出 JSON 之外的文字。

请输出合法 JSON，严格使用以下结构：
{
  "answer": "直接回答用户问题",
  "evidence": [{ "findingId": "已有 findingId 或 null", "text": "输入中可核对的数据证据" }],
  "hypotheses": [{ "statement": "待验证假设", "verification": "验证方法" }],
  "priorityActions": [{ "findingId": "已有 findingId", "action": "行动", "reason": "数据依据", "verification": "效果验证方法" }],
  "caveats": ["不确定性、数据限制或归因限制"]
}`

const upstreamSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string().nullable().optional(),
    message: z.object({ content: z.string().nullable() }),
  })).min(1),
})

export class AdviceFailure extends Error {
  reason: string

  constructor(reason: string, message: string) {
    super(message)
    this.name = 'AdviceFailure'
    this.reason = reason
  }
}

function withoutAccessCode(request: AdviceRequest): Omit<AdviceRequest, 'accessCode'> {
  const { accessCode: _accessCode, ...safe } = request
  return safe
}

function validateReferences(request: AdviceRequest, content: z.infer<typeof adviceContentSchema>) {
  const findingIds = new Set(request.context.findings.map((finding) => finding.id))
  const invalidEvidence = content.evidence.some((item) => item.findingId !== null && !findingIds.has(item.findingId))
  const invalidActions = content.priorityActions.some((item) => !findingIds.has(item.findingId))
  if (invalidEvidence || invalidActions) throw new AdviceFailure('invalid_reference', 'AI 返回了不存在的异常引用。')
}

export async function generateAdvice(requestValue: unknown, options?: {
  apiKey?: string
  baseUrl?: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<AdviceResponse> {
  const request = adviceRequestSchema.parse(requestValue)
  const apiKey = options?.apiKey
  if (!apiKey) return buildRuleFallback(withoutAccessCode(request), 'api_key_missing')

  const baseUrl = (options?.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const model = options?.model ?? 'deepseek-v4-flash'
  const fetchImpl = options?.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 12_000)
  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(withoutAccessCode(request)) },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 1200,
        stream: false,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new AdviceFailure('upstream_timeout', 'DeepSeek 请求超时。')
    throw new AdviceFailure('upstream_network', '无法连接 DeepSeek。')
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new AdviceFailure(response.status === 402 ? 'insufficient_balance' : 'upstream_error', `DeepSeek 返回 HTTP ${response.status}。`)

  let upstream: z.infer<typeof upstreamSchema>
  try {
    upstream = upstreamSchema.parse(await response.json())
  } catch {
    throw new AdviceFailure('invalid_upstream_response', 'DeepSeek 响应结构不合法。')
  }
  const text = upstream.choices[0]?.message.content?.trim()
  if (!text) throw new AdviceFailure('empty_content', 'DeepSeek 返回空内容。')
  let content: z.infer<typeof adviceContentSchema>
  try {
    content = adviceContentSchema.parse(JSON.parse(text))
  } catch (error) {
    throw new AdviceFailure(error instanceof SyntaxError ? 'invalid_json' : 'invalid_schema', 'DeepSeek 输出未通过结构校验。')
  }
  validateReferences(request, content)
  return adviceResponseSchema.parse({
    ...content,
    mode: 'ai',
    meta: { model, generatedAt: new Date().toISOString(), fallbackReason: null },
  })
}

export function safeFallback(requestValue: unknown, reason: string) {
  const request = adviceRequestSchema.parse(requestValue)
  return buildRuleFallback(withoutAccessCode(request), reason)
}

