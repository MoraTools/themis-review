import { Icon, SeverityIcon } from '../Icons'
import { useContext, useEffect, useMemo, useState } from 'react'
import type { Finding, ProjectAnalysis, Severity } from '../../core/model'
import { GRADE_BANDS, capGroup } from '../../core/score'
import { LangContext, useT, useNumber, usePlural } from '../i18n'
import { Name } from '../shared/Name'
import { Grade } from '../shared/Grade'
import { SortHeader, nextSort, type Sort } from '../shared/SortHeader'
import { FindingCard, FindingGroupCard, PointsLost } from '../findings/FindingCard'
import { SeverityFilter, type SeverityOn } from '../findings/SeverityFilter'
import {
  compareFindings,
  findingLine,
  gradeDistribution,
  groupFindings,
  hiddenList,
  hiddenTotal,
  lostPoints,
  scoringLines,
  SEVERITIES,
  severityCounts,
} from '../findings/findings'

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
  onOpen: (path: string, line?: number) => void
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
    for (const list of grouped.values()) list.sort(compareFindings)
    return grouped
  }, [analysis])

  const rows = useMemo(() => {
    const list = analysis.taskbots.map((b, i) => {
      const all = byBot.get(b.path) ?? []
      return {
        bot: b,
        // stable anchor per taskbot for the PDF links and the Points lost targets
        anchor: 'bot-' + i,
        m: analysis.metrics[b.path],
        s: analysis.scores[b.path],
        all,
        counts: severityCounts(all),
        findings: all.filter((f) => sevOn[f.severity]),
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

  const included = SEVERITIES.filter((s) => sevOn[s]).map((s) => t('report.severity.' + s)).join(', ') || t('report.scope.nothing')
  const hidden = hiddenList(counts, sevOn, lang)
  const anyHidden = SEVERITIES.some((s) => !sevOn[s])
  const scoring = scoringLines(lang)
  const dist = gradeDistribution(Object.values(analysis.scores))
  const lineAction = (line: number) => t('report.finding.openLine', { line: number(line) })
  const shownRows = rows.filter((r) => r.findings.length > 0)
  const silent = rows.filter((r) => r.findings.length === 0)
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
                <span className={'grade-' + b.grade}>{b.grade} {number(dist[b.grade])}</span>
              </span>
            ))}</span>
          </p>
        </div>
      </header>

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
              <SortHeader col="lines" label={t('node.lines')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="comments" label={t('node.comments')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="logs" label={t('node.logs')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="vars" label={t('node.vars')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <SortHeader col="findings" label={anyHidden ? t('report.findings.shownTotal') : t('report.findings')} sort={sort} onSort={toggleSort} className="num" />
              <SortHeader col="score" label={t('report.score')} sort={sort} onSort={toggleSort} className="num" />
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
                  {/* the PDF links each name to its section (clean taskbots to the compact list) */}
                  <a className="print-only row-anchor" href={'#' + (r.findings.length > 0 ? r.anchor : 'report-clean')}>{r.bot.name}</a>
                </td>
                <td role="cell" className="num col-detail">{number(r.m.totalLines)}</td>
                <td role="cell" className="num col-detail">{number(r.m.commentLines)}</td>
                <td role="cell" className="num col-detail">{number(r.m.logMessages)}</td>
                <td role="cell" className="num col-detail">{number(r.m.variables)}</td>
                <td role="cell" className="num">
                  <span className="sev-counts">
                    {SEVERITIES.filter((s) => r.counts[s] > 0).map((s) => (
                      <span key={s} className={'sev-count' + (sevOn[s] ? '' : ' dim')}>
                        <SeverityIcon severity={s} />
                        <span className="sr-only">{t('report.severity.' + s)}</span>
                        {number(r.counts[s])}
                      </span>
                    ))}
                    {anyHidden
                      ? <span className="findings-ratio">{number(r.findings.length)} / {number(r.all.length)}</span>
                      : r.all.length === 0 && number(0)}
                  </span>
                </td>
                <td role="cell" className="num">
                  <Grade score={r.s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="summary-note no-print">{t('report.summary.note')}</p>

      {analysis.findings.length === 0 ? (
        <p id="report-clean" className="empty-state report-clean">
          <Icon name="circle-check" className="empty-ok" /> {plural('report.clean', rows.length)}
        </p>
      ) : silent.length > 0 && (
        <div id="report-clean" className="report-silent">
          {t('report.silent')}
          {/* a wrap list with gaps, no separator glyph that could start a line */}
          <ul className="report-silent-list">
            {silent.map((r) => {
              const list = hiddenList(r.counts, sevOn, lang)
              return (
                <li key={r.bot.path} className="report-silent-item">
                  <button type="button" className="row-name" aria-label={t('report.openInEditor', { name: r.bot.name })} onClick={() => onOpen(r.bot.path)}>
                    {r.bot.name}
                  </button>
                  {list && ` (${plural('report.silent.hidden', hiddenTotal(r.counts, sevOn), { list })})`}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {shownRows.map((r) => {
        const lineOf = (f: Finding) => findingLine(f, r.bot)
        const entries = groupFindings(r.findings)
        // the first card of each rule gets an anchor; Points lost links each family to its first card
        const anchorAt = new Map<number, string>()
        const families = new Map<string, string>()
        const seen = new Set<string>()
        entries.forEach((e, i) => {
          const ruleId = e.kind === 'group' ? e.ruleId : e.finding.ruleId
          if (seen.has(ruleId)) return
          seen.add(ruleId)
          const id = `${r.anchor}-${ruleId}`
          anchorAt.set(i, id)
          if (!families.has(capGroup(ruleId))) families.set(capGroup(ruleId), id)
        })
        return (
          <section key={r.bot.path} id={r.anchor} className="report-bot">
            <h2>
              <Name text={r.bot.name} className="report-bot-name" />{' '}
              <Grade score={r.s} className="tb-grade" />
            </h2>
            <p className="report-bot-path">{r.bot.path}</p>
            <PointsLost lost={lostPoints(r.all)} targetOf={(g) => families.get(g)} />
            {r.findings.some((f) => f.ruleId === 'VAR_NAME_FORMAT') && <p className="name-key">{t('report.nameKey')}</p>}
            {entries.map((e, i) => {
              if (e.kind === 'group') {
                return (
                  <FindingGroupCard
                    key={i}
                    id={anchorAt.get(i)}
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
                  id={anchorAt.get(i)}
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
