import { Icon, SeverityIcon } from '../Icons'
import { useContext, useEffect, useMemo, useState } from 'react'
import type { Finding, ProjectAnalysis, Severity } from '../../core/model'
import { GRADE_BANDS, capGroup } from '../../core/score'
import { groupLabel } from '../findings/findings'
import { LangContext, plural as pluralText, useT, useNumber, usePlural, type Lang } from '../i18n'
import { Name } from '../shared/Name'
import { Grade, GradeCount } from '../shared/Grade'
import { SortHeader, nextSort, type Sort } from '../shared/SortHeader'
import { CardLink, FindingCard, FindingGroupCard, HiddenNote, LostPoints, PointsLost, goToCard, lostOpenDefault } from '../findings/FindingCard'
import { SeverityFilter, type SeverityOn } from '../findings/SeverityFilter'
import {
  compareByFamily,
  entryPoints,
  findingLine,
  fixFirst,
  gradeDistribution,
  groupFindings,
  hiddenList,
  hiddenTotal,
  includedList,
  lostPoints,
  lostTotal,
  scoringLines,
  SEVERITIES,
  severityCounts,
} from '../findings/findings'

export { GradeCount }

/** the hidden findings of a family with their count, '8 Info, not shown', or undefined when none is hidden */
function hiddenNote(findings: Finding[], shown: SeverityOn, lang: Lang): string | undefined {
  const counts = severityCounts(findings)
  const n = hiddenTotal(counts, shown)
  return n ? pluralText(lang, 'report.lost.hidden', n, { list: hiddenList(counts, shown, lang) }) : undefined
}

type SortCol = 'name' | 'lines' | 'comments' | 'logs' | 'vars' | 'findings' | 'score'

