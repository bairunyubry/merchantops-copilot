import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  Info,
  ListTodo,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ACTION_STORAGE_KEY,
  EXECUTION_LABEL,
  MONITOR_LABEL,
  actionDate,
  applyMonitoringResult,
  buildDemoWorkOrders,
  continueMonitoringCycle,
  createActionWorkOrder,
  evaluateWorkOrder,
  formatMonitorValue,
  readStoredActions,
  updateExecutionStatus,
  writeStoredActions,
  type ActionSource,
  type ActionWorkOrder,
  type ExecutionStatus,
  type MonitorStatus,
} from '../lib/actions'
import type { DashboardSnapshot, DiagnosisFinding } from '../lib/dashboard'
import { clearAiActionDraft, readAiActionDraft, type AiActionDraft } from '../lib/aiDraft'
import type { StoreDataRow } from '../types/data'

const EXECUTION_OPTIONS: Array<{ value: 'all' | ExecutionStatus; label: string }> = [
  { value: 'all', label: '全部执行状态' },
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '进行中' },
  { value: 'executed', label: '已执行' },
  { value: 'closed', label: '已关闭' },
]

const MONITOR_OPTIONS: Array<{ value: 'all' | MonitorStatus; label: string }> = [
  { value: 'all', label: '全部监控状态' },
  { value: 'not_started', label: '未开始' },
  { value: 'monitoring', label: '监控中' },
  { value: 'improving', label: '改善中' },
  { value: 'recovered', label: '已恢复' },
  { value: 'not_recovered', label: '未恢复' },
  { value: 'insufficient_data', label: '数据不足' },
]

const sourceLabel: Record<ActionSource, string> = {
  rule: '规则建议',
  ai: 'AI 建议',
  manual: '用户创建',
  demo: '演示工单',
}

function ActionCreateModal({
  findings,
  snapshot,
  scopeKey,
  initialFindingId,
  initialDraft,
  source,
  onClose,
  onCreate,
}: {
  findings: DiagnosisFinding[]
  snapshot: DashboardSnapshot
  scopeKey: string
  initialFindingId?: string
  initialDraft?: AiActionDraft | null
  source: ActionSource
  onClose: () => void
  onCreate: (order: ActionWorkOrder) => void
}) {
  const initialFinding = findings.find((finding) => finding.id === (initialDraft?.findingId ?? initialFindingId)) ?? findings[0]
  const [findingId, setFindingId] = useState(initialFinding?.id ?? '')
  const finding = findings.find((item) => item.id === findingId) ?? initialFinding
  const [title, setTitle] = useState(initialDraft?.action.replace(/[。.]$/, '') ?? finding?.ruleSuggestion.replace(/[。.]$/, '') ?? '')
  const [actionText, setActionText] = useState(initialDraft?.action ?? finding?.ruleSuggestion ?? '')
  const [dueDate, setDueDate] = useState(actionDate.shift(snapshot.latestCompleteDate, 3))
  const [reviewDate, setReviewDate] = useState(actionDate.shift(snapshot.latestCompleteDate, 7))
  const [effort, setEffort] = useState(2)

  const changeFinding = (id: string) => {
    setFindingId(id)
    const next = findings.find((item) => item.id === id)
    if (!next) return
    setTitle(next.ruleSuggestion.replace(/[。.]$/, ''))
    setActionText(next.ruleSuggestion)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!finding || !title.trim() || !actionText.trim()) return
    onCreate(createActionWorkOrder({
      finding,
      snapshot,
      scopeKey,
      title: title.trim(),
      actionText: actionText.trim(),
      dueDate,
      reviewDate,
      source,
      effort,
    }))
  }

  if (!finding) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal action-create-modal" role="dialog" aria-modal="true" aria-labelledby="action-create-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div><p className="eyebrow">ACTION WORK ORDER</p><h2 id="action-create-title">创建行动工单</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="action-form-body">
          <label className="action-field"><span>关联异常</span><select value={findingId} onChange={(event) => changeFinding(event.target.value)}>{findings.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <div className="frozen-finding-preview">
            <strong>创建后冻结的异常事实</strong>
            <p>{finding.metric.label}：当前 {finding.metric.currentLabel}｜基线 {finding.metric.baselineLabel}｜规则 {finding.metric.thresholdLabel}</p>
            <small>{finding.relatedSkuName ? `关联 SKU：${finding.relatedSkuName}` : '监控范围：全店'} · 后续 Finding 消失仍保留本口径</small>
          </div>
          {initialDraft && finding.id === initialDraft.findingId && <div className="ai-draft-preview"><Bot size={15} /><div><strong>已带入 AI 建议，可由你修改后创建</strong><p>{initialDraft.reason}</p><small>验证方法：{initialDraft.verification}</small></div></div>}
          <label className="action-field"><span>工单标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></label>
          <label className="action-field"><span>行动内容</span><textarea value={actionText} onChange={(event) => setActionText(event.target.value)} rows={3} maxLength={300} required /></label>
          <div className="action-form-grid">
            <label className="action-field"><span>执行截止日期</span><input type="date" min={snapshot.latestCompleteDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
            <label className="action-field"><span>计划复盘日期</span><input type="date" min={dueDate} value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} required /></label>
            <label className="action-field"><span>执行成本</span><select value={effort} onChange={(event) => setEffort(Number(event.target.value))}><option value={1}>低 · 1</option><option value={2}>中 · 2</option><option value={3}>高 · 3</option></select></label>
          </div>
          <div className="monitor-rule-preview"><Database size={15} /><div><strong>监控将在标记“已执行”后开始</strong><p>系统读取行动后 7 个完整自然日，并按原异常阈值判断恢复状态。</p></div></div>
        </div>
        <footer className="modal-footer"><span>来源：{sourceLabel[source]}。异常快照不可修改，行动内容可以调整。</span><div><button className="button button-secondary" type="button" onClick={onClose}>取消</button><button className="button button-primary" type="submit"><Plus size={15} />创建工单</button></div></footer>
      </form>
    </div>
  )
}

