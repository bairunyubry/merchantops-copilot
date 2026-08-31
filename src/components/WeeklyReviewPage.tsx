import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Info,
  ListChecks,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  applyMonitoringResult,
  buildDemoWorkOrders,
  evaluateWorkOrder,
  formatMonitorValue,
  readStoredActions,
  writeStoredActions,
  type ActionWorkOrder,
} from '../lib/actions'
import type { DashboardSnapshot } from '../lib/dashboard'
import {
  buildWeeklyReview,
  getReviewPeriods,
  type WeeklyActionReview,
  type WeeklyKpi,
} from '../lib/weeklyReview'
import type { StoreDataRow } from '../types/data'

const money = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
}).format(value)
const rate = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`
const integer = (value: number) => new Intl.NumberFormat('zh-CN').format(Math.round(value))

const hypothesisLabel: Record<WeeklyActionReview['hypothesisStatus'], string> = {
  supported: '得到支持',
  partially_supported: '部分支持',
  unsupported: '未得到支持',
  pending: '暂无法判断',
}

function KpiReviewCard({ kpi }: { kpi: WeeklyKpi }) {
  const isMoney = kpi.id === 'gmv' || kpi.id === 'net_revenue'
  const value = isMoney ? money(kpi.current) : rate(kpi.current)
  const delta = kpi.delta === null
    ? '暂无有效对比'
    : kpi.deltaKind === 'pp'
      ? `${kpi.delta >= 0 ? '+' : ''}${kpi.delta.toFixed(2)}pp`
      : `${kpi.delta >= 0 ? '+' : ''}${(kpi.delta * 100).toFixed(1)}%`
  return <article className={`weekly-kpi ${kpi.risk ? 'weekly-kpi-risk' : 'weekly-kpi-good'}`}><span>{kpi.label}</span><strong>{value}</strong><small>较前期 {delta}</small></article>
}

export function WeeklyReviewPage({
  snapshot,
  rows,
  scopeKey,
  sourceName,
  scenarios,
  selectedScenario,
  onScenarioChange,
  onGoActions,
  onExplain,
}: {
  snapshot: DashboardSnapshot
  rows: StoreDataRow[]
  scopeKey: string
  sourceName: string
  scenarios: ReadonlyArray<{ id: string; name: string; group: 'complex' | 'single' }>
  selectedScenario: string
  onScenarioChange: (id: string) => void
  onGoActions: () => void
  onExplain: () => void
}) {
  const periods = useMemo(() => getReviewPeriods(rows), [rows])
  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[0]?.id ?? '')
  const [allOrders, setAllOrders] = useState<ActionWorkOrder[]>(() => readStoredActions())

  useEffect(() => {
    setSelectedPeriodId(periods[0]?.id ?? '')
  }, [periods, scopeKey])

  const currentOrders = useMemo(() => allOrders.filter((order) => order.scopeKey === scopeKey), [allOrders, scopeKey])

  useEffect(() => {
    if (currentOrders.length > 0 || snapshot.findings.length === 0 || ['custom', 'online'].includes(selectedScenario)) return
    const seeded = buildDemoWorkOrders(snapshot, scopeKey)
    const next = [...allOrders, ...seeded]
    setAllOrders(next)
    writeStoredActions(next)
  }, [allOrders, currentOrders.length, scopeKey, selectedScenario, snapshot])

  useEffect(() => {
    if (currentOrders.length === 0) return
    let changed = false
    const next = allOrders.map((order) => {
      if (order.scopeKey !== scopeKey) return order
      const evaluated = applyMonitoringResult(order, evaluateWorkOrder(order, rows, snapshot.latestCompleteDate))
      if (evaluated !== order) changed = true
      return evaluated
    })
    if (!changed) return
    setAllOrders(next)
    writeStoredActions(next)
  }, [allOrders, currentOrders.length, rows, scopeKey, snapshot.latestCompleteDate])

  const period = periods.find((item) => item.id === selectedPeriodId) ?? periods[0]
  const review = useMemo(() => period ? buildWeeklyReview(rows, period, currentOrders) : null, [currentOrders, period, rows])

  if (!review) return <main className="weekly-page"><section className="weekly-empty"><CalendarDays size={30} /><strong>暂时无法生成复盘周期</strong><p>至少需要连续 14 天数据，才能同时计算本期和对比期。</p></section></main>

  const displayedReviews = review.actionReviews.length > 0
    ? review.actionReviews.slice(0, 3)
    : review.orders.slice(0, 3).map((order) => ({ order, hypothesisStatus: 'pending' as const }))
  const unhandledCount = Math.max(0, review.findings.length - review.coveredFindingCount)
  const currentNet = review.current.gmv - review.current.refundAmount
  const baselineNet = review.baseline.gmv - review.baseline.refundAmount

  return <>
    <header className="topbar weekly-topbar">
      <div className="page-title"><h1>周度复盘</h1><p>青柚研究所 · 经营变化、问题处理与行动结果</p></div>
      <div className="top-actions weekly-top-actions">
        <label className="select-control weekly-source-select"><span className="sr-only">切换数据场景</span><select value={selectedScenario} onChange={(event) => !['custom', 'online'].includes(event.target.value) && onScenarioChange(event.target.value)}>{selectedScenario === 'custom' && <option value="custom">当前上传数据</option>}{selectedScenario === 'online' && <option value="online">当前在线数据</option>}<optgroup label="复杂多异常验收">{scenarios.filter((item) => item.group === 'complex').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup><optgroup label="单异常基础样例">{scenarios.filter((item) => item.group === 'single').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup></select></label>
        <label className="select-control weekly-period-select"><span className="sr-only">选择复盘周期</span><select value={review.period.id} onChange={(event) => setSelectedPeriodId(event.target.value)}>{periods.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <span className={`weekly-complete-badge ${review.period.isFormal ? 'is-formal' : 'is-stage'}`}>{review.period.isFormal ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}{review.period.isFormal ? '数据完整 · 正式周报' : '阶段复盘'}</span>
        <button className="button button-ai" type="button" onClick={onExplain}><Sparkles size={15} />AI 解读本期</button>
      </div>
    </header>

    <main className="weekly-page">
      <section className={`weekly-data-status ${review.period.isFormal ? 'weekly-data-formal' : 'weekly-data-stage'}`}>
        <Database size={17} /><div><strong>{review.period.isFormal ? '本期数据覆盖完整，可生成正式周报' : '当前最新 7 日未对齐完整自然周，先生成阶段复盘'}</strong><p>本期 {review.period.from}—{review.period.to} · 对比 {review.period.baselineFrom}—{review.period.baselineTo} · {sourceName}</p></div><span>规则生成</span>
      </section>

      <section className="weekly-summary-card">
        <div className="weekly-ai-tag"><Sparkles size={13} />规则摘要 · AI 降级态</div>
        <h2>{review.fallbackSummary}</h2>
        <p>所有数字和状态来自规则层；接入 DeepSeek 后，只补充解释、干扰因素和下周行动表达。</p>
      </section>

      <section className="weekly-section">
        <header><div><h2>本期经营结果</h2><p>{review.period.isFormal ? '自然周口径' : '最近完整 7 日口径'} · 对比前 7 日</p></div><span>系统规则生成</span></header>
        <div className="weekly-kpi-grid">{review.kpis.map((kpi) => <KpiReviewCard kpi={kpi} key={kpi.id} />)}</div>
      </section>

      <section className="weekly-section weekly-progress-section">
        <header><div><h2>问题与处理进展</h2><p>异常、工单和监控状态按同一数据范围关联</p></div><span>系统规则生成</span></header>
        <div className="weekly-progress-flow">
          <article><span>本期识别异常</span><strong>{review.findings.length}</strong><small>当前达到规则阈值</small></article><ArrowRight />
          <article className="progress-blue"><span>已创建工单</span><strong>{review.orders.length}</strong><small>覆盖 {review.coveredFindingCount}/{review.findings.length || 0} 个问题</small></article><ArrowRight />
          <article className="progress-amber"><span>进入效果复盘</span><strong>{review.reviewableCount}</strong><small>{review.recoveredCount} 已恢复</small></article><ArrowRight />
          <article className="progress-green"><span>用户确认关闭</span><strong>{review.closedCount}</strong><small>系统不能自动关单</small></article>
          <aside>{unhandledCount > 0 ? `仍有 ${unhandledCount} 个异常尚未建立工单` : '所有异常均已有对应行动'}</aside>
        </div>
      </section>

      <section className="weekly-section weekly-action-section">
        <header><div><h2>工单效果复盘</h2><p>执行后 7 个完整自然日才输出正式判断</p></div><button className="text-button weekly-action-link" type="button" onClick={onGoActions}>查看全部工单 <ArrowRight size={14} /></button></header>
        {displayedReviews.length === 0 ? <div className="weekly-empty"><ClipboardCheck size={28} /><strong>本期还没有可关联的行动工单</strong><p>从异常诊断创建工单并记录执行日期后，系统才能追踪行动前后变化。</p><button className="button button-secondary" type="button" onClick={onGoActions}>前往行动工单</button></div> : <div className="weekly-action-table">
          <div className="weekly-action-head"><span>行动 / 原异常</span><span>前后指标</span><span>规则判断</span><span>同期总体经营</span><span>解释边界</span></div>
          {displayedReviews.map(({ order, hypothesisStatus }) => <article className="weekly-action-row" key={order.id}>
            <div><strong>{order.title}</strong><p>{order.findingSnapshot?.title ?? '用户自建任务'}</p><small>{order.executedAt ? `实际执行 ${order.executedAt}` : '尚未记录执行日期'}</small></div>
            <div><strong>{formatMonitorValue(order.monitoringPlan.metric, order.monitoringPlan.creationValue)} → {formatMonitorValue(order.monitoringPlan.metric, order.monitoringResult.currentValue)}</strong><p>恢复规则：{order.monitoringPlan.targetLabel}</p><small>{order.monitoringResult.observationFrom ? `${order.monitoringResult.observationFrom}—${order.monitoringResult.observationTo}` : '观察窗口未开始'}</small></div>
            <div><span className={`hypothesis-pill hypothesis-${hypothesisStatus}`}>{hypothesisLabel[hypothesisStatus]}</span><p>{order.monitoringResult.reason}</p></div>
            <div><strong>净收入 {money(baselineNet)} → {money(currentNet)}</strong><p>退款金额 {money(review.baseline.refundAmount)} → {money(review.current.refundAmount)}</p><small>仅表示同期变化</small></div>
            <div className="weekly-boundary-copy"><Info size={14} /><p>{review.orders.length > 1 ? '同期存在多个行动，不能将变化单独归因于本工单。' : '行动与指标变化时间相关，但当前数据不能确认确定因果。'}</p></div>
          </article>)}
        </div>}
      </section>

      <div className="weekly-two-column">
        <section className="weekly-section weekly-overall-card"><header><div><h2>同期总体经营变化</h2><p>观察到的经营事实，不分摊到单一工单</p></div><span>系统规则生成</span></header><div className="weekly-overall-values"><p><span>净收入</span><strong>{money(baselineNet)} → {money(currentNet)}</strong></p><p><span>退款金额</span><strong>{money(review.baseline.refundAmount)} → {money(review.current.refundAmount)}</strong></p><p><span>支付订单行</span><strong>{integer(review.baseline.orders)} → {integer(review.current.orders)}</strong></p></div></section>
        <section className="weekly-section weekly-causal-card"><header><div><h2>归因边界</h2><p>页面必须保留的不确定性说明</p></div><TriangleAlert size={17} /></header><ul><li>行动后指标改善，不等于行动造成全部改善。</li><li>多个并行工单存在时，不计算单工单收入贡献。</li><li>AI只能解释相关性、干扰因素和后续验证方法。</li></ul></section>
      </div>

      <div className="weekly-two-column weekly-bottom-grid">
        <section className="weekly-section weekly-experience-card">
          <header><div><h2>候选经验</h2><p>AI 草拟、用户确认后才进入经验库</p></div><BookOpen size={17} /></header>
          {review.experienceCandidate ? <div className="weekly-experience-body"><span>规则先生成事实底稿</span><h3>{review.experienceCandidate.findingSnapshot?.title}</h3><p>行动：{review.experienceCandidate.actionText}</p><p>结果：{review.experienceCandidate.monitoringResult.reason}</p><small>接入 DeepSeek 后补充适用条件、限制和复用建议。</small><button className="button button-disabled" type="button" disabled>接入 AI 后生成候选经验</button></div> : <div className="weekly-experience-empty"><BookOpen size={25} /><strong>暂无可沉淀经验</strong><p>至少有一张工单达到“已恢复”，才会生成经验候选。</p></div>}
        </section>
        <section className="weekly-section weekly-next-card"><header><div><h2>下期优先事项</h2><p>规则提供底稿，AI 后续补充排序解释</p></div><ListChecks size={17} /></header><ol>{review.findings.slice(0, 3).map((finding, index) => { const hasOrder = review.orders.some((order) => order.findingSnapshot?.findingId === finding.id); return <li key={finding.id}><span>{index + 1}</span><div><strong>{hasOrder ? `继续跟进：${finding.title}` : `创建行动：${finding.title}`}</strong><p>{hasOrder ? '查看关联工单的执行与监控状态' : finding.ruleSuggestion}</p></div></li> })}</ol>{review.findings.length === 0 && <div className="weekly-experience-empty"><CheckCircle2 size={25} /><strong>本期没有触发规则异常</strong><p>下期继续观察经营指标和已有工单。</p></div>}</section>
      </div>

      <footer className="data-notice"><Info size={15} /><div><strong>周度复盘口径</strong><p>自然周负责总结整体经营，工单的行动后 7 日负责判断行动结果。两条时间轴分别计算，不因页面切换而互相覆盖。</p></div></footer>
    </main>
  </>
}
