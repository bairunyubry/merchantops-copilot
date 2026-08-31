import {
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  FileWarning,
  Info,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ActionCenterPage } from './components/ActionCenterPage'
import { DiagnosisPage } from './components/DiagnosisPage'
import { TrendChart } from './components/TrendChart'
import { WeeklyReviewPage } from './components/WeeklyReviewPage'
import { parseMerchantCsv, type CsvImportResult } from './lib/csv'
import {
  buildDashboardSnapshot,
  type DiagnosisFinding,
  type PrimaryFinding,
} from './lib/dashboard'
import type { StoreDataRow } from './types/data'

const DEFAULT_SCENARIO = 'combo_all_round'

const SCENARIOS = [
  { id: 'combo_growth_pressure', name: '组合A｜增长承压', file: 'qingyou-combo-growth-pressure-30d.csv', group: 'complex' },
  { id: 'combo_service_breakdown', name: '组合B｜服务链路失速', file: 'qingyou-combo-service-breakdown-30d.csv', group: 'complex' },
  { id: 'combo_all_round', name: '组合C｜全链路告警', file: 'qingyou-combo-all-round-30d.csv', group: 'complex' },
  { id: 'combo_cashflow_risk', name: '组合D｜收入与供给风险', file: 'qingyou-combo-cashflow-risk-30d.csv', group: 'complex' },
  { id: 'combo_operations_overload', name: '组合E｜运营承载不足', file: 'qingyou-combo-operations-overload-30d.csv', group: 'complex' },
  { id: 'sku_concentration', name: '旗舰异常', file: 'qingyou-sku-concentration-30d.csv', group: 'single' },
  { id: 'conversion_drop', name: '转化下降', file: 'qingyou-conversion-drop-30d.csv', group: 'single' },
  { id: 'refund_spike', name: '退款异常', file: 'qingyou-refund-spike-30d.csv', group: 'single' },
  { id: 'fulfillment_delay', name: '履约异常', file: 'qingyou-fulfillment-delay-30d.csv', group: 'single' },
  { id: 'inventory_shortage', name: '库存不足', file: 'qingyou-inventory-shortage-30d.csv', group: 'single' },
] as const

type TrendMetric = 'netRevenue' | 'gmv' | 'orders' | 'refundOrderRate'

interface RuleAnswer {
  summary: string
  evidence: string[]
  action: string
  verification: string
  caveat: string
}

const money = (value: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value)

const integer = (value: number) => new Intl.NumberFormat('zh-CN').format(Math.round(value))
const rate = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(2)}%`)
const ratioDelta = (current: number, baseline: number) =>
  baseline === 0 ? null : (current - baseline) / baseline
const rateDelta = (current: number | null, baseline: number | null) =>
  current === null || baseline === null ? null : (current - baseline) * 100
const signedPercent = (value: number | null) =>
  value === null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
const signedPp = (value: number | null) =>
  value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}pp`

function ruleAnswerFor(finding: PrimaryFinding, question: string): RuleAnswer {
  const actions: Record<PrimaryFinding['code'], string> = {
    sku_concentration: '优先抽查关联 SKU 最近批次质量，并将延迟发货订单与退款原因交叉核对。',
    refund_spike: '先按退款原因和 SKU 拆分异常订单，优先处理贡献最高且可快速验证的问题。',
    conversion_drop: '检查高影响 SKU 的商品信息、价格和流量结构变化，并对关键页面做小范围修正。',
    fulfillment_delay: '核对延迟订单集中的 SKU，区分缺货、仓内处理和物流揽收三个环节。',
    inventory_shortage: '确认在途补货和未来活动计划，在缺货前调整补货量或降低该 SKU 的投放强度。',
    no_material_issue: '保持观察，并结合近期活动计划检查规则未覆盖的客单价和流量结构变化。',
  }
  const verifications: Record<PrimaryFinding['code'], string> = {
    sku_concentration: '记录处理日期，7 天后复查该 SKU 退款率、发货时长和退款原因分布。',
    refund_spike: '7 天后比较全店及重点 SKU 退款率，并确认订单量没有明显缩小。',
    conversion_drop: '7 天后比较点击—支付转化率，同时观察点击量和流量结构是否稳定。',
    fulfillment_delay: '7 天后复查 48 小时发货达成率，并按延迟环节确认改善是否持续。',
    inventory_shortage: '每日更新期末库存和在途量，7 天后确认库存覆盖天数是否恢复。',
    no_material_issue: '继续观察 7 天，若指标触发阈值再创建针对性行动。',
  }

  return {
    summary: question.includes('GMV')
      ? `GMV 变化需要结合流量、转化和退款共同判断；当前最高优先级线索是：${finding.title}。`
      : finding.title,
    evidence: finding.evidence,
    action: actions[finding.code],
    verification: verifications[finding.code],
    caveat: finding.caveat,
  }
}

