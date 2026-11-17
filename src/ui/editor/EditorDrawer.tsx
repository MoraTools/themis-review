import { ThemeToggles } from '../ThemeToggles'
import { Icon, SeverityIcon } from '../Icons'
import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { isComment, type Action, type Finding, type ProjectAnalysis } from '../../core/model'
import { isMessageBox } from '../../core/rules/messagebox'
import { capGroup } from '../../core/score'
import { LangContext, useT, useNumber, usePlural } from '../i18n'
import { typeColor, typeLabel } from '../canvas/nodeTypes'
import { describeAction, glyphFor, GLYPH_PATH } from './describe'
import { Name } from '../shared/Name'
import { Grade } from '../shared/Grade'
import { FindingCard, FindingGroupCard, PointsLost } from '../findings/FindingCard'
import { compareFindings, entryPoints, findingLine, groupFindings, lostPoints, lostTotal, severityCounts as countSeverities } from '../findings/findings'
import { SeverityFilter, type SeverityOn } from '../findings/SeverityFilter'

type Tab = 'code' | 'vars' | 'findings'
const TABS: Tab[] = ['code', 'vars', 'findings']
/** the editor filter is its own: it starts with every severity on */
const ALL_ON: SeverityOn = { error: true, warn: true, info: true }

/** the tab the editor opens on: a variable on Variables, else the findings, unless a line is asked for or there is nothing to show */
export function initialTab(line: number | undefined, findingCount: number, variable?: string): Tab {
  if (variable !== undefined) return 'vars'
  return line === undefined && findingCount > 0 ? 'findings' : 'code'
}

