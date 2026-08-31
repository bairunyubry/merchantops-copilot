import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Info,
  ListTodo,
  MessageSquareText,
  ShieldAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DashboardSnapshot, DiagnosisFinding } from '../lib/dashboard'
import { FindingTrendChart } from './FindingTrendChart'

const CATEGORY_LABEL: Record<DiagnosisFinding['category'], string> = {
  conversion: '商品转化',
  after_sales: '售后退款',
  fulfillment: '履约发货',
  inventory: '库存供给',
}

const SEVERITY_LABEL: Record<DiagnosisFinding['severity'], string> = {
  high: '高风险',
  medium: '需关注',
  low: '低风险',
}

export function DiagnosisPage({
  snapshot,
  initialFindingId,
  sourceName,
  onBack,
  onExplain,
}: {
  snapshot: DashboardSnapshot
  initialFindingId?: string
  sourceName: string
  onBack: () => void
  onExplain: (finding: DiagnosisFinding) => void
}) {
  const [selectedId, setSelectedId] = useState(initialFindingId ?? snapshot.findings[0]?.id ?? '')

  useEffect(() => {
    const validInitial = snapshot.findings.some((finding) => finding.id === initialFindingId)
    setSelectedId(validInitial ? initialFindingId! : snapshot.findings[0]?.id ?? '')
  }, [initialFindingId, snapshot])

  const selected = useMemo(
    () => snapshot.findings.find((finding) => finding.id === selectedId) ?? snapshot.findings[0],
    [selectedId, snapshot.findings],
  )

  const selectFinding = (finding: DiagnosisFinding) => {
    setSelectedId(finding.id)
    const url = new URL(window.location.href)
    url.searchParams.set('finding', finding.id)
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }

  return (
    <>
      <header className="topbar diagnosis-topbar">
        <div className="page-title">
          <button className="breadcrumb-button" type="button" onClick={onBack}><ArrowLeft size={14} />经营总览</button>
          <h1>异常诊断</h1>
          <p>青柚研究所 · 数据截止 {snapshot.latestCompleteDate} · {sourceName}</p>
        </div>
        <div className="diagnosis-top-meta">
          <span><CircleGauge size={15} />按优先级从高到低</span>
          <button className="button button-ai" type="button" disabled={!selected} onClick={() => selected && onExplain(selected)}>
            <MessageSquareText size={15} />让 AI 解释当前问题
          </button>
        </div>
      </header>

      <main className="diagnosis-page">
        <section className="diagnosis-summary-strip">
          <div>
            <strong>本期识别 {snapshot.findings.length} 个独立经营问题</strong>
            <p>所有达到规则阈值的问题均会展示；优先级只决定处理顺序，不会隐藏其他异常。</p>
          </div>
          {snapshot.rawFindingCount > snapshot.findings.length && (
            <span className="merge-note">
              <CheckCircle2 size={14} />命中 {snapshot.rawFindingCount} 条规则，合并为 {snapshot.findings.length} 个独立问题
            </span>
          )}
        </section>

        {snapshot.findings.length === 0 || !selected ? (
          <section className="diagnosis-empty">
            <CheckCircle2 size={34} />
            <h2>本期未发现达到阈值的异常</h2>
            <p>规则只覆盖转化、退款、履约、库存和异常贡献集中五类信号；未触发不代表经营一定没有问题。</p>
            <button className="button button-secondary" type="button" onClick={onBack}>返回经营总览</button>
          </section>
        ) : (
          <div className="diagnosis-layout">
            <aside className="finding-list" aria-label="全部经营异常">
              <div className="finding-list-head">
                <div><strong>全部异常</strong><span>{snapshot.findings.length} 项</span></div>
                <p>点击查看每项完整证据</p>
              </div>
              {snapshot.findings.map((finding, index) => (
                <button
                  className={`finding-list-item ${finding.id === selected.id ? 'finding-list-active' : ''}`}
                  key={finding.id}
                  type="button"
                  onClick={() => selectFinding(finding)}
                >
                  <span className={`finding-rank severity-${finding.severity}`}>{index + 1}</span>
                  <span className="finding-list-copy">
                    <small>{CATEGORY_LABEL[finding.category]} · {SEVERITY_LABEL[finding.severity]}</small>
                    <strong>{finding.title}</strong>
                    <em>内部排序分 {finding.priority.total}</em>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              <div className="ranking-note"><Info size={13} /><p>排序分 = 严重度 30% + 经营影响 30% + 紧急度 25% + 数据置信度 15%</p></div>
            </aside>

            <section className="finding-detail">
              <article className={`finding-detail-hero severity-${selected.severity}`}>
                <div className="detail-hero-labels">
                  <span>{SEVERITY_LABEL[selected.severity]}</span>
                  <span>{CATEGORY_LABEL[selected.category]}</span>
                  <span>优先级第 {snapshot.findings.findIndex((item) => item.id === selected.id) + 1}</span>
                </div>
                <div className="detail-hero-title">
                  <div><h2>{selected.title}</h2><p>{selected.summary}</p></div>
                  <div className="priority-score"><strong>{selected.priority.total}</strong><span>内部排序分</span></div>
                </div>
                <div className="score-grid">
                  <div><span>严重度 · 30%</span><strong>{selected.priority.severity}</strong></div>
                  <div><span>经营影响 · 30%</span><strong>{selected.priority.impact}</strong></div>
                  <div><span>紧急度 · 25%</span><strong>{selected.priority.urgency}</strong></div>
                  <div><span>数据置信度 · 15%</span><strong>{selected.priority.confidence}</strong></div>
                </div>
              </article>

              <section className="detail-section">
                <header><div><h3>指标证据</h3><p>规则只基于当前上传数据计算</p></div><span>{selected.metric.sampleLabel}</span></header>
                <div className="metric-evidence-grid">
                  <div><span>当前值</span><strong>{selected.metric.currentLabel}</strong></div>
                  <div><span>前 7 日基线</span><strong>{selected.metric.baselineLabel}</strong></div>
                  <div><span>变化</span><strong className="risk-text">{selected.metric.deltaLabel}</strong></div>
                  <div><span>触发阈值</span><strong>{selected.metric.thresholdLabel}</strong></div>
                </div>
                <div className="finding-chart-card">
                  <div><strong>{selected.trendLabel}</strong><span>近 30 天 · 单位：{selected.trendUnit}</span></div>
                  <FindingTrendChart finding={selected} />
                </div>
              </section>

              <section className="detail-two-column">
                <article className="detail-section evidence-detail">
                  <header><div><h3>事实证据</h3><p>可以由规则复现，不等同于原因判断</p></div></header>
                  <ul>{selected.evidence.map((item) => <li key={item}><CheckCircle2 size={14} />{item}</li>)}</ul>
                </article>
                <article className="detail-section evidence-detail">
                  <header><div><h3>为什么排在这里</h3><p>展示本次排序依据</p></div></header>
                  <ol>{selected.priority.reasons.map((reason, index) => <li key={reason}><span>{index + 1}</span>{reason}</li>)}</ol>
                </article>
              </section>

              <section className="detail-section sku-detail">
                <header><div><h3>SKU 异常贡献</h3><p>用于定位优先核查对象，不代表确定因果</p></div><span>展示前 {Math.min(5, selected.skuContributions.length)} 个</span></header>
                {selected.skuContributions.length > 0 ? (
                  <div className="detail-contribution-list">
                    {selected.skuContributions.map((item, index) => (
                      <div key={item.skuId}>
                        <span>{index + 1}</span>
                        <p><strong>{item.skuName}</strong><small>{item.skuId}</small></p>
                        <div><i style={{ width: `${Math.max(5, item.contribution * 100)}%` }} /></div>
                        <b>{Math.round(item.contribution * 100)}%</b>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-inline">当前异常没有可计算的 SKU 贡献。</p>}
              </section>

              <section className="detail-two-column">
                <article className="detail-section hypothesis-card">
                  <header><div><h3>待验证原因</h3><p>规则不做确定因果判断</p></div><ShieldAlert size={17} /></header>
                  <p>{selected.caveat}</p>
                  <button className="button button-ai" type="button" onClick={() => onExplain(selected)}><Bot size={15} />让 AI 结合证据解释</button>
                </article>
                <article className="detail-section action-suggestion">
                  <header><div><h3>规则建议</h3><p>可以先执行的低风险动作</p></div><ListTodo size={17} /></header>
                  <strong>{selected.ruleSuggestion}</strong>
                  <p><b>验证方法：</b>{selected.verification}</p>
                  <button className="button button-disabled" type="button" disabled><ListTodo size={15} />下一阶段：创建行动工单</button>
                </article>
              </section>

              <footer className="data-notice">
                <Info size={15} /><div><strong>诊断边界</strong><p>规则层负责计算事实、合并问题和排序；AI 只能解释已有证据并提出待验证假设，不能修改指标、阈值或优先级。</p></div>
              </footer>
            </section>
          </div>
        )}
      </main>
    </>
  )
}
