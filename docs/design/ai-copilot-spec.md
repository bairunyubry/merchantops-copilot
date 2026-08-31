# AI 经营助手能力边界、调用流程与 Prompt v0.1

## 1. 产品定位

AI 经营助手不是第二套诊断引擎，也不重新计算经营指标。它读取规则层已经产出的聚合事实，完成三件事：

1. 回答用户的经营问题；
2. 把异常证据翻译成可理解、可验证的行动建议；
3. 结合工单执行和指标变化生成复盘解释与候选经验。

用户只输入自然语言问题，例如“今天有什么经营问题”“GMV 为什么下降”“这张工单有效吗”。系统自动组装当前店铺上下文，用户不需要手动提供数据。

## 2. 规则、AI 与用户的责任边界

| 事项 | 系统规则 | AI | 用户 |
| --- | --- | --- | --- |
| 指标计算与口径 | 唯一事实来源 | 只能引用 | 不可在对话中修改 |
| 异常是否触发 | 按阈值判断 | 不得新增“已触发异常” | 可补充业务背景 |
| 异常优先级 | 按固定评分排序 | 解释为什么优先 | 决定先处理什么 |
| 原因判断 | 只给相关证据 | 生成待验证假设 | 结合订单、商品和现场验证 |
| 行动建议 | 提供规则底稿 | 结合问题生成具体动作 | 确认后转为工单 |
| 工单状态 | 根据用户操作记录 | 不得代替用户执行 | 更新待处理、进行中、已执行 |
| 指标恢复 | 按冻结阈值和观察窗判断 | 解释改善意义与干扰因素 | 确认是否关单 |
| 经验沉淀 | 提供前后事实 | 草拟适用场景、动作和限制 | 确认后保存 |

核心原则：规则是事实层，AI 是解释层，用户是决策层。

## 3. AI 使用入口

### 经营总览

- 默认问题：今天有什么经营问题？
- 常见问题：GMV 为什么下降、应该先处理什么、哪些 SKU 需要关注；
- 自动读取：当前/基线 KPI、全部 Finding、SKU 贡献和数据质量；
- 输出：经营摘要、优先处理问题、行动建议和验证方法。

### 异常诊断

- 用户点击某条异常的“让 AI 解释”；
- 自动追加 `selectedFindingId`；
- 输出必须围绕该异常，不得忽略其他更高优先级问题；
- 建议可以一键转为行动工单，并冻结对应 Finding。

### 周度复盘

- 自动读取自然周事实、工单、监控结果和前后指标；
- AI 解释改善、未恢复和并行行动造成的不确定性；
- 规则状态不可被 AI 改写；
- 经验只生成候选稿，用户确认后才能沉淀。

## 4. 自动组装的经营上下文

MVP 数据存在浏览器，因此由前端 `buildAiContext` 自动组装聚合结果并发送服务端。用户不填写 context；界面只展示问题输入框。

```json
{
  "surface": "overview",
  "question": "今天有什么经营问题？",
  "selectedFindingId": null,
  "store": {
    "name": "青柚研究所",
    "industry": "美妆个护",
    "sourceType": "online_csv",
    "isSynthetic": true,
    "latestCompleteDate": "2026-09-05",
    "period": { "from": "2026-08-30", "to": "2026-09-05" },
    "baselinePeriod": { "from": "2026-08-23", "to": "2026-08-29" }
  },
  "metrics": {
    "current": {},
    "baseline": {},
    "deltas": {}
  },
  "findings": [
    {
      "id": "finding-fulfillment",
      "rank": 1,
      "title": "48 小时发货达成率低于 90%",
      "severity": "high",
      "priorityScore": 86,
      "evidence": [],
      "caveat": "只能定位延迟分布，具体环节仍需核查",
      "ruleSuggestion": "核对延迟订单集中的 SKU"
    }
  ],
  "actions": [],
  "weeklyReview": null,
  "dataQuality": {
    "validRows": 360,
    "skippedRows": 0,
    "issues": []
  }
}
```

禁止发送：原始 CSV、单笔订单、姓名、手机号、地址、账号凭据、数据源访问密钥。