function ActionDetailDrawer({
  order,
  latestCompleteDate,
  onClose,
  onStatus,
  onContinue,
}: {
  order: ActionWorkOrder
  latestCompleteDate: string
  onClose: () => void
  onStatus: (status: ExecutionStatus) => void
  onContinue: () => void
}) {
  const result = order.monitoringResult
  const plan = order.monitoringPlan
  const canClose = result.status === 'recovered' && order.executionStatus !== 'closed'
  return (
    <>
      <button className="drawer-scrim action-drawer-scrim" type="button" aria-label="关闭工单详情" onClick={onClose} />
      <aside className="action-detail-drawer" aria-label="行动工单详情">
        <header className="action-detail-header">
          <div><p>行动工单详情 · {order.id}</p><h2>{order.title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="action-detail-body">
          <div className="action-status-line">
            <span className={`status-pill execution-${order.executionStatus}`}>{EXECUTION_LABEL[order.executionStatus]}</span>
            <span className={`status-pill monitor-${result.status}`}>{MONITOR_LABEL[result.status]}</span>
            <small>复盘日 {order.reviewDate}</small>
          </div>

          {order.findingSnapshot && <section className="action-detail-section"><header><h3>关联异常快照</h3><span>创建后不可修改</span></header><div className="snapshot-card"><strong>{order.findingSnapshot.title}</strong><p>{order.findingSnapshot.currentLabel}｜基线 {order.findingSnapshot.baselineLabel}｜{order.findingSnapshot.thresholdLabel}</p><small>{order.findingSnapshot.relatedSkuName ? `${order.findingSnapshot.relatedSkuName} · ${order.findingSnapshot.relatedSkuId}` : '全店范围'} · 周期 {order.findingSnapshot.periodFrom}–{order.findingSnapshot.periodTo}</small></div></section>}

          <section className="action-detail-section"><header><h3>行动记录</h3><span>{sourceLabel[order.source]}</span></header><div className="action-record-card"><strong>{order.actionText}</strong><p>截止日期：{order.dueDate}{order.executedAt ? `｜实际执行：${order.executedAt}` : ''}</p>{order.notes && <small>备注：{order.notes}</small>}</div>{order.executionStatus !== 'closed' && order.executionStatus !== 'executed' && <div className="execution-buttons"><button type="button" className="button button-secondary" onClick={() => onStatus('in_progress')}>标记进行中</button><button type="button" className="button button-primary" onClick={() => onStatus('executed')}>标记已执行</button></div>}</section>

          <section className={`action-detail-section monitor-detail monitor-${result.status}`}>
            <header><div><h3>指标监控</h3><p>{plan.metricLabel} · 观察窗口 {plan.windowDays} 日</p></div><span>{result.observationFrom ? `${result.observationFrom}–${result.observationTo}` : '等待行动执行'}</span></header>
            <div className="monitor-values"><div><span>创建时</span><strong>{formatMonitorValue(plan.metric, plan.creationValue)}</strong></div><ArrowRight size={24} /><div><span>最新窗口</span><strong>{formatMonitorValue(plan.metric, result.currentValue)}</strong></div></div>
            <div className="monitor-threshold"><span>恢复规则</span><strong>{plan.targetLabel}</strong></div>
            <div className="monitor-conclusion"><CheckCircle2 size={16} /><div><strong>{MONITOR_LABEL[result.status]}</strong><p>{result.reason}</p></div></div>
          </section>

          <section className="action-detail-section system-feedback"><header><h3>系统反馈</h3><span>规则判断</span></header><p>{result.reason}</p><ul>{result.evidence.map((item) => <li key={item}>{item}</li>)}</ul><button className="text-button" type="button" disabled><Bot size={14} />接入 DeepSeek 后生成复盘解释</button></section>

          <section className="action-detail-section"><header><h3>工单时间线</h3><span>{order.timeline.length} 条</span></header><div className="action-timeline">{[...order.timeline].sort((a, b) => a.date.localeCompare(b.date)).map((event) => <div key={event.id}><i /><p><span>{event.date}</span>{event.text}</p></div>)}</div></section>
        </div>
        <footer className="action-detail-footer">
          <button className="button button-secondary" type="button" onClick={onContinue}>继续观察一周期</button>
          <button className={`button ${canClose ? 'button-primary' : 'button-disabled'}`} type="button" disabled={!canClose} onClick={() => onStatus('closed')}>确认问题解决并关闭工单</button>
          <p>系统不会仅凭一次单日改善自动关闭工单。</p>
        </footer>
      </aside>
    </>
  )
}

export function ActionCenterPage({
  snapshot,
  rows,
  scopeKey,
  sourceName,
  scenarios,
  selectedScenario,
  initialFindingId,
  initialSource = 'rule',
  onScenarioChange,
  onGoDiagnosis,
}: {
  snapshot: DashboardSnapshot
  rows: StoreDataRow[]
  scopeKey: string
  sourceName: string
  scenarios: ReadonlyArray<{ id: string; name: string; group: 'complex' | 'single' }>
  selectedScenario: string
  initialFindingId?: string
  initialSource?: ActionSource
  onScenarioChange: (id: string) => void
  onGoDiagnosis: () => void
}) {
  const [allOrders, setAllOrders] = useState<ActionWorkOrder[]>(() => readStoredActions())
  const [createOpen, setCreateOpen] = useState(() => new URLSearchParams(window.location.search).get('create') === '1')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [executionFilter, setExecutionFilter] = useState<'all' | ExecutionStatus>('all')
  const [monitorFilter, setMonitorFilter] = useState<'all' | MonitorStatus>('all')
  const [aiDraft] = useState(() => initialSource === 'ai' ? readAiActionDraft() : null)

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
      const monitored = applyMonitoringResult(order, evaluateWorkOrder(order, rows, snapshot.latestCompleteDate))
      if (monitored !== order) changed = true
      return monitored
    })
    if (!changed) return
    setAllOrders(next)
    writeStoredActions(next)
  }, [allOrders, currentOrders.length, rows, scopeKey, snapshot.latestCompleteDate])

  const saveOrders = (next: ActionWorkOrder[]) => {
    setAllOrders(next)
    writeStoredActions(next)
  }

  const createOrder = (order: ActionWorkOrder) => {
    saveOrders([...allOrders, order])
    if (order.source === 'ai') clearAiActionDraft()
    setCreateOpen(false)
    setSelectedId(order.id)
    window.history.replaceState({}, '', '/actions')
  }

  const updateOrder = (id: string, updater: (order: ActionWorkOrder) => ActionWorkOrder) => {
    saveOrders(allOrders.map((order) => order.id === id ? updater(order) : order))
  }

  const resetDemo = () => {
    const withoutScope = allOrders.filter((order) => order.scopeKey !== scopeKey)
    const next = [...withoutScope, ...buildDemoWorkOrders(snapshot, scopeKey)]
    saveOrders(next)
    setSelectedId(null)
  }

  const filtered = currentOrders.filter((order) => {
    if (executionFilter !== 'all' && order.executionStatus !== executionFilter) return false
    if (monitorFilter !== 'all' && order.monitoringResult.status !== monitorFilter) return false
    const search = query.trim().toLowerCase()
    if (!search) return true
    return [order.title, order.id, order.findingSnapshot?.title, order.findingSnapshot?.relatedSkuId].some((value) => value?.toLowerCase().includes(search))
  }).sort((a, b) => b.priority - a.priority)

  const selected = allOrders.find((order) => order.id === selectedId)
  const counts = {
    pending: currentOrders.filter((order) => order.executionStatus === 'pending').length,
    active: currentOrders.filter((order) => order.executionStatus === 'in_progress' || order.executionStatus === 'executed').length,
    review: currentOrders.filter((order) => ['improving', 'recovered', 'not_recovered'].includes(order.monitoringResult.status)).length,
    recovered: currentOrders.filter((order) => order.monitoringResult.status === 'recovered').length,
  }

  return (
    <>
      <header className="topbar action-topbar">
        <div className="page-title"><h1>行动工单</h1><p>青柚研究所 · 数据截止 {snapshot.latestCompleteDate} · {sourceName}</p></div>
        <div className="top-actions">
          <label className="select-control"><span className="sr-only">切换行动中心数据范围</span><select value={selectedScenario} onChange={(event) => !['custom', 'online'].includes(event.target.value) && onScenarioChange(event.target.value)}>{selectedScenario === 'custom' && <option value="custom">当前上传数据</option>}{selectedScenario === 'online' && <option value="online">当前在线数据</option>}<optgroup label="复杂多异常验收">{scenarios.filter((scenario) => scenario.group === 'complex').map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</optgroup><optgroup label="单异常基础样例">{scenarios.filter((scenario) => scenario.group === 'single').map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</optgroup></select></label>
          <button className="button button-primary" type="button" disabled={snapshot.findings.length === 0} onClick={() => setCreateOpen(true)}><Plus size={15} />创建工单</button>
        </div>
      </header>

      <main className="action-page">
        <section className="action-data-banner"><div><Database size={17} /><span><strong>当前数据会自动评估关联工单</strong><p>只处理范围标识为“{scopeKey}”的工单；上传其他 CSV 不会串单。</p></span></div><button className="text-button action-reset" type="button" onClick={resetDemo}>重置当前演示工单</button></section>

        <section className="action-summary-grid">
          <article><span>待处理</span><strong>{counts.pending}</strong><small>等待商家开始执行</small></article>
          <article><span>进行中 / 已执行</span><strong>{counts.active}</strong><small>等待形成监控窗口</small></article>
          <article className="summary-attention"><span>待复盘</span><strong>{counts.review}</strong><small>已有规则监控反馈</small></article>
          <article className="summary-good"><span>已恢复</span><strong>{counts.recovered}</strong><small>等待用户确认关闭</small></article>
        </section>

        <section className="action-list-section">
          <header><div><h2>全部工单</h2><p>{currentOrders.length} 项 · 按行动优先级排序</p></div><span>执行状态与监控状态分开记录</span></header>
          <div className="action-filters"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工单或关联 SKU" /></label><select value={executionFilter} onChange={(event) => setExecutionFilter(event.target.value as 'all' | ExecutionStatus)}>{EXECUTION_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><select value={monitorFilter} onChange={(event) => setMonitorFilter(event.target.value as 'all' | MonitorStatus)}>{MONITOR_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>

          {filtered.length === 0 ? <div className="action-empty"><ClipboardList size={30} /><strong>当前筛选下没有工单</strong><p>{currentOrders.length === 0 ? '请从异常诊断页或这里创建第一张行动工单。' : '调整筛选条件后重试。'}</p>{currentOrders.length === 0 && <button className="button button-secondary" type="button" onClick={onGoDiagnosis}>前往异常诊断</button>}</div> : (
            <div className="action-table-wrap"><table className="action-table"><thead><tr><th>工单 / 来源异常</th><th>执行状态</th><th>监控指标</th><th>监控反馈</th><th>复盘日期</th><th>行动优先级</th><th aria-label="操作" /></tr></thead><tbody>{filtered.map((order) => <tr key={order.id} onClick={() => setSelectedId(order.id)}><td><strong>{order.title}</strong><span>{order.findingSnapshot ? `来自：${order.findingSnapshot.title}` : '用户手动创建'}{order.findingSnapshot?.relatedSkuId ? ` · ${order.findingSnapshot.relatedSkuId}` : ''}</span><small>{order.id}{order.isDemo ? ' · 演示' : ''}</small></td><td><span className={`status-pill execution-${order.executionStatus}`}>{EXECUTION_LABEL[order.executionStatus]}</span></td><td><strong>{order.monitoringPlan.metricLabel}</strong><span>恢复规则：{order.monitoringPlan.targetLabel}</span></td><td><span className={`status-pill monitor-${order.monitoringResult.status}`}>{MONITOR_LABEL[order.monitoringResult.status]}</span><small>{formatMonitorValue(order.monitoringPlan.metric, order.monitoringPlan.creationValue)} → {formatMonitorValue(order.monitoringPlan.metric, order.monitoringResult.currentValue)}</small></td><td><strong>{order.reviewDate}</strong><span>{order.reviewDate <= snapshot.latestCompleteDate ? '已到复盘日' : '等待数据'}</span></td><td><strong>{order.priority.toFixed(1)}</strong><span>影响×置信÷成本</span></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table></div>
          )}
        </section>

        <footer className="data-notice"><Info size={15} /><div><strong>监控口径说明</strong><p>行动执行后第 1–7 个完整自然日作为首个观察窗口。系统可以反馈恢复，但最终关闭工单仍由用户确认。</p></div></footer>
      </main>

      {createOpen && <ActionCreateModal findings={snapshot.findings} snapshot={snapshot} scopeKey={scopeKey} initialFindingId={initialFindingId} initialDraft={aiDraft} source={initialSource} onClose={() => setCreateOpen(false)} onCreate={createOrder} />}
      {selected && <ActionDetailDrawer order={selected} latestCompleteDate={snapshot.latestCompleteDate} onClose={() => setSelectedId(null)} onStatus={(status) => updateOrder(selected.id, (order) => updateExecutionStatus(order, status, snapshot.latestCompleteDate))} onContinue={() => updateOrder(selected.id, (order) => continueMonitoringCycle(order, snapshot.latestCompleteDate))} />}
    </>
  )
}

export const actionStorageKey = ACTION_STORAGE_KEY
