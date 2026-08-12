import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { isComment, type Action, type Finding, type ProjectAnalysis, type Severity } from '../../core/model'
import { isMessageBox } from '../../core/rules/messagebox'
import { useT } from '../i18n'
import { typeColor } from '../canvas/nodeTypes'
import { describeAction, glyphFor, GLYPH_PATH } from './describe'

type Tab = 'code' | 'vars' | 'findings'

function ActionGlyph({ action }: { action: Action }) {
  return (
    <svg className="code-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={GLYPH_PATH[glyphFor(action)]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SEV_ICON = { error: '🔴', warn: '🟡', info: '🔵' } as const
const SEVERITIES: Severity[] = ['error', 'warn', 'info']

export default function EditorDrawer({
  analysis,
  botPath,
  onClose,
}: {
  analysis: ProjectAnalysis
  botPath: string
  onClose: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('code')
  const [filterSev, setFilterSev] = useState<Severity | null>(null)
  const [flashLine, setFlashLine] = useState<number | null>(null)
  const codeListRef = useRef<HTMLOListElement>(null)
  const bot = analysis.taskbots.find((b) => b.path === botPath)
  const findings = useMemo(() => analysis.findings.filter((f) => f.botPath === botPath), [analysis, botPath])
  const byLine = useMemo(() => {
    const m = new Map<number, Finding[]>()
    for (const f of findings) if (f.line) (m.get(f.line) ?? m.set(f.line, []).get(f.line)!).push(f)
    return m
  }, [findings])
  const byVar = useMemo(() => {
    const m = new Map<string, Finding[]>()
    for (const f of findings) if (f.varName) (m.get(f.varName) ?? m.set(f.varName, []).get(f.varName)!).push(f)
    return m
  }, [findings])
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
    for (const finding of findings) counts[finding.severity]++
    return counts
  }, [findings])

  // scroll the code list to a line after a finding click switches tabs
  useEffect(() => {
    if (tab !== 'code' || flashLine === null) return
    const el = codeListRef.current?.querySelector(`[data-line="${flashLine}"]`)
    el?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => setFlashLine(null), 1600)
    return () => clearTimeout(timer)
  }, [tab, flashLine])

  if (!bot) return null
  const metrics = analysis.metrics[botPath]
  const score = analysis.scores[botPath]

  /** line a finding points at: its own line, else the first reference of its variable */
  const findingLine = (f: Finding): number | undefined => f.line ?? (f.varName ? bot.varRefs[f.varName]?.[0] : undefined)

  const jumpTo = (f: Finding) => {
    const line = findingLine(f)
    if (line === undefined) return
    setFlashLine(line)
    setTab('code')
  }

  const visibleFindings = filterSev ? findings.filter((f) => f.severity === filterSev) : findings

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div>
          <div className="drawer-title">
            {bot.name} <span className={'tb-grade grade-' + score.grade}>{score.score} · {score.grade}</span>
          </div>
          <div className="drawer-sub">{bot.path}</div>
        </div>
        <button className="btn ghost" onClick={onClose}>
          ✕ {t('editor.close')}
        </button>
      </div>
      <div className="drawer-stats">
        <span>{metrics.totalLines} {t('node.lines')}</span>
        <span>{metrics.commentLines} {t('node.comments')}</span>
        <span>{metrics.logMessages} {t('node.logs')}</span>
        <span>{metrics.variables} {t('node.vars')}</span>
        <span>{t('editor.packages')}: {bot.packages.length}</span>
      </div>
      <nav className="tabs small">
        <button className={tab === 'code' ? 'tab active' : 'tab'} onClick={() => setTab('code')}>
          {t('editor.actions')} ({metrics.totalLines})
        </button>
        <button className={tab === 'vars' ? 'tab active' : 'tab'} onClick={() => setTab('vars')}>
          {t('editor.variables')} ({bot.variables.length})
        </button>
        <button className={tab === 'findings' ? 'tab active' : 'tab'} onClick={() => setTab('findings')}>
          {t('editor.findings')} ({findings.length})
        </button>
      </nav>

      {tab === 'code' && (
        <ol className="code-list" ref={codeListRef}>
          {bot.actions.map((a) => {
            const fs = byLine.get(a.line) ?? []
            const cls = [
              'code-line',
              isComment(a) ? 'comment' : '',
              a.disabled || !a.reachable ? 'disabled' : '',
              isMessageBox(a) ? 'msgbox' : '',
              a.line === flashLine ? 'flash' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <li
                key={a.uid}
                className={cls}
                data-line={a.line}
                style={{ '--depth': a.depth } as CSSProperties}
              >
                <span className="code-no">{a.line}</span>
                <span className="code-card">
                  <ActionGlyph action={a} />
                  <span className="code-label">{describeAction(a)}</span>
                  {(a.disabled || !a.reachable) && <span className="code-off">{t('editor.disabled')}</span>}
                </span>
                {fs.map((f, i) => (
                  <span key={i} className="code-flag" title={t(`rule.${f.ruleId}.msg`, f.params)}>
                    {SEV_ICON[f.severity]}
                  </span>
                ))}
              </li>
            )
          })}
        </ol>
      )}

      {tab === 'vars' && (
        <div className="drawer-scroll">
        <table className="var-table">
          <thead>
            <tr>
              <th>{t('editor.var.name')}</th>
              <th>{t('editor.var.type')}</th>
              <th>{t('editor.var.io')}</th>
              <th>{t('editor.var.desc')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bot.variables.map((v) => {
              const fs = byVar.get(v.name) ?? []
              return (
                <tr key={v.name} className={fs.length ? 'has-findings' : ''}>
                  <td>
                    <span className="tb-var-dot" style={{ background: typeColor(v.type) }} /> {v.name}
                  </td>
                  <td>{v.type}</td>
                  <td>{v.input && v.output ? 'I/O' : v.input ? 'IN' : v.output ? 'OUT' : v.readOnly ? 'CONST' : '—'}</td>
                  <td className="var-desc">{v.description || '—'}</td>
                  <td>
                    {fs.map((f, i) => (
                      <span key={i} title={t(`rule.${f.ruleId}.msg`, f.params)}>
                        {SEV_ICON[f.severity]}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}

      {tab === 'findings' && (
        <div className="drawer-scroll">
          <div className="filter-chips">
            <button className={filterSev === null ? 'chip active' : 'chip'} onClick={() => setFilterSev(null)}>
              {t('editor.filter.all')} ({findings.length})
            </button>
            {SEVERITIES.map((sev) => (
              <button
                key={sev}
                className={'chip sev-' + sev + (filterSev === sev ? ' active' : '')}
                onClick={() => setFilterSev(filterSev === sev ? null : sev)}
              >
                {SEV_ICON[sev]} {t('report.severity.' + sev)} ({severityCounts[sev]})
              </button>
            ))}
          </div>
          <ul className="finding-list">
            {visibleFindings.map((f, i) => {
              const line = findingLine(f)
              return (
                <li
                  key={i}
                  className={'finding sev-' + f.severity + (line !== undefined ? ' jumpable' : '')}
                  onClick={() => jumpTo(f)}
                >
                  <div className="finding-msg">
                    {SEV_ICON[f.severity]} {line !== undefined ? `L${line} · ` : ''}
                    {t(`rule.${f.ruleId}.msg`, f.params)}
                  </div>
                  <div className="finding-fix">💡 {t(`rule.${f.ruleId}.fix`, f.params)}</div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