export default function Report({
  analysis,
  onOpen,
  sevOn,
  onToggleSeverity,
  onRule,
}: {
  analysis: ProjectAnalysis
  /** open a taskbot in the editor, optionally at a line */
  onOpen: (path: string, line?: number, variable?: string) => void
  /** the severity filter, kept by the shell across view switches */
  sevOn: SeverityOn
  onToggleSeverity: (severity: Severity) => void
  /** show a rule in the Rules view */
  onRule: (ruleId: string) => void
}) {
  const t = useT()
  const number = useNumber()
  const plural = usePlural()
  const { lang } = useContext(LangContext)
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date())
  // worst score first: the report leads with the taskbots that need work
  const [sort, setSort] = useState<Sort<SortCol>>({ col: 'score', dir: 1 })

  const counts = useMemo(() => severityCounts(analysis.findings), [analysis])
  const byBot = useMemo(() => {
    const grouped = new Map<string, Finding[]>()
    for (const f of analysis.findings) grouped.set(f.botPath, [...(grouped.get(f.botPath) ?? []), f])
    return grouped
  }, [analysis])

  const rows = useMemo(() => {
    const list = analysis.taskbots.map((b, i) => {
      const all = byBot.get(b.path) ?? []
      // stable anchor per taskbot for the PDF links and the Points lost targets
      const anchor = 'bot-' + i
      const lost = lostPoints(all)
      // cards in the Points lost order: family points, then severity, then line
      const findings = all.filter((f) => sevOn[f.severity]).sort(compareByFamily(lost))
      const entries = groupFindings(findings)
      // the first card of each rule gets an anchor; Points lost and Fix first link each family to its first card
      const anchorAt = new Map<number, string>()
      const families = new Map<string, string>()
      const seen = new Set<string>()
      entries.forEach((e, k) => {
        const ruleId = e.kind === 'group' ? e.ruleId : e.finding.ruleId
        if (seen.has(ruleId)) return
        seen.add(ruleId)
        const id = `${anchor}-${ruleId}`
        anchorAt.set(k, id)
        if (!families.has(capGroup(ruleId))) families.set(capGroup(ruleId), id)
      })
      return {
        bot: b, anchor, all, findings, entries, anchorAt, families, lost,
        m: analysis.metrics[b.path],
        s: analysis.scores[b.path],
        counts: severityCounts(all),
        points: entryPoints(entries, lost),
      }
    })
    const value = (r: (typeof list)[number]): string | number => {
      switch (sort.col) {
        case 'name': return r.bot.name
        case 'lines': return r.m.totalLines
        case 'comments': return r.m.commentLines
        case 'logs': return r.m.logMessages
        case 'vars': return r.m.variables
        // errors first, then warnings, then info
        case 'findings': return (r.counts.error * 1e4 + r.counts.warn) * 1e4 + r.counts.info
        case 'score': return r.s.score
      }
    }
    return [...list].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      const cmp = typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)
      return cmp * sort.dir
    })
  }, [analysis, sort, byBot, sevOn])

  const toggleSort = (col: SortCol) => setSort((s) => nextSort(s, col))

  const included = includedList(sevOn, lang)
  const hidden = hiddenList(counts, sevOn, lang)
  const scoring = scoringLines(lang)
  const dist = gradeDistribution(Object.values(analysis.scores))
  const lineAction = (line: number) => t('report.finding.openLine', { line: number(line) })
  const shownRows = rows.filter((r) => r.findings.length > 0)
  const rowOf = new Map(rows.map((r) => [r.bot.path, r]))
  const familyOf = (r: (typeof rows)[number], group: string) => r.all.filter((f) => capGroup(f.ruleId) === group)
  const hiddenOf = (r: (typeof rows)[number]) => (group: string) => hiddenNote(familyOf(r, group), sevOn, lang)
  // a hidden-family button turns its severities on; the card exists after the next render, then it gets focus
  const [pending, setPending] = useState<{ botPath: string; group: string } | null>(null)
  const showHidden = (r: (typeof rows)[number]) => (group: string) => {
    for (const s of SEVERITIES) if (!sevOn[s] && familyOf(r, group).some((f) => f.severity === s)) onToggleSeverity(s)
    setPending({ botPath: r.bot.path, group })
  }
  useEffect(() => {
    if (!pending) return
    const target = rowOf.get(pending.botPath)?.families.get(pending.group)
    if (target) {
      goToCard(target)
      setPending(null)
    }
  })
  // the PDF shows every Points lost list: closed boxes open for the print and close again after it
  useEffect(() => {
    let closed: HTMLDetailsElement[] = []
    const before = () => {
      closed = [...document.querySelectorAll<HTMLDetailsElement>('details.report-lost-box:not([open])')]
      for (const d of closed) d.open = true
    }
    const after = () => { for (const d of closed) d.open = false }
    addEventListener('beforeprint', before)
    addEventListener('afterprint', after)
    return () => { removeEventListener('beforeprint', before); removeEventListener('afterprint', after) }
  }, [])
  const [lostOpen] = useState(lostOpenDefault)
  const { items: top, more } = fixFirst(analysis)
  const project = (points: number) => t('report.fixFirst.project', { points: number(points) })
  // pages 2+ of the PDF name the report: @page margin boxes read custom properties only from the root element
  const printId = `${analysis.zipNames.join(', ')} · ${date}`
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--print-id', JSON.stringify(printId))
    return () => { root.removeProperty('--print-id') }
  }, [printId])

  return (
    <div className="report">
      {/* title, meta and facts in column 1, the grade box beside them */}
      <header className="report-head">
        <h1>{t('report.title')}</h1>
        <div className="report-score">
          <span className="report-score-label">{t('report.projectScore')}</span>
          <Grade score={analysis.projectScore} />
        </div>
        <p className="report-meta">
          {t('report.date')}: {date} · {t('report.files')}: {analysis.zipNames.join(', ')}
        </p>
        <div className="report-facts">
          <p className="report-facts-scope">
            {t('report.scope.included', { list: included })}
            {hidden && ' ' + plural('report.scope.hidden', hiddenTotal(counts, sevOn), { list: hidden })} {t('report.scope.score')}
          </p>
          <p className="report-facts-rule">{scoring.rule}</p>
          <p>{scoring.bands}</p>
          <p>
            {t('report.scoring.dist')}{' '}
            <span className="report-dist">{GRADE_BANDS.map((b, i) => (
              <span key={b.grade}>
                {i > 0 && ' · '}
                <GradeCount grade={b.grade} count={dist[b.grade]} />
              </span>
            ))}</span>
          </p>
        </div>
      </header>

      {top.length > 0 && (
        <section className="report-fix" aria-labelledby="report-fix-title">
          <h2 id="report-fix-title">{t('report.fixFirst')}</h2>
          <p className="report-fix-note">{t('report.fixFirst.note')}</p>
          <ol className="report-fix-list">
            {top.map((l) => {
              const r = rowOf.get(l.botPath)!
              const target = r.families.get(l.group)
              const hidden = target ? undefined : hiddenOf(r)(l.group)
              const body = (
                <>
                  <span className="report-fix-bot">{r.bot.name}</span> · <span className="report-lost-title">{groupLabel(lang, l.group)}</span> ·{' '}
                  <span className="report-lost-points"><LostPoints lost={l} /> · {project(l.project)}</span>
                </>
              )
              return (
                <li key={l.botPath + l.group}>
                  {target ? <CardLink target={target}>{body}</CardLink> : body}
                  {hidden && <> <HiddenNote text={hidden} onShow={() => showHidden(r)(l.group)} /></>}
                </li>
              )
            })}
          </ol>
          {more > 0 && <p className="report-fix-more">{plural('report.fixFirst.more', more)}</p>}
        </section>
      )}

      <div className="report-options no-print">
        <SeverityFilter label={t('report.filter.title')} counts={counts} on={sevOn} onToggle={onToggleSeverity} />
        <span className="report-options-hint">{t('report.filter.hint')}</span>
      </div>

      <h2>{t('report.summary')}</h2>
      <div className="table-scroll">
        {/* explicit roles: under 760px the rows are grids, which drops the implicit table semantics */}
        <table className="report-table summary-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <SortHeader col="name" label={t('report.taskbot')} sort={sort} onSort={toggleSort} />
              <SortHeader col="score" label={t('report.score')} sort={sort} onSort={toggleSort} className="num col-score" />
              <SortHeader col="lines" label={t('node.lines')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="comments" label={t('node.comments')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="logs" label={t('node.logs')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="vars" label={t('node.vars')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="findings" label={t('report.findings')} sort={sort} onSort={toggleSort} className="col-findings" />
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((r) => (
              <tr role="row" key={r.bot.path}>
                <td role="cell">
                  <button
                    type="button"
                    className="row-name no-print"
                    data-bot={r.bot.path}
                    aria-label={t('report.openInEditor', { name: r.bot.name })}
                    onClick={() => onOpen(r.bot.path)}
                  >
                    <Name text={r.bot.name} className="row-name-text" />
                  </button>
                  {/* the PDF links each name to its section; a taskbot with no shown finding has none */}
                  {r.findings.length > 0
                    ? <a className="print-only row-anchor" href={'#' + r.anchor}>{r.bot.name}</a>
                    : <span className="print-only row-anchor">{r.bot.name}</span>}
                </td>
                <td role="cell" className="num col-score">
                  <Grade score={r.s} />
                </td>
                <td role="cell" className="num col-detail">{number(r.m.totalLines)}</td>
                <td role="cell" className="num col-detail">{number(r.m.commentLines)}</td>
                <td role="cell" className="num col-detail">{number(r.m.logMessages)}</td>
                <td role="cell" className="num col-detail">{number(r.m.variables)}</td>
                <td role="cell" className="col-findings">
                  {/* fixed slots (error, warning, info), empty for 0, so each icon sits at the same x in every row;
                      a clean taskbot has none, so 'No findings' starts at the column edge */}
                  {r.all.length === 0 ? <span className="sev-none">{t('report.noFindings')}</span> : (
                    <span className="sev-slots">
                      {SEVERITIES.map((s) => (
                        <span key={s} className={'sev-slot sev-slot-' + s + (sevOn[s] ? '' : ' dim')}>
                          {r.counts[s] > 0 && (
                            <>
                              <SeverityIcon severity={s} />
                              <span className="sr-only">{t('report.severity.' + s)}</span>
                              {number(r.counts[s])}
                            </>
                          )}
                        </span>
                      ))}
                      {/* the ratio only when the filter hides some findings of this taskbot */}
                      {r.findings.length === 0
                        ? <span className="sev-shown">{plural('report.silent.hidden', hiddenTotal(r.counts, sevOn), { list: hiddenList(r.counts, sevOn, lang) })}</span>
                        : r.findings.length < r.all.length && <span className="sev-shown">{plural('report.findings.shown', r.all.length, { shown: number(r.findings.length) })}</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="summary-note no-print">{t('report.summary.note')}</p>

      {analysis.findings.length === 0 && (
        <p id="report-clean" className="empty-state report-clean">
          <Icon name="circle-check" className="empty-ok" /> {plural('report.clean', rows.length)}
        </p>
      )}

      {shownRows.map((r) => {
        const lineOf = (f: Finding) => findingLine(f, r.bot)
        const onVar = (name: string) => onOpen(r.bot.path, undefined, name)
        return (
          <section key={r.bot.path} id={r.anchor} className="report-bot">
            <h2>
              {/* a finding without a line still leads to the editor: the name opens it */}
              <button type="button" className="row-name report-bot-open no-print" aria-label={t('report.openInEditor', { name: r.bot.name })} onClick={() => onOpen(r.bot.path)}>
                <Name text={r.bot.name} className="report-bot-name" />
              </button>
              <Name text={r.bot.name} className="report-bot-name print-only" />{' '}
              <Grade score={r.s} className="tb-grade" />
            </h2>
            <p className="report-bot-path">{r.bot.path}</p>
            {r.lost.length > 0 && (
              // closed under 760 px, where the list would push the cards a screen down; the PDF opens it
              <details className="report-lost-box" open={lostOpen}>
                <summary className="report-lost-summary">{plural('editor.lost.summary', r.lost.length, { points: number(lostTotal(r.lost)) })}</summary>
                <PointsLost lost={r.lost} targetOf={(g) => r.families.get(g)} hiddenOf={hiddenOf(r)} onShowHidden={showHidden(r)} />
              </details>
            )}
            {r.findings.some((f) => f.ruleId === 'VAR_NAME_FORMAT') && <p className="name-key">{t('report.nameKey')}</p>}
            {r.entries.map((e, i) => {
              if (e.kind === 'group') {
                return (
                  <FindingGroupCard
                    key={i}
                    id={r.anchorAt.get(i)}
                    points={r.points.get(i)}
                    onVar={onVar}
                    findings={e.findings}
                    lineOf={lineOf}
                    onLine={(line) => onOpen(r.bot.path, line)}
                    lineAction={lineAction}
                    onRule={onRule}
                  />
                )
              }
              const line = lineOf(e.finding)
              return (
                <FindingCard
                  key={i}
                  id={r.anchorAt.get(i)}
                  points={r.points.get(i)}
                  onVar={onVar}
                  finding={e.finding}
                  line={line}
                  onLine={line === undefined ? undefined : () => onOpen(r.bot.path, line)}
                  lineAction={line === undefined ? undefined : lineAction(line)}
                  onRule={onRule}
                />
              )
            })}
          </section>
        )
      })}
      <footer className="report-foot">
        {t('report.generatedBy')} · {date}
        <br />
        {t('credit')}
      </footer>
    </div>
  )
}