/** the Points lost box is open above 760 px and closed at 760 px and under, where it would push the tabs down */
const LOST_CLOSED = '(max-width: 760px)'

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
  line,
  variable,
  onClose,
  onShowOnMap,
}: {
  analysis: ProjectAnalysis
  botPath: string
  /** open the Code tab at this line */
  line?: number
  /** open the Variables tab at this variable */
  variable?: string
  onClose: () => void
  /** close the editor and show this taskbot's node on the map */
  onShowOnMap: () => void
}) {
  const t = useT()
  const plural = usePlural()
  const { lang } = useContext(LangContext)
  const number = useNumber()
  const bot = analysis.taskbots.find((b) => b.path === botPath)
  const findings = useMemo(
    () => analysis.findings.filter((f) => f.botPath === botPath).sort(compareFindings),
    [analysis, botPath],
  )
  const [tab, setTab] = useState<Tab>(() => initialTab(line, findings.length, variable))
  const [lostOpen, setLostOpen] = useState(() => typeof matchMedia === 'undefined' || !matchMedia(LOST_CLOSED).matches)
  const [flashVar, setFlashVar] = useState<string | null>(variable ?? null)
  const varsRef = useRef<HTMLDivElement>(null)
  const [sevOn, setSevOn] = useState<SeverityOn>(ALL_ON)
  const [flashLine, setFlashLine] = useState<number | null>(line ?? null)
  // index (in `findings`) of the card to show after a Variables flag opens the Findings tab
  const [focusFinding, setFocusFinding] = useState<number | null>(null)
  // the code line whose findings show inline under it
  const [openLine, setOpenLine] = useState<number | null>(null)
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
    if (tab !== 'vars' || flashVar === null) return
    varsRef.current?.querySelector(`[data-var="${CSS.escape(flashVar)}"]`)?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => setFlashVar(null), 1600)
    return () => clearTimeout(timer)
  }, [tab, flashVar])

  useEffect(() => {
    if (tab !== 'findings' || focusFinding === null) return
    const el = findingsRef.current?.querySelector<HTMLElement>(`[data-finding~="${focusFinding}"] > article`)
    el?.scrollIntoView({ block: 'center' })
    el?.focus()
    setFocusFinding(null)
  }, [tab, focusFinding])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    // focus starts on the selected tab, so the arrow keys work at once
    tabRefs.current[tab]?.focus()
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
    const sev = findings[index].severity
    setSevOn((on) => (on[sev] ? on : { ...on, [sev]: true }))
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
  // always rendered, so every tab's aria-controls has its panel
  const panelProps = (id: Tab) => ({
    id: 'editor-panel-' + id,
    role: 'tabpanel',
    tabIndex: 0,
    hidden: tab !== id,
    'aria-labelledby': 'editor-tab-' + id,
  })

  const visible = findings.filter((f) => sevOn[f.severity])
  const hasNameFindings = visible.some((f) => f.ruleId === 'VAR_NAME_FORMAT')
  // a card's id comes from its first finding, so it stays the same when the filter changes
  const cardId = (f: Finding) => 'editor-finding-' + findings.indexOf(f)
  const entries = groupFindings(visible)
  const lost = lostPoints(findings)
  const points = entryPoints(entries, lost)
  const firstOfFamily = (group: string) => findings.find((f) => capGroup(f.ruleId) === group)
  // a Points lost item opens the Findings tab (with its severity on) before PointsLost scrolls to the card
  const openLost = (event: MouseEvent) => {
    const li = (event.target as Element).closest('.report-lost-list > li')
    // the last item is the total, which has no family
    const item = li && lost[[...li.parentElement!.children].indexOf(li)]
    const first = item && firstOfFamily(item.group)
    if (!first) return
    flushSync(() => {
      setSevOn((on) => ({ ...on, [first.severity]: true }))
      setTab('findings')
    })
  }
  const lastLine = bot.actions.at(-1)?.line ?? 1
  const lineAction = (at: number) => t('editor.showLine', { line: number(at) })
  // a variable finding without a line shows its row on the Variables tab
  const showVar = (name: string) => {
    setFlashVar(name)
    setTab('vars')
  }
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
        // Escape first folds an inline finding, then closes the editor
        if (openLine !== null) setOpenLine(null)
        else close()
      }}
    >
      <div className="drawer-head">
        <div className="drawer-heading">
          <h1 className="drawer-title">
            <Name text={bot.name} className="drawer-name" id="editor-title" />{' '}
            <Grade score={score} className="tb-grade" />
          </h1>
          <div className="drawer-sub">{bot.path}</div>
        </div>
        {/* one actions group with the only auto margin, so its x does not follow the title length */}
        <div className="drawer-actions">
          <button type="button" className="btn ghost drawer-map" onClick={onShowOnMap}>
            {t('editor.showOnMap')}
          </button>
          <ThemeToggles />
          <button className="btn ghost drawer-close" onClick={close}>
            <svg className="drawer-close-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3 3 10 10M13 3 3 13" />
            </svg>
            {t('editor.close')}
          </button>
        </div>
      </div>
      <div className="drawer-stats">
        <span>{plural('node.lines', metrics.totalLines)}</span>
        <span>{plural('node.comments', metrics.commentLines)}</span>
        <span>{plural('node.logs', metrics.logMessages)}</span>
        <span>{plural('node.vars', metrics.variables)}</span>
        <span>{plural('node.packages', bot.packages.length)}</span>
      </div>
      {lost.length > 0 && (
        // every rule shows when open: no inner scroll box
        <details className="drawer-lost" open={lostOpen} onToggle={(event) => setLostOpen(event.currentTarget.open)} onClickCapture={openLost}>
          <summary className="drawer-lost-summary">{plural('editor.lost.summary', lost.length, { points: number(lostTotal(lost)) })}</summary>
          <PointsLost lost={lost} stacked label={false} targetOf={(g) => { const f = firstOfFamily(g); return f && cardId(f) }} />
        </details>
      )}
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

      <div className="code-panel" {...panelProps('code')}>
        <ol className="code-list" ref={codeListRef}>
          {bot.actions.map((a) => {
            const fs = byLine.get(a.line) ?? []
            // findings are sorted severity first, so the first one is the worst of the line
            const worst = fs.length ? findings[fs[0]] : undefined
            const open = openLine === a.line && worst !== undefined
            const msgs = fs.map((i) => t(`rule.${findings[i].ruleId}.msg`, findings[i].params)).join(' · ')
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
                {/* every row keeps the flag cell, so all rows end at the same x */}
                <span className="code-flag-cell">
                  {worst && (
                    <button
                      type="button"
                      className="code-flag"
                      aria-label={msgs}
                      title={msgs}
                      aria-expanded={open}
                      onClick={() => setOpenLine(open ? null : a.line)}
                    >
                      <SeverityIcon severity={worst.severity} />
                    </button>
                  )}
                </span>
                {open && (
                  <div className="code-inline">
                    {fs.map((i) => (
                      <FindingCard key={i} finding={findings[i]} />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {byLine.size > 0 && (
          // a pointer overview only: keyboard and screen-reader users have the full-size flags in each row
          <div className="code-rail no-print" aria-hidden="true">
            {[...byLine].map(([at, fs]) => (
              <button
                key={at}
                type="button"
                tabIndex={-1}
                className={'code-tick sev-' + findings[fs[0]].severity}
                style={{ top: ((at - 1) / lastLine) * 100 + '%' }}
                title={lineAction(at)}
                onClick={() => jumpTo(at)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="drawer-scroll" ref={varsRef} {...panelProps('vars')}>
        <table className="var-table">
          <thead>
            <tr>
              <th>{t('editor.var.name')}</th>
              <th>{t('editor.var.type')}</th>
              <th>{t('editor.var.io')}</th>
              <th>{t('editor.var.desc')}</th>
              <th>{t('editor.findings')}</th>
            </tr>
          </thead>
          <tbody>
            {bot.variables.map((v) => {
              const fs = byVar.get(v.name) ?? []
              return (
                <tr key={v.name} data-var={v.name} className={[fs.length ? 'has-findings' : '', v.name === flashVar ? 'flash' : ''].filter(Boolean).join(' ') || undefined}>
                  <td>{v.name}</td>
                  <td>
                    <span className="tb-var-dot" style={{ background: typeColor(v.type) }} aria-hidden="true" /> {typeLabel(v.type, lang)}
                  </td>
                  <td>{v.input && v.output ? t('editor.var.both') : v.input ? t('editor.var.in') : v.output ? t('editor.var.out') : v.readOnly ? t('editor.var.const') : '—'}</td>
                  <td className="var-desc">{v.description || '—'}</td>
                  <td>
                    {fs.map((f) => {
                      const msg = t(`rule.${f.ruleId}.msg`, f.params)
                      const index = findings.indexOf(f)
                      return (
                        <button key={index} type="button" className="code-flag" aria-label={msg} title={msg} onClick={() => showFinding(index)}>
                          <SeverityIcon severity={f.severity} />
                        </button>
                      )
                    })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="drawer-scroll" ref={findingsRef} {...panelProps('findings')}>
        {findings.length === 0 ? (
          <p className="empty-state"><Icon name="circle-check" className="empty-ok" /> {t('editor.noFindings')}</p>
        ) : (
          <>
            <div className="report-options editor-filter" role="group" aria-label={t('editor.filter.label')}>
              <SeverityFilter
                label={t('editor.filter.title')}
                counts={severityCounts}
                on={sevOn}
                onToggle={(sev) => setSevOn((on) => ({ ...on, [sev]: !on[sev] }))}
              />
            </div>
            {visible.length === 0 ? (
              <p className="empty-state">
                {t('editor.filter.empty')}{' '}
                <button type="button" className="btn" onClick={() => setSevOn(ALL_ON)}>{t('editor.filter.showAll')}</button>
              </p>
            ) : (
              <div className="finding-list">
                {hasNameFindings && <p className="name-key">{t('report.nameKey')}</p>}
                {entries.map((e, k) => {
                  const list = e.kind === 'group' ? e.findings : [e.finding]
                  const at = lineOf(list[0])
                  // data-finding lists every finding of the card, so a Variables flag finds its card inside a group
                  return (
                    <div key={cardId(list[0])} data-finding={list.map((f) => findings.indexOf(f)).join(' ')}>
                      {e.kind === 'group' ? (
                        <FindingGroupCard id={cardId(list[0])} points={points.get(k)} onVar={showVar} findings={list} lineOf={lineOf} onLine={jumpTo} lineAction={lineAction} />
                      ) : (
                        <FindingCard
                          id={cardId(e.finding)}
                          points={points.get(k)}
                          onVar={showVar}
                          finding={e.finding}
                          line={at}
                          onLine={at === undefined ? undefined : () => jumpTo(at)}
                          lineAction={at === undefined ? undefined : lineAction(at)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  )
}
