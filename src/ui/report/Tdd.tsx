import { useMemo, useState } from 'react'
import type { ProjectAnalysis } from '../../core/model'
import { buildTdd } from '../../core/tdd'
import { useT } from '../i18n'

export default function Tdd({ analysis, onSelectBot }: { analysis: ProjectAnalysis; onSelectBot: (path: string) => void }) {
  const t = useT()
  const model = useMemo(() => buildTdd(analysis), [analysis])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const download = async (format: 'docx' | 'pdf') => {
    setBusy(true); setError(''); setStatus(t('tdd.preparing'))
    try {
      const { prepareTdd, exportTddDocx, exportTddPdf } = await import('../../core/tddExport')
      const document = await prepareTdd(model)
      const data = await (format === 'docx' ? exportTddDocx(document) : exportTddPdf(document))
      const mime = format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
      const filename = analysis.zipNames.length === 1 ? analysis.zipNames[0].replace(/\.zip$/i, '') + '-TDD' : 'Combined-TDD'
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `${filename.replace(/[\\/:*?"<>|]/g, '-')}.${format}`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(t('tdd.ready'))
    } catch (cause) { setError(`${t('tdd.error')} ${cause instanceof Error ? cause.message : String(cause)}`); setStatus('') }
    finally { setBusy(false) }
  }
  return <main className="report tdd no-print">
    <header className="report-head"><h1>{t('tdd.title')}</h1></header>
    <p className="report-meta">{analysis.zipNames.join(', ')}</p>
    <p className="tdd-hint">{t('tdd.hint')}</p>
    <div className="tdd-actions" aria-busy={busy}>
      <button className="btn primary" disabled={busy} onClick={() => void download('docx')}>{t('tdd.docx')}</button>
      <button className="btn" disabled={busy} onClick={() => void download('pdf')}>{t('tdd.pdf')}</button>
    </div>
    <p role="status" aria-live="polite">{status}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <h2>{t('tdd.scope')}</h2>
    <div className="table-scroll"><table className="report-table">
      <thead><tr><th>{t('report.taskbot')}</th><th>{t('node.lines')}</th><th>{t('tdd.images')}</th><th>{t('tdd.calls')}</th></tr></thead>
      <tbody>{model.bots.map(item => <tr key={item.bot.path}>
        <td><button className="tdd-bot-link" onClick={() => onSelectBot(item.bot.path)}>{item.bot.name}</button></td>
        <td>{item.bot.actions.length}</td><td>{item.images.length}</td><td>{item.calls.length}</td>
      </tr>)}</tbody>
    </table></div>
  </main>
}