function KpiCard({
  label,
  value,
  delta,
  detail,
  tone = 'neutral',
  title,
}: {
  label: string
  value: string
  delta: string
  detail: string
  tone?: 'neutral' | 'risk' | 'good'
  title: string
}) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <div className="kpi-label" title={title}>
        <span>{label}</span>
        <Info size={13} aria-hidden="true" />
        {tone === 'risk' && <span className="risk-tag">风险</span>}
      </div>
      <div className="kpi-value-row">
        <strong>{value}</strong>
        <span className={`kpi-delta delta-${tone}`}>{delta}</span>
      </div>
      <p>{detail}</p>
    </article>
  )
}

function QualityModal({ result, onClose }: { result: CsvImportResult; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="quality-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">CSV DATA QUALITY</p>
            <h2 id="quality-title">数据校验报告</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className={`quality-summary ${result.blocked ? 'quality-blocked' : ''}`}>
          {result.blocked ? <FileWarning size={22} /> : <CheckCircle2 size={22} />}
          <div>
            <strong>{result.blocked ? '本次导入已阻止' : '数据可以使用'}</strong>
            <p>有效 {result.rows.length} 行，跳过 {result.skippedRows} 行，共发现 {result.issues.length} 项提示。</p>
          </div>
        </div>
        {result.missingFields.length > 0 && (
          <div className="missing-fields">
            <strong>缺少必填字段</strong>
            <div>{result.missingFields.map((field) => <code key={field}>{field}</code>)}</div>
          </div>
        )}
        <div className="issue-list">
          {result.issues.length === 0 ? (
            <div className="empty-inline">没有发现字段或数据质量问题。</div>
          ) : (
            result.issues.slice(0, 20).map((issue, index) => (
              <div className={`issue-row issue-${issue.severity}`} key={`${issue.code}-${issue.row}-${index}`}>
                <span>{issue.row ? `第 ${issue.row} 行` : '文件级'}</span>
                <p>{issue.message}</p>
              </div>
            ))
          )}
        </div>
        <footer className="modal-footer">
          <span>非法数字、重复主键和空行会被跳过；缺少必填字段时不会替换当前看板。</span>
          <button className="button button-primary" type="button" onClick={onClose}>知道了</button>
        </footer>
      </section>
    </div>
  )
}

