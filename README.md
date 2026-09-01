# 商家经营罗盘 MerchantOps Copilot

面向内容电商新手商家的经营诊断产品，把离线经营数据转化为“发现问题—解释证据—采取行动—复盘结果”的经营闭环。

**国内在线体验：** [CloudBase 正式演示地址](https://barunyubry-d2g0c7kk2469a0a77-1479112522.ap-shanghai.app.tcloudbase.com/)AI演示口令：shangjiajingyingluopan

**备用地址：** [GitHub Pages 静态规则版](https://bairunyubry.github.io/merchantops-copilot/)

## 当前阶段

- [x] 项目 Brief 与精简 PRD 评审通过
- [x] React + TypeScript + Vite 工程初始化
- [x] “青柚研究所”5 组单异常＋5 组多异常 30 天示例数据
- [x] CSV 模板、字段校验与场景规则测试
- [x] 经营总览与规则诊断
- [x] 行动工单、指标监控与周度复盘
- [x] 本地 CSV 与公开在线 CSV 数据接入
- [x] AI 经营问答、行动预填与规则降级
- [x] 腾讯云 EdgeOne 国内生产部署
- [x] GitHub Pages 静态演示部署
- [x] CloudBase 国内前端、HTTP 云函数与 AI 服务部署
- [ ] 求职材料与演示脚本

## 本地运行

```bash
pnpm install
pnpm dev
```

AI 接口通过 Vite 本地中间件和 CloudBase HTTP 云函数提供，并保留 EdgeOne 与 Vercel 兼容实现。复制 `.env.example` 为 `.env.local`，并仅在服务端配置：

```text
DEEPSEEK_API_KEY=你的服务端密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEMO_ACCESS_CODE=分享给体验者的演示口令
```

未输入演示口令或 DeepSeek 不可用时，页面自动展示同结构的规则建议，不中断诊断、建单和复盘流程。运行 `pnpm test` 与 `pnpm build` 可执行完整验收。

GitHub Pages 版本用于长期公开展示，可运行示例数据、CSV 本地导入、规则诊断、行动工单和周度复盘。由于 GitHub Pages 仅托管静态文件，不能安全保存 DeepSeek Key 或运行服务端代理，因此该版本的 AI 使用规则降级；真实 DeepSeek 能力需要搭配独立的服务端函数。

## CloudBase 国内部署

国内主站使用 CloudBase 静态托管、HTTP 云函数和统一网关。配置见 `cloudbaserc.json`，发布前先执行预检：

```bash
tcb login --flow device
tcb validate
tcb deploy --dry-run
tcb deploy
```

网关将 `/api` 转发至 `merchantops-api`，其余路径交给静态托管。DeepSeek Key 与演示口令只配置在云函数环境变量中，不进入 Git 仓库或前端产物。

## EdgeOne 生产部署

生产环境使用腾讯云 EdgeOne Pages，通过官方 CLI 发布：

```bash
edgeone login --site china
edgeone makers deploy -n merchantops-copilot -e production --area global
```

在 EdgeOne 控制台的生产环境中配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 和 `DEMO_ACCESS_CODE`，配置后重新执行生产部署。变量值只保存在服务端，不应提交到 Git。

## 数据与隐私边界

项目不调用或模拟任何社交、电商平台官方 API。默认使用明确标注的合成数据；用户上传的原始 CSV 仅在浏览器本地解析，AI 只接收聚合指标、规则诊断、工单状态和复盘摘要，不接收订单明细或个人信息。API Key 与演示口令不会进入前端构建产物。

数据文件位于 `public/data/scenarios/`，字段说明见 `docs/data-dictionary.md`。其中 5 份组合场景可同时触发 2–4 个独立经营问题，用于验收规则合并、动态排序和异常切换。可运行 `pnpm data:generate` 确定性地重新生成全部示例 CSV。

AI 的规则/模型职责边界、请求结构、Prompt 与降级矩阵见 `docs/design/ai-copilot-spec.md`。