## 5. API 契约

### 请求

`POST /api/advice`

```json
{
  "accessCode": "演示口令",
  "question": "今天有什么经营问题？",
  "surface": "overview",
  "selectedFindingId": null,
  "context": {}
}
```

- `surface`: `overview | diagnosis | review`；
- `question`: 1—300 字；
- `context`: 只接受服务定义的聚合字段，拒绝未知超大对象；
- 请求体建议限制在 100KB；
- 错误口令返回 401；
- 输入不合法返回 422。

### 成功或降级响应

```json
{
  "mode": "ai",
  "answer": "当前最需要处理的是履约异常……",
  "evidence": [
    {
      "findingId": "finding-fulfillment",
      "text": "48 小时发货达成率 74.41%，规则阈值为 90%"
    }
  ],
  "hypotheses": [
    {
      "statement": "延迟可能集中在缺货或仓内处理环节",
      "verification": "按 SKU 抽查延迟订单并标注延迟环节"
    }
  ],
  "priorityActions": [
    {
      "findingId": "finding-fulfillment",
      "action": "核查延迟订单集中的 SKU 和环节",
      "reason": "该问题当前优先级最高且影响已发货订单",
      "verification": "执行后观察 7 个完整自然日的 48 小时发货率"
    }
  ],
  "caveats": ["当前数据只能确认履约异常，不能确定具体延迟原因"],
  "meta": {
    "model": "deepseek-v4-flash",
    "generatedAt": "2026-08-31T12:00:00.000Z",
    "fallbackReason": null
  }
}
```

`mode` 取值：`ai | rule_fallback`。DeepSeek 超时、余额不足、空内容、非法 JSON 或 Zod 校验失败时，服务端返回同结构的规则建议，并在 `meta.fallbackReason` 说明原因。页面主流程不能报废。

## 6. DeepSeek 调用参数

```ts
client.chat.completions.create({
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(promptPayload) }
  ],
  response_format: { type: 'json_object' },
  thinking: { type: 'disabled' },
  max_tokens: 1200,
  stream: false
})
```

环境变量：

- `DEEPSEEK_API_KEY`；
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`；
- `DEEPSEEK_MODEL=deepseek-v4-flash`；
- `DEMO_ACCESS_CODE`。

API Key 和演示口令只存在于本地 `.env.local` 与 Vercel 服务端环境变量中，不能写入源码、返回体、浏览器存储或构建产物。

## 7. System Prompt v0.1

```text
你是“商家经营罗盘”的经营分析助手。你会收到一份系统自动生成的 JSON 经营上下文和一个用户问题。

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
}
```

## 8. 失败降级

```text
未配置 Key / 超时 / 余额不足 / 上游 5xx / 空内容 / JSON 解析失败 / Schema 失败
→ 记录服务端错误类别，不记录 Key 和完整用户数据
→ 调用现有 ruleAnswerFor / fallbackSummary
→ 返回 mode=rule_fallback 的同结构响应
→ 页面显示“规则建议模式”及降级原因
→ 用户仍可查看证据并转为工单
```

降级文案不得伪装成 AI 结果；也不应把技术报错原文直接展示给用户。

## 9. 验收条件

1. 用户只输入问题，系统自动带入当前经营上下文；
2. 三个页面读取到的是同一数据版本；
3. 回答中的数字都能在当前页面或 Finding 中核对；
4. AI 建议可以转为关联 Finding 的工单；
5. AI 不能改写规则排名和监控状态；
6. 错误口令 401、输入错误 422；
7. 超时、余额不足、空内容、非法 JSON 均进入规则降级；
8. 请求不包含原始 CSV 和个人信息；
9. 浏览器网络面板与构建产物中不存在 API Key；
10. `npm test` 与 `npm run build` 通过。

## 10. 官方接口依据

- DeepSeek API Quick Start：https://api-docs.deepseek.com/
- Chat Completions：https://api-docs.deepseek.com/api/create-chat-completion/
- JSON Output：https://api-docs.deepseek.com/guides/json_mode/
- Model List：https://api-docs.deepseek.com/api/list-models/

