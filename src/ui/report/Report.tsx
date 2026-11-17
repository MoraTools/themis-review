import { Icon, SeverityIcon } from '../Icons'
import { useContext, useMemo, useState } from 'react'
import type { Finding, ProjectAnalysis, Severity } from '../../core/model'
import { GRADE_BANDS } from '../../core/score'
import { LangContext, useT, useNumber } from '../i18n'
import { Name } from '../shared/Name'
import { FindingCard, FindingGroupCard } from '../findings/FindingCard'
import {
  compareFindings,
  findingLine,
  gradeDistribution,
  groupFindings,
  hiddenList,
  lostPoints,
  scoringLines,
  SEVERITIES,
  severityCounts,
} from '../findings/findings'

type SortCol = 'name' | 'lines' | 'comments' | 'logs' | 'vars' | 'findings' | 'score'
type Sort = { col: SortCol; dir: 1 | -1 }

// module scope: defining this inside Report would remount every <th> on each render
function Th({ col, label, sort, onSort, className = '' }: { col: SortCol; label: string; sort: Sort; onSort: (c: SortCol) => void; className?: string }) {
  const active = sort.col === col
  return (
    <th className={'sortable ' + className + (active ? ' sorted' : '')} aria-sort={active ? sort.dir === 1 ? 'ascending' : 'descending' : 'none'}>
      <button onClick={() => onSort(col)}>{label}
      {active && <Icon name={sort.dir === 1 ? 'arrow-up' : 'arrow-down'} className="sort-icon" />}</button>
    </th>
  )
}

