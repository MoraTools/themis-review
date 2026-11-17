import { ThemeToggles } from '../ThemeToggles'
import { Icon, SeverityIcon } from '../Icons'
import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { isComment, type Action, type Finding, type ProjectAnalysis, type Severity } from '../../core/model'
import { isMessageBox } from '../../core/rules/messagebox'
import { LangContext, useT, useNumber } from '../i18n'
import { typeColor } from '../canvas/nodeTypes'
import { describeAction, glyphFor, GLYPH_PATH } from './describe'
import { Name } from '../shared/Name'
import { FindingCard } from '../findings/FindingCard'
import { compareFindings, findingLine, SEVERITIES, severityCounts as countSeverities } from '../findings/findings'

type Tab = 'code' | 'vars' | 'findings'
const TABS: Tab[] = ['code', 'vars', 'findings']

function ActionGlyph({ action }: { action: Action }) {
  return (
    <svg className="code-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={GLYPH_PATH[glyphFor(action)]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function EditorDrawer({
  analysis,
  botPath,
  from,
  line,
  onClose,
}: {
  analysis: ProjectAnalysis
  botPath: string
  /** opened from the report: start on the Findings tab when there are findings */
  from: 'map' | 'report'
  /** open the Code tab at this line */
  line?: number
  onClose: () => void
}) {
  const t = useT()
  const { lang } = useContext(LangContext)
  const number = useNumber()
  const bot = analysis.taskbots.find((b) => b.path === botPath)
  const findings = useMemo(
    () => analysis.findings.filter((f) => f.botPath === botPath).sort(compareFindings),
    [analysis, botPath],
  )
  const [tab, setTab] = useState<Tab>(() =>
    line === undefined && from === 'report' && findings.length ? 'findings' : 'code',
  )
  const [filterSev, setFilterSev] = useState<Severity | null>(null)
  const [flashLine, setFlashLine] = useState<number | null>(line ?? null)
  // index (in `findings`) of the card to show after a code flag opens the Findings tab
  const [focusFinding, setFocusFinding] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const codeListRef = useRef<HTMLOListElement>(null)
  const findingsRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ code: null, vars: null, findings: null })
  // every finding flags the line it cites, variable findings at their first reference
  const byLine = useMemo(() => {
    const m = new Map<number, number[]>()
    if (!bot) return m
    findings.forEach((f, i) => {
      const at = findingLine(f, bot)
      if (at !== undefined) m.set(at, [...(m.get(at) ?? []), i])
    })
    return m
  }, [findings, bot])
  const byVar = useMemo(() => {
    const m = new Map<string, Finding[]>()
    for (const f of findings) if (f.varName) (m.get(f.varName) ?? m.set(f.varName, []).get(f.varName)!).push(f)
    return m
  }, [findings])
  const severityCounts = useMemo(() => countSeverities(findings), [findings])

  // scroll the code list to a line after a finding click switches tabs
  useEffect(() => {
    if (tab !== 'code' || flashLine === null) return
    const el = codeListRef.current?.querySelector(`[data-line="${flashLine}"]`)
    el?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => setFlashLine(null), 1600)
    return () => clearTimeout(timer)
  }, [tab, flashLine])

  useEffect(() => {
    if (tab !== 'findings' || focusFinding === null) return
    const el = findingsRef.current?.querySelector<HTMLElement>(`[data-finding="${focusFinding}"]`)
    el?.scrollIntoView({ block: 'center' })
    el?.focus()
    setFocusFinding(null)
  }, [tab, focusFinding])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  if (!bot) return null
  const metrics = analysis.metrics[botPath]
  const score = analysis.scores[botPath]

  const lineOf = (f: Finding) => findingLine(f, bot)

  const jumpTo = (at: number) => {
    setFlashLine(at)
    setTab('code')
  }

  const showFinding = (index: number) => {
    if (filterSev && findings[index].severity !== filterSev) setFilterSev(null)
    setFocusFinding(index)
    setTab('findings')
  }

  const onTabKey = (event: KeyboardEvent) => {
    const i = TABS.indexOf(tab)
    const next =
      event.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length]
      : event.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length]
      : event.key === 'Home' ? TABS[0]
      : event.key === 'End' ? TABS[TABS.length - 1]
      : null
    if (!next) return
    event.preventDefault()
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const tabProps = (id: Tab) => ({
    ref: (el: HTMLButtonElement | null) => { tabRefs.current[id] = el },
    id: 'editor-tab-' + id,
    role: 'tab',
    'aria-selected': tab === id,
    'aria-controls': 'editor-panel-' + id,
    tabIndex: tab === id ? 0 : -1,
    className: tab === id ? 'tab active' : 'tab',
    onClick: () => setTab(id),
  })
  const panelProps = (id: Tab) => ({ id: 'editor-panel-' + id, role: 'tabpanel', 'aria-labelledby': 'editor-tab-' + id })

  const visible = findings.map((f, i) => ({ f, i })).filter(({ f }) => !filterSev || f.severity === filterSev)
  const hasNameFindings = visible.some(({ f }) => f.ruleId === 'VAR_NAME_FORMAT')
  // the opener (map node or report button) gets focus back in App once the view is restored
  const close = () => {
    dialogRef.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="drawer no-print"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <div className="drawer-head">
        <div className="drawer-heading">
          <h1 className="drawer-title">
            <Name text={bot.name} className="drawer-name" id="editor-title" />{' '}
            <span className={'tb-grade grade-' + score.grade}>{number(score.score)} · {score.grade}</span>
          </h1>
          <div className="drawer-sub">{bot.path}</div>
        </div>
        <ThemeToggles />
        <button className="btn ghost" onClick={close}>
          <svg className="drawer-close-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3 3 10 10M13 3 3 13" />
          </svg>
          {t('editor.close')}
        </button>
      </div>
      <div className="drawer-stats">
        <span>{number(metrics.totalLines)} {t('node.lines')}</span>
        <span>{number(metrics.commentLines)} {t('node.comments')}</span>
        <span>{number(metrics.logMessages)} {t('node.logs')}</span>
        <span>{number(metrics.variables)} {t('node.vars')}</span>
        <span>{t('editor.packages')}: {number(bot.packages.length)}</span>
      </div>
      <div className="tabs small" role="tablist" aria-labelledby="editor-title" onKeyDown={onTabKey}>
        <button {...tabProps('code')}>
          {t('editor.actions')} ({number(metrics.totalLines)})
        </button>
        <button {...tabProps('vars')}>
          {t('editor.variables')} ({number(bot.variables.length)})
        </button>
        <button {...tabProps('findings')}>
          {t('editor.findings')} ({number(findings.length)})
        </button>
      </div>

      {tab === 'code' && (
        <ol className="code-list" ref={codeListRef} {...panelProps('code')}>
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
                <span className="code-no">{number(a.line)}</span>
                <span className="code-card">
                  <ActionGlyph action={a} />
                  <span className="code-label">{describeAction(a, lang)}</span>
                  {(a.disabled || !a.reachable) && <span className="code-off">{t('editor.disabled')}</span>}
                </span>
                {fs.map((i) => {
                  const f = findings[i]
                  const msg = t(`rule.${f.ruleId}.msg`, f.params)
                  return (
                    <button key={i} type="button" className="code-flag" aria-label={msg} title={msg} onClick={() => showFinding(i)}>
                      <SeverityIcon severity={f.severity} />
                    </button>
                  )
                })}
              </li>
            )
          })}
        </ol>
      )}

      {tab === 'vars' && (
        <div className="drawer-scroll" {...panelProps('vars')}>
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
                  <td>{v.input && v.output ? t('editor.var.both') : v.input ? t('editor.var.in') : v.output ? t('editor.var.out') : v.readOnly ? t('editor.var.const') : '—'}</td>
                  <td className="var-desc">{v.description || '—'}</td>
                  <td>
                    {fs.map((f, i) => (
                      <span key={i} title={t(`rule.${f.ruleId}.msg`, f.params)}>
                        <SeverityIcon severity={f.severity} />
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
        <div className="drawer-scroll" ref={findingsRef} {...panelProps('findings')}>
          {findings.length === 0 ? (
            <p className="empty-state"><Icon name="circle-check" className="empty-ok" /> {t('editor.noFindings')}</p>
          ) : (
            <>
              <div className="filter-chips" role="group" aria-label={t('editor.filter.label')}>
                <button type="button" aria-pressed={filterSev === null} className={filterSev === null ? 'chip active' : 'chip'} onClick={() => setFilterSev(null)}>
                  {t('editor.filter.all')} ({number(findings.length)})
                </button>
                {SEVERITIES.map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    aria-pressed={filterSev === sev}
                    className={'chip sev-' + sev + (filterSev === sev ? ' active' : '')}
                    onClick={() => setFilterSev(filterSev === sev ? null : sev)}
                  >
                    <SeverityIcon severity={sev} /> {t('report.severity.' + sev)} ({number(severityCounts[sev])})
                  </button>
                ))}
              </div>
              {visible.length === 0 ? (
                <p className="empty-state">
                  {t('editor.filter.none', { severity: t('report.severity.' + filterSev) })}{' '}
                  <button type="button" className="btn" onClick={() => setFilterSev(null)}>{t('editor.filter.showAll')}</button>
                </p>
              ) : (
                <div className="finding-list">
                  {hasNameFindings && <p className="name-key">{t('report.nameKey')}</p>}
                  {visible.map(({ f, i }) => {
                    const at = lineOf(f)
                    return (
                      <FindingCard
                        key={i}
                        index={i}
                        tabIndex={-1}
                        finding={f}
                        line={at}
                        onLine={at === undefined ? undefined : () => jumpTo(at)}
                        lineAction={at === undefined ? undefined : t('editor.showLine', { line: number(at) })}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </dialog>
  )
}
