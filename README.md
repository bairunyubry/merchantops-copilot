# 商家经营罗盘 MerchantOps Copilot

面向内容电商新手商家的经营诊断产品，把离线经营数据转化为“发现问题—解释证据—采取行动—复盘结果”的经营闭环。

## 当前阶段

- [x] 项目 Brief 与精简 PRD 评审通过
- [x] React + TypeScript + Vite 工程初始化
- [x] “青柚研究所”5 组平行 30 天示例数据
- [x] CSV 模板、字段校验与场景规则测试
- [ ] 经营总览与规则诊断
- [ ] AI 经营问答与规则降级
- [ ] Vercel 部署与求职材料

## 本地运行

```bash
pnpm install
pnpm dev
```

## 数据与隐私边界

项目不调用或模拟任何社交、电商平台官方 API。默认使用明确标注的合成数据；用户上传的原始 CSV 仅在浏览器本地解析，后续 AI 只接收聚合指标与规则诊断结果。

数据文件位于 `public/data/scenarios/`，字段说明见 `docs/data-dictionary.md`。可运行 `pnpm data:generate` 确定性地重新生成全部示例 CSV。