export default function Report({
  analysis,
  onOpen,
}: {
  analysis: ProjectAnalysis
  /** open a taskbot in the editor, optionally at a line */
  onOpen: (path: string, line?: number) => void
}) {
  const t = useT()
  const number = useNumber()
  const { lang } = useContext(LangContext)
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date())
  // info findings are noise in a printed report; opt in when you want the full list
  const [sevOn, setSevOn] = useState<Record<Severity, boolean>>({ error: true, warn: true, info: false })
  // worst score first: the report leads with the taskbots that need work
  const [sort, setSort] = useState<Sort>({ col: 'score', dir: 1 })

  const counts = useMemo(() => severityCounts(analysis.findings), [analysis])
  const byBot = useMemo(() => {
    const grouped = new Map<string, Finding[]>()
    for (const f of analysis.findings) grouped.set(f.botPath, [...(grouped.get(f.botPath) ?? []), f])
    for (const list of grouped.values()) list.sort(compareFindings)
    return grouped
  }, [analysis])

  const rows = useMemo(() => {
    const list = analysis.taskbots.map((b) => {
      const all = byBot.get(b.path) ?? []
      return { bot: b, m: analysis.metrics[b.path], s: analysis.scores[b.path], all, findings: all.filter((f) => sevOn[f.severity]) }
    })
    const value = (r: (typeof list)[number]): string | number => {
      switch (sort.col) {
        case 'name': return r.bot.name
        case 'lines': return r.m.totalLines
        case 'comments': return r.m.commentLines
        case 'logs': return r.m.logMessages
        case 'vars': return r.m.variables
        case 'findings': return r.findings.length
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

  const toggleSort = (col: SortCol) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === 1 ? -1 : 1 }))

  const included = SEVERITIES.filter((s) => sevOn[s]).map((s) => t('report.severity.' + s)).join(', ') || t('report.scope.nothing')
  const hidden = hiddenList(counts, sevOn, lang)
  const scoring = scoringLines(lang)
  const dist = gradeDistribution(Object.values(analysis.scores))
  const lineAction = (line: number) => t('report.finding.openLine', { line: number(line) })
  const silent = rows.filter((r) => r.findings.length === 0)

  return (
    <div className="report">
      <header className="report-head">
        <h1>{t('report.title')}</h1>
        <div className={'report-score grade-' + analysis.projectScore.grade}>
          <span className="report-score-num">{number(analysis.projectScore.score)}</span>
          <span className="report-score-grade">{analysis.projectScore.grade}</span>
        </div>
      </header>
      <p className="report-meta">
        {t('report.date')}: {date} · {t('report.files')}: {analysis.zipNames.join(', ')}
      </p>
      <div className="report-facts">
        <p>
          {t('report.scope.included', { list: included })}
          {hidden && ' ' + t('report.scope.hidden', { list: hidden })} {t('report.scope.score')}
        </p>
        <p>{scoring.rule}</p>
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

      <div className="report-options no-print">
        <span className="report-options-label">{t('report.filter.title')}</span>
        {SEVERITIES.map((sev) => (
          <label key={sev} className={'sev-toggle sev-' + sev + (sevOn[sev] ? ' on' : '')}>
            <input
              type="checkbox"
              checked={sevOn[sev]}
              onChange={() => setSevOn((s) => ({ ...s, [sev]: !s[sev] }))}
            />
            <SeverityIcon severity={sev} /> {t('report.severity.' + sev)} ({number(counts[sev])})
          </label>
        ))}
        <span className="report-options-hint">{t('report.filter.hint')}</span>
      </div>

      <h2>{t('report.summary')}</h2>
      <div className="table-scroll">
        <table className="report-table summary-table">
          <thead>
            <tr>
              <Th col="name" label={t('report.taskbot')} sort={sort} onSort={toggleSort} />
              <Th col="lines" label={t('node.lines')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <Th col="comments" label={t('node.comments')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <Th col="logs" label={t('node.logs')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <Th col="vars" label={t('node.vars')} sort={sort} onSort={toggleSort} className="num col-detail" />
              <Th col="findings" label={t('report.findings')} sort={sort} onSort={toggleSort} className="num" />
              <Th col="score" label={t('report.score')} sort={sort} onSort={toggleSort} className="num" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bot.path}>
                <td>
                  <button
                    type="button"
                    className="row-name"
                    data-bot={r.bot.path}
                    aria-label={t('report.openInEditor', { name: r.bot.name })}
                    onClick={() => onOpen(r.bot.path)}
                  >
                    <Name text={r.bot.name} className="row-name-text" />
                  </button>
                </td>
                <td className="num col-detail">{number(r.m.totalLines)}</td>
                <td className="num col-detail">{number(r.m.commentLines)}</td>
                <td className="num col-detail">{number(r.m.logMessages)}</td>
                <td className="num col-detail">{number(r.m.variables)}</td>
                <td className="num">
                  {r.findings.length < r.all.length
                    ? `${number(r.findings.length)} / ${number(r.all.length)}`
                    : number(r.all.length)}
                </td>
                <td className={'num grade-' + r.s.grade}>
                  {number(r.s.score)} · {r.s.grade}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.map((r) => {
        const lost = lostPoints(r.all)
        const lineOf = (f: Finding) => findingLine(f, r.bot)
        return (
          <section key={r.bot.path} className={'report-bot' + (r.findings.length === 0 ? ' no-print' : '')}>
            <h2>
              <Name text={r.bot.name} className="report-bot-name" />{' '}
              <span className={'tb-grade grade-' + r.s.grade}>{number(r.s.score)} · {r.s.grade}</span>
            </h2>
            <p className="report-bot-path">{r.bot.path}</p>
            {lost.length > 0 && (
              <p className="report-lost">
                {t('report.lost')}{' '}
                {lost.map((l, i) => (
                  <span key={l.group}>
                    {i > 0 && ' · '}
                    <code>{l.group}</code> −{number(l.points)}{l.capped && ` (${t('report.lost.cap')})`}
                  </span>
                ))}
              </p>
            )}
            {r.all.length === 0 && (
              <p className="empty-state"><Icon name="circle-check" className="empty-ok" /> {t('report.noFindings')}</p>
            )}
            {r.all.length > 0 && r.findings.length === 0 && (
              <p className="empty-state">
                {t('report.bot.noneShown', { list: hiddenList(severityCounts(r.all), sevOn, lang) })}
              </p>
            )}
            {r.findings.some((f) => f.ruleId === 'VAR_NAME_FORMAT') && <p className="name-key">{t('report.nameKey')}</p>}
            {groupFindings(r.findings).map((e, i) => {
              if (e.kind === 'group') {
                return (
                  <FindingGroupCard
                    key={i}
                    findings={e.findings}
                    lineOf={lineOf}
                    onLine={(line) => onOpen(r.bot.path, line)}
                    lineAction={lineAction}
                  />
                )
              }
              const line = lineOf(e.finding)
              return (
                <FindingCard
                  key={i}
                  finding={e.finding}
                  line={line}
                  onLine={line === undefined ? undefined : () => onOpen(r.bot.path, line)}
                  lineAction={line === undefined ? undefined : lineAction(line)}
                />
              )
            })}
          </section>
        )
      })}
      {silent.length > 0 && (
        <p className="report-silent print-only">
          {t('report.silent')}{' '}
          {silent.map((r, i) => {
            const list = hiddenList(severityCounts(r.all), sevOn, lang)
            return (
              <span key={r.bot.path}>
                {i > 0 && ' · '}
                {r.bot.name}
                {list && ` (${t('report.silent.hidden', { list })})`}
              </span>
            )
          })}
        </p>
      )}
      <footer className="report-foot">
        {t('report.generatedBy')} · {date}
        <br />
        {t('credit')}
      </footer>
    </div>
  )
}