function AiDrawer({
  finding,
  initialQuestion,
  onCreateAction,
  onClose,
}: {
  finding: PrimaryFinding
  initialQuestion?: string
  onCreateAction: (finding: PrimaryFinding) => void
  onClose: () => void
}) {
  const presets = ['今天有什么经营问题？', 'GMV 为什么下降？', '我应该先处理什么？', '哪些 SKU 需要关注？']
  const [input, setInput] = useState('')
  const [question, setQuestion] = useState(initialQuestion ?? '')
  const [answer, setAnswer] = useState<RuleAnswer | null>(
    initialQuestion ? ruleAnswerFor(finding, initialQuestion) : null,
  )

  const ask = (value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    setQuestion(normalized)
    setAnswer(ruleAnswerFor(finding, normalized))
    setInput('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    ask(input)
  }

  return (
    <>
      <button className="drawer-scrim" type="button" aria-label="关闭经营助手" onClick={onClose} />
      <aside className="ai-drawer" aria-label="AI 经营助手">
        <header className="ai-header">
          <div className="ai-title">
            <span className="ai-icon"><Sparkles size={18} /></span>
            <div><strong>AI 经营助手</strong><span>规则建议模式 · DeepSeek 下一阶段接入</span></div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="收起 AI 助手"><X size={18} /></button>
        </header>
        <div className="ai-body">
          <div className="ai-privacy"><Database size={14} />只读取当前聚合结果，不读取订单明细或个人信息</div>
          <section className="preset-section">
            <p>你可以这样问</p>
            <div className="preset-grid">{presets.map((preset) => <button type="button" key={preset} onClick={() => ask(preset)}>{preset}</button>)}</div>
          </section>
          {question && <div className="user-bubble"><strong>{question}</strong><span>你的问题</span></div>}
          {answer ? (
            <article className="answer-card">
              <section><h3>结论</h3><p>{answer.summary}</p></section>
              <section><h3>数据证据</h3><ul>{answer.evidence.map((item) => <li key={item}>{item}</li>)}</ul></section>
              <section><h3>建议先做</h3><p>{answer.action}</p></section>
              <section><h3>验证方法</h3><p>{answer.verification}</p></section>
              <div className="caveat"><Info size={15} /><span>{answer.caveat}</span></div>
              <button className="button button-primary" type="button" onClick={() => onCreateAction(finding)}><ListTodo size={15} />采纳为行动工单</button>
            </article>
          ) : (
            <div className="ai-empty"><Bot size={28} /><strong>从一个经营问题开始</strong><p>回答将引用当前看板证据，并说明验证方法和不确定性。</p></div>
          )}
        </div>
        <form className="ai-composer" onSubmit={submit}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入经营问题…" aria-label="输入经营问题" />
          <button type="submit" aria-label="发送"><Send size={17} /></button>
        </form>
        <p className="ai-disclaimer">AI 建议仅作辅助判断，不代表实际经营结果</p>
      </aside>
    </>
  )
}

export default function App() {
  const [rows, setRows] = useState<StoreDataRow[]>([])
  const [selectedScenario, setSelectedScenario] = useState<string>(DEFAULT_SCENARIO)
  const [customFileName, setCustomFileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiQuestion, setAiQuestion] = useState<string | undefined>()
  const [aiFinding, setAiFinding] = useState<PrimaryFinding | null>(null)
  const routeForPath = (path: string): 'overview' | 'diagnosis' | 'actions' | 'review' => {
    if (path.startsWith('/diagnosis')) return 'diagnosis'
    if (path.startsWith('/actions')) return 'actions'
    if (path.startsWith('/review')) return 'review'
    return 'overview'
  }
  const [route, setRoute] = useState<'overview' | 'diagnosis' | 'actions' | 'review'>(() => routeForPath(window.location.pathname))
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('netRevenue')
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadScenario = async (id: string) => {
    const scenario = SCENARIOS.find((item) => item.id === id) ?? SCENARIOS[0]
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`/data/scenarios/${scenario.file}`)
      if (!response.ok) throw new Error(`示例数据加载失败（${response.status}）`)
      const result = parseMerchantCsv(await response.text())
      if (result.blocked) throw new Error(result.issues[0]?.message ?? '示例数据校验失败')
      setRows(result.rows)
      setImportResult(result)
      setSelectedScenario(scenario.id)
      setCustomFileName('')
      setNotice(`已切换为“${scenario.name}”演示数据`)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '示例数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadScenario(DEFAULT_SCENARIO)
  }, [])

  useEffect(() => {
    const handlePopState = () => setRoute(routeForPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const snapshot = useMemo(() => (rows.length > 0 ? buildDashboardSnapshot(rows) : null), [rows])

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setNotice('文件超过 5MB，请压缩后重试')
      return
    }
    const result = parseMerchantCsv(await file.text())
    setImportResult(result)
    if (result.blocked) {
      setQualityOpen(true)
      return
    }
    setRows(result.rows)
    setSelectedScenario('custom')
    setCustomFileName(file.name)
    setLoadError('')
    setNotice(`已导入 ${file.name}，有效数据 ${result.rows.length} 行`)
    if (result.issues.length > 0) setQualityOpen(true)
  }

  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    setRoute(routeForPath(path))
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const openAi = (question?: string, targetFinding?: PrimaryFinding) => {
    setAiQuestion(question)
    setAiFinding(targetFinding ?? snapshot?.primaryFinding ?? null)
    setAiOpen(true)
  }

  if (loading && !snapshot) {
    return <div className="page-state"><LoaderCircle className="spin" size={28} /><strong>正在加载青柚研究所示例数据…</strong></div>
  }

  if (loadError && !snapshot) {
    return <div className="page-state page-error"><FileWarning size={30} /><strong>经营数据加载失败</strong><p>{loadError}</p><button className="button button-primary" onClick={() => void loadScenario(DEFAULT_SCENARIO)}>重新加载</button></div>
  }

  if (!snapshot) return null

  const current = snapshot.current
  const baseline = snapshot.baseline
  const netRevenue = current.gmv - current.refundAmount
  const baselineNetRevenue = baseline.gmv - baseline.refundAmount
  const gmvDelta = ratioDelta(current.gmv, baseline.gmv)
  const netDelta = ratioDelta(netRevenue, baselineNetRevenue)
  const ordersDelta = ratioDelta(current.orders, baseline.orders)
  const cvrDelta = ratioDelta(current.clickOrderCvr ?? 0, baseline.clickOrderCvr ?? 0)
  const refundDelta = rateDelta(current.refundOrderRate, baseline.refundOrderRate)
  const shipDelta = rateDelta(current.ship48hRate, baseline.ship48hRate)
  const finding = snapshot.primaryFinding
  const currentScenarioName = selectedScenario === 'custom'
    ? customFileName
    : SCENARIOS.find((item) => item.id === selectedScenario)?.name
  const scopeKey = selectedScenario === 'custom'
    ? `custom:${customFileName}:${snapshot.dateRange.from}:${snapshot.dateRange.to}:${snapshot.rowCount}`
    : `scenario:${selectedScenario}`
  const searchParams = new URLSearchParams(window.location.search)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><BarChart3 size={19} /></span><div><strong>商家经营罗盘</strong><small>MerchantOps Copilot</small></div></div>
        <nav aria-label="产品导航">
          <button className={`nav-item ${route === 'overview' ? 'nav-active' : ''}`} type="button" onClick={() => navigate('/')}><LayoutDashboard size={17} />经营总览</button>
          <button className={`nav-item ${route === 'diagnosis' ? 'nav-active' : ''}`} type="button" onClick={() => navigate('/diagnosis')}><TriangleAlert size={17} />异常诊断{snapshot.findings.length > 0 && <span>{snapshot.findings.length}</span>}</button>
          <button className={`nav-item ${route === 'actions' ? 'nav-active' : ''}`} type="button" onClick={() => navigate('/actions')}><ListTodo size={17} />行动工单</button>
          <button className={`nav-item ${route === 'review' ? 'nav-active' : ''}`} type="button" onClick={() => navigate('/review')}><ClipboardCheck size={17} />周度复盘</button>
        </nav>
        <div className="sidebar-foot"><Database size={14} /><span>上传数据仅在浏览器本地解析</span></div>
      </aside>

      <div className="workspace">
        {route === 'diagnosis' ? (
          <DiagnosisPage
            snapshot={snapshot}
            initialFindingId={searchParams.get('finding') ?? undefined}
            sourceName={selectedScenario === 'custom' ? `上传：${customFileName}` : `演示场景：${currentScenarioName}`}
            scenarios={SCENARIOS}
            selectedScenario={selectedScenario}
            onScenarioChange={(id) => void loadScenario(id)}
            onBack={() => navigate('/')}
            onExplain={(target: DiagnosisFinding) => openAi('请解释这个经营异常，并告诉我应该先做什么。', target)}
            onCreateAction={(target: DiagnosisFinding) => navigate(`/actions?create=1&finding=${encodeURIComponent(target.id)}&source=rule`)}
          />
        ) : route === 'actions' ? (
          <ActionCenterPage
            snapshot={snapshot}
            rows={rows}
            scopeKey={scopeKey}
            sourceName={selectedScenario === 'custom' ? `上传：${customFileName}` : `演示场景：${currentScenarioName}`}
            scenarios={SCENARIOS}
            selectedScenario={selectedScenario}
            initialFindingId={searchParams.get('finding') ?? undefined}
            initialSource={searchParams.get('source') === 'ai' ? 'ai' : 'rule'}
            onScenarioChange={(id) => void loadScenario(id)}
            onGoDiagnosis={() => navigate('/diagnosis')}
          />
        ) : route === 'review' ? (
          <WeeklyReviewPage
            snapshot={snapshot}
            rows={rows}
            scopeKey={scopeKey}
            sourceName={selectedScenario === 'custom' ? `上传：${customFileName}` : `演示场景：${currentScenarioName}`}
            scenarios={SCENARIOS}
            selectedScenario={selectedScenario}
            onScenarioChange={(id) => void loadScenario(id)}
            onGoActions={() => navigate('/actions')}
          />
        ) : (
        <>
        <header className="topbar">
          <div className="page-title"><h1>经营总览</h1><p>青柚研究所 · 美妆个护 · 数据截止 {snapshot.latestCompleteDate}</p></div>
          <div className="top-actions">
            <label className="select-control">
              <span className="sr-only">切换演示场景</span>
              <select value={selectedScenario} onChange={(event) => event.target.value !== 'custom' && void loadScenario(event.target.value)} disabled={loading}>
                {selectedScenario === 'custom' && <option value="custom">上传：{customFileName}</option>}
                <optgroup label="复杂多异常验收">
                  {SCENARIOS.filter((scenario) => scenario.group === 'complex').map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}
                </optgroup>
                <optgroup label="单异常基础样例">
                  {SCENARIOS.filter((scenario) => scenario.group === 'single').map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}
                </optgroup>
              </select>
            </label>
            <a className="button button-secondary" href="/data/csv-template.csv" download><Download size={15} />下载模板</a>
            <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} />导入 CSV</button>
            <input className="sr-only" ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => void handleImport(event)} />
            <button className="button button-secondary button-icon-text" type="button" onClick={() => void loadScenario(DEFAULT_SCENARIO)}><RotateCcw size={15} />重置</button>
            <button className="button button-ai" type="button" onClick={() => openAi()}><Sparkles size={15} />AI</button>
          </div>
        </header>

        <main className="dashboard">
          {loadError && <div className="inline-error"><FileWarning size={16} />{loadError}，当前仍展示上一次成功数据。</div>}
          <section className="data-banner">
            <div className="data-source"><span className={`source-dot ${selectedScenario === 'custom' ? 'source-custom' : ''}`} /><div><strong>{selectedScenario === 'custom' ? '当前使用用户上传数据' : '当前使用演示合成数据'}</strong><p>{snapshot.dateRange.from} 至 {snapshot.dateRange.to} · {snapshot.rowCount} 行 · {snapshot.skuCount} 个 SKU · {currentScenarioName}</p></div></div>
            <button className="quality-link" type="button" onClick={() => setQualityOpen(true)}><CheckCircle2 size={15} /><span>数据质量：{importResult?.issues.length ? `${importResult.issues.length} 项提示` : '通过'}</span><ChevronRight size={14} /></button>
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><h2>核心经营指标</h2><p>本期 {current.from.slice(5)}–{current.to.slice(5)} · 对比前 7 日</p></div>
            <div className="kpi-grid">
              <KpiCard label="GMV" value={money(current.gmv)} delta={signedPercent(gmvDelta)} detail="支付口径 · 当前 7 日" tone={(gmvDelta ?? 0) < -0.05 ? 'risk' : 'neutral'} title="GMV = 所有 SKU 支付金额之和" />
              <KpiCard label="净收入" value={money(netRevenue)} delta={signedPercent(netDelta)} detail="GMV − 退款金额" tone={(netDelta ?? 0) < -0.05 ? 'risk' : 'neutral'} title="净收入 = GMV − 退款金额，不等于利润" />
              <KpiCard label="支付订单行" value={integer(current.orders)} delta={signedPercent(ordersDelta)} detail="SKU 支付订单行数" tone={(ordersDelta ?? 0) < -0.1 ? 'risk' : 'neutral'} title="同一订单购买两个 SKU 计为两个订单行" />
              <KpiCard label="点击—支付转化率" value={rate(current.clickOrderCvr)} delta={signedPercent(cvrDelta)} detail="支付订单行 / 点击数" tone={(cvrDelta ?? 0) < -0.2 ? 'risk' : 'neutral'} title="点击—支付转化率 = 支付订单行 / 点击数" />
              <KpiCard label="退款率" value={rate(current.refundOrderRate)} delta={signedPp(refundDelta)} detail="退款订单 / 支付订单行" tone={(refundDelta ?? 0) >= 3 ? 'risk' : (refundDelta ?? 0) < 0 ? 'good' : 'neutral'} title="订单退款率 = 退款订单行 / 支付订单行" />
              <KpiCard label="48h 发货达成率" value={rate(current.ship48hRate)} delta={signedPp(shipDelta)} detail="48h 内发货 / 已发货" tone={(current.ship48hRate ?? 0) < 0.9 ? 'risk' : (shipDelta ?? 0) > 0 ? 'good' : 'neutral'} title="48 小时发货达成率 = 48 小时内发货订单 / 已发货订单" />
            </div>
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><h2>本周最需要处理的问题</h2></div>
            <article className={`finding-card severity-${finding.severity}`}>
              <div className="finding-top"><span className="severity-badge">{finding.severity === 'high' ? '高风险' : finding.severity === 'medium' ? '需关注' : '暂稳定'}</span><h3>{finding.title}</h3></div>
              <p className="finding-summary">{finding.summary}</p>
              <div className="finding-bottom">
                <div className="evidence-box"><strong>数据证据</strong><div>{finding.evidence.map((item) => <span key={item}>{item}</span>)}</div><p>待验证：{finding.caveat}</p></div>
                <div className="finding-actions"><span>置信度 {Math.round(finding.confidence * 100)}%</span><button className="button button-secondary" type="button" onClick={() => navigate(`/diagnosis?finding=${finding.id}`)}>查看完整诊断</button><button className="button button-primary" type="button" onClick={() => openAi('请解释这个经营异常，并告诉我应该先做什么。', finding)}><MessageSquareText size={15} />让 AI 解释</button></div>
              </div>
            </article>
          </section>

          <section className="dashboard-section">
            <div className="section-heading chart-heading"><div><h2>近 30 天经营趋势</h2><p>单位、周期与来源随指标同步展示</p></div><label className="metric-picker"><span>查看指标</span><select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value as TrendMetric)}><option value="netRevenue">净收入</option><option value="gmv">GMV</option><option value="orders">支付订单行</option><option value="refundOrderRate">退款率</option></select></label></div>
            <div className="chart-card"><div className="chart-meta"><span>粒度：日</span><span>来源：当前{selectedScenario === 'custom' ? '上传' : '演示'}数据</span></div><TrendChart points={snapshot.daily} metric={trendMetric} /></div>
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><h2>问题定位</h2><p>用于支持第一步判断，不代表确定因果</p></div>
            <div className="diagnosis-grid">
              <article className="panel-card"><header><div><h3>SKU 异常贡献排行</h3><p>按当前最高优先级异常贡献排序</p></div></header><div className="contribution-list">{snapshot.skuContributions.slice(0, 3).map((item, index) => <div className="contribution-row" key={item.skuId}><span className="rank">{index + 1}</span><div className="sku-label"><strong>{item.skuName}</strong><small>{item.skuId}</small></div><div className="bar-track"><span style={{ width: `${Math.max(4, item.contribution * 100)}%` }} /></div><b>{Math.round(item.contribution * 100)}%</b></div>)}</div><button className="text-button" type="button" disabled>查看全部 SKU 明细 <ChevronRight size={14} /></button></article>
              <article className="panel-card"><header><div><h3>经营健康</h3><p>商品、库存、履约、售后四维规则诊断</p></div></header><div className="health-list">{snapshot.health.map((item) => <div className="health-row" key={item.id}><span>{item.label}</span><div className="health-track"><span className={`health-${item.status}`} style={{ width: `${item.score}%` }} /></div><b className={`health-label health-${item.status}`}>{item.status === 'good' ? '良好' : item.status === 'attention' ? '关注' : '风险'}</b></div>)}</div><button className="text-button" type="button" disabled>查看健康口径 <ChevronRight size={14} /></button></article>
            </div>
          </section>

          <footer className="data-notice"><Info size={15} /><div><strong>数据来源说明</strong><p>交易字段参考 UCI Online Retail 数据结构；曝光、点击、库存、履约和退款为合成字段，仅用于产品演示。系统未接入任何社交或购物平台官方 API。</p></div></footer>
        </main>
        </>
        )}
      </div>

      {qualityOpen && importResult && <QualityModal result={importResult} onClose={() => setQualityOpen(false)} />}
      {aiOpen && aiFinding && <AiDrawer key={`${selectedScenario}-${aiFinding.id}-${aiQuestion ?? 'empty'}`} finding={aiFinding} initialQuestion={aiQuestion} onClose={() => setAiOpen(false)} onCreateAction={(target) => { setAiOpen(false); navigate(`/actions?create=1&finding=${encodeURIComponent(target.id)}&source=ai`) }} />}
      {notice && <div className="toast" role="status"><CheckCircle2 size={16} />{notice}</div>}
    </div>
  )
}
