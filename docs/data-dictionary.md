# 数据字段与五个平行场景

## 统一计算约定

- 原始粒度：每日 × SKU；`date + sku_id` 唯一。
- 展示周期：最近 30 个完整自然日。
- 当前诊断周期：最近 7 个完整自然日，即 2026-08-23 至 2026-08-29。
- 对比基线：此前 7 个完整自然日，即 2026-08-16 至 2026-08-22。
- 时区与币种：Asia/Shanghai，CNY。
- 数据来源：明确标注的合成经营数据；交易结构参考 UCI Online Retail，不来自平台官方 API。

## CSV 字段

| 字段 | 类型 | 约束 | 业务定义 |
|---|---|---|---|
| date | date | 必填，YYYY-MM-DD | 自然日 |
| sku_id | string | 必填 | 稳定且唯一的 SKU 标识 |
| sku_name | string | 必填 | SKU 展示名称 |
| impressions | integer | ≥0 | 有效曝光次数 |
| clicks | integer | 0～impressions | 商品入口点击次数 |
| orders | integer | 0～clicks | SKU 支付订单行数，不是店铺去重订单数 |
| units_sold | integer | ≥orders | 支付件数 |
| gmv | number | ≥0 | 支付成交金额，未扣退款 |
| refund_orders | integer | 0～orders | 退款 SKU 订单行数，MVP 为事件口径代理 |
| refund_amount | number | 0～gmv | 退款金额 |
| stock | integer | ≥0 | 自然日结束时可售库存 |
| shipped_orders | integer | 0～orders | 进入履约统计且已发货的 SKU 订单行数 |
| shipped_within_48h_orders | integer | 0～shipped_orders | 48 小时内发货订单行数 |
| avg_ship_hours | number | ≥0 | 平均发货时长，仅用于解释 |

## 五个平行场景

五组数据使用相同的 30 天、12 个 SKU 和基础经营规模，只改变异常相关参数，因此可以直接比较不同诊断规则的输出。

| 场景文件 | 主要诊断 | 设计目标 |
|---|---|---|
| qingyou-conversion-drop-30d.csv | 转化下降 | 当前转化率较基线相对下降超过 20% |
| qingyou-refund-spike-30d.csv | 退款异常 | 当前订单退款率较基线增加至少 3 个百分点，异常分散 |
| qingyou-fulfillment-delay-30d.csv | 履约异常 | 当前 48 小时发货达成率低于 90% |
| qingyou-inventory-shortage-30d.csv | 库存不足 | 防晒 SKU 最新库存可售天数小于 7 天 |
| qingyou-sku-concentration-30d.csv | 退款异常 + 单 SKU 集中 | 洁面 SKU 超额退款贡献超过 40%，并伴随发货变慢 |

默认旗舰场景使用 `qingyou-sku-concentration-30d.csv`。发货变慢与退款上涨仅形成待验证关联，数据不支持把它表述为确定因果。

### 规则验收快照

| 场景 | 基线 | 当前期 | 验收结论 |
|---|---|---|---|
| 转化下降 | 点击后下单转化率 11.83% | 7.89%，相对下降 33.29% | 超过 20%，触发 |
| 退款异常 | 订单退款率 3.16% | 9.83%，增加 6.67 个百分点 | 至少 3 个百分点，触发 |
| 履约异常 | — | 48 小时发货达成率 81.07% | 低于 90%，触发 |
| 库存不足 | — | 防晒 SKU 最新库存 18 件，近 7 日售出 129 件，可售 0.98 天 | 小于 7 天，触发 |
| 单 SKU 集中 | 全店退款率 3.16% | 6.38%，增加 3.23 个百分点；洁面 SKU 超额退款贡献 76.09% | 主退款异常成立且贡献超过 40%，触发 |

## 数据质量处理

- 缺少任一必填字段：阻止导入并列出缺失字段。
- 空文件或有效行数为 0：阻止进入诊断。
- 空行：直接跳过。
- 非法数字、重复主键、跨字段约束错误：跳过该行并计入数据质量提示。
- 同一 `sku_id` 名称冲突：保留数据并提示，聚合展示采用最新日期名称。
