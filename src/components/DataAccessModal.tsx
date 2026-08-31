import {
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  Globe2,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  demoLiveUrl,
  demoVersionFromUrl,
  fetchOnlineCsv,
  sourceIdForUrl,
  type OnlineCsvResult,
  type OnlineSourceConfig,
  type OnlineSyncMode,
} from '../lib/dataSource'

type AccessKind = 'sample' | 'local' | 'online'
type Step = 'choose' | 'online' | 'preview'

export function DataAccessModal({
  currentOnline,
  onClose,
  onUseDefault,
  onChooseLocal,
  onApplyOnline,
}: {
  currentOnline: OnlineSourceConfig | null
  onClose: () => void
  onUseDefault: () => void
  onChooseLocal: () => void
  onApplyOnline: (result: OnlineCsvResult, syncMode: OnlineSyncMode) => void
}) {
  const [step, setStep] = useState<Step>('choose')
  const [kind, setKind] = useState<AccessKind>('online')
  const [url, setUrl] = useState(currentOnline?.url ?? demoLiveUrl())
  const [syncMode, setSyncMode] = useState<OnlineSyncMode>(currentOnline?.syncMode ?? 'manual')
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [onlineResult, setOnlineResult] = useState<OnlineCsvResult | null>(null)

  const preview = useMemo(() => {
    const rows = onlineResult?.importResult.rows ?? []
    const dates = [...new Set(rows.map((row) => row.date))].sort()
    return {
      days: dates.length,
      from: dates[0] ?? '—',
      to: dates.at(-1) ?? '—',
      skuCount: new Set(rows.map((row) => row.sku_id)).size,
    }
  }, [onlineResult])

  const nextFromChoice = () => {
    if (kind === 'sample') {
      onUseDefault()
      onClose()
      return
    }
    if (kind === 'local') {
      onChooseLocal()
      onClose()
      return
    }
    setStep('online')
  }

  const testConnection = async () => {
    setTesting(true)
    setTestError('')
    try {
      const result = await fetchOnlineCsv(url.trim())
      setOnlineResult(result)
      setStep('preview')
    } catch (error) {
      setTestError(error instanceof Error ? error.message : '连接测试失败。')
    } finally {
      setTesting(false)
    }
  }

  const apply = () => {
    if (!onlineResult || onlineResult.importResult.blocked) return
    onApplyOnline(onlineResult, syncMode)
    onClose()
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal data-access-modal" role="dialog" aria-modal="true" aria-labelledby="data-access-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="modal-header">
        <div><p className="eyebrow">DATA ACCESS</p><h2 id="data-access-title">{step === 'choose' ? '数据接入' : step === 'online' ? '接入公开在线 CSV' : '数据预览'}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      </header>

      {step === 'choose' && <div className="data-access-body">
        <p className="access-lead">选择本次经营数据的来源。所有数据最终使用同一套字段校验和经营规则。</p>
        <div className="access-kind-grid">
          <button className={`access-kind ${kind === 'sample' ? 'is-selected' : ''}`} type="button" onClick={() => setKind('sample')}><RotateCcw /><strong>默认示例</strong><span>恢复青柚研究所 30 天演示数据</span><small>无需配置</small></button>
          <button className={`access-kind ${kind === 'local' ? 'is-selected' : ''}`} type="button" onClick={() => setKind('local')}><FileUp /><strong>本地 CSV</strong><span>选择电脑中的文件，一次性导入</span><small>仅在浏览器解析</small></button>
          <button className={`access-kind ${kind === 'online' ? 'is-selected' : ''}`} type="button" onClick={() => setKind('online')}><Globe2 /><strong>公开在线 CSV</strong><span>粘贴 HTTPS 链接，支持刷新</span><small>本轮新增</small></button>
        </div>
        <div className="access-privacy"><Database size={14} />只接收 14 个经营聚合字段，不应包含订单个人信息。</div>
      </div>}

      {step === 'online' && <div className="data-access-body">
        <label className="access-field"><span>公开 CSV 链接</span><div><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/store-data.csv" autoFocus /><button className="button button-secondary" type="button" disabled={testing || !url.trim()} onClick={() => void testConnection()}>{testing ? <LoaderCircle className="spin" size={15} /> : <Globe2 size={15} />}{testing ? '测试中' : '测试连接'}</button></div><small>外部链接由服务端读取；只支持公开 HTTPS 地址，文件上限 5MB。</small></label>
        {testError && <div className="access-error"><TriangleAlert size={16} /><div><strong>连接失败</strong><p>{testError}</p></div></div>}
        <fieldset className="sync-mode"><legend>更新方式</legend><label><input type="radio" name="sync-mode" checked={syncMode === 'manual'} onChange={() => setSyncMode('manual')} /><span><strong>仅手动同步</strong><small>点击“立即同步”时重新读取链接</small></span></label><label><input type="radio" name="sync-mode" checked={syncMode === 'interval_30m'} onChange={() => setSyncMode('interval_30m')} /><span><strong>模拟每 30 分钟同步</strong><small>页面打开期间到期自动检查</small></span></label></fieldset>
        {demoVersionFromUrl(url) !== null && <div className="demo-source-note"><FileSpreadsheet size={15} /><div><strong>当前为项目内置模拟在线源</strong><p>后续“立即同步”将按 v1 → v4 推进，演示异常出现、改善和恢复。</p></div></div>}
      </div>}

      {step === 'preview' && onlineResult && <div className="data-access-body preview-body">
        <div className={`connection-summary ${onlineResult.importResult.blocked ? 'is-blocked' : ''}`}>{onlineResult.importResult.blocked ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />}<div><strong>{onlineResult.importResult.blocked ? '连接成功，但数据不能生效' : '连接及字段校验通过'}</strong><p>HTTP 200 · {onlineResult.meta.bytes} bytes · 响应 {onlineResult.meta.durationMs} ms</p></div></div>
        <div className="preview-grid"><article><span>有效数据</span><strong>{onlineResult.importResult.rows.length} 行</strong></article><article><span>标准字段</span><strong>{14 - onlineResult.importResult.missingFields.length} / 14</strong></article><article><span>覆盖周期</span><strong>{preview.days} 天</strong></article><article><span>跳过数据</span><strong>{onlineResult.importResult.skippedRows} 行</strong></article></div>
        <div className="preview-release"><strong>数据范围：{preview.from}—{preview.to}</strong><p>{preview.skuCount} 个 SKU。生效后自动更新经营看板、异常诊断、关联工单监控与周度复盘。</p></div>
        {onlineResult.importResult.missingFields.length > 0 && <div className="preview-missing"><strong>缺少必填字段</strong><p>{onlineResult.importResult.missingFields.join('、')}</p></div>}
        {onlineResult.importResult.issues.length > 0 && <div className="preview-issues">{onlineResult.importResult.issues.slice(0, 4).map((issue, index) => <p key={`${issue.code}-${index}`}>{issue.row ? `第 ${issue.row} 行：` : ''}{issue.message}</p>)}</div>}
        <div className="preview-version"><Database size={15} /><span>来源标识：{sourceIdForUrl(onlineResult.requestedUrl)}{demoVersionFromUrl(onlineResult.requestedUrl) ? ` · v${demoVersionFromUrl(onlineResult.requestedUrl)}` : ''}</span></div>
      </div>}

      <footer className="modal-footer access-footer">
        <span>{step === 'preview' ? '只有通过阻断校验的数据才能替换当前看板。' : '模拟数据会在页面中持续明确标注。'}</span>
        <div>{step !== 'choose' && <button className="button button-secondary" type="button" onClick={() => setStep(step === 'preview' ? 'online' : 'choose')}>上一步</button>}{step === 'choose' ? <button className="button button-primary" type="button" onClick={nextFromChoice}>下一步</button> : step === 'online' ? <button className="button button-primary" type="button" disabled={testing || !url.trim()} onClick={() => void testConnection()}>预览数据</button> : <button className="button button-primary" type="button" disabled={onlineResult?.importResult.blocked} onClick={apply}>保存并同步</button>}</div>
      </footer>
    </section>
  </div>
}

