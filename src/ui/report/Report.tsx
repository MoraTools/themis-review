import { useMemo, useState } from 'react'
import type { ProjectAnalysis, Severity } from '../../core/model'
import { useT } from '../i18n'

const SEV_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 }
const SEV_ICON = { error: '🔴', warn: '🟡', info: '🔵' } as const
const SEVERITIES: Severity[] = ['error', 'warn', 'info']

type SortCol = 'name' | 'lines' | 'comments' | 'logs' | 'vars' | 'findings' | 'score'
type Sort = { col: SortCol; dir: 1 | -1 }

// module scope: defining this inside Report would remount every <th> on each render
function Th({ col, label, sort, onSort }: { col: SortCol; label: string; sort: Sort; onSort: (c: SortCol) => void }) {
  const active = sort.col === col
  return (
    <th className={'sortable' + (active ? ' sorted' : '')} onClick={() => onSort(col)}>
      {label}
      <span className="sort-arrow">{active ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
    </th>
  )
}

export default function Report({
  analysis,
  onSelectBot,
}: {
  analysis: ProjectAnalysis
  onSelectBot: (path: string) => void
}) {
  const t = useT()
  const date = new Date().toISOString().slice(0, 10)
  // info findings are noise in a printed report; opt in when you want the full list
  const [sevOn, setSevOn] = useState<Record<Severity, boolean>>({ error: true, warn: true, info: false })
  // worst score first: the report leads with the taskbots that need work
  const [sort, setSort] = useState<Sort>({ col: 'score', dir: 1 })

  const visible = useMemo(() => analysis.findings.filter((f) => sevOn[f.severity]), [analysis, sevOn])
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
    for (const finding of analysis.findings) counts[finding.severity]++
    return counts
  }, [analysis])
  const visibleByBot = useMemo(() => {
    const grouped = new Map<string, typeof visible>()
    for (const finding of visible) {
      const list = grouped.get(finding.botPath) ?? []
      list.push(finding)
      grouped.set(finding.botPath, list)
    }
    for (const list of grouped.values()) {
      list.sort(
        (x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || (x.line ?? 0) - (y.line ?? 0),
      )
    }
    return grouped
  }, [visible])

  const rows = useMemo(() => {
    const list = analysis.taskbots.map((b) => ({
      bot: b,
      m: analysis.metrics[b.path],
      s: analysis.scores[b.path],
      findings: visibleByBot.get(b.path) ?? [],
    }))
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
  }, [analysis, sort, visibleByBot])

  const toggleSort = (col: SortCol) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === 1 ? -1 : 1 }))

  return (
    <div className="report">
      <header className="report-head">
        <h1>{t('report.title')}</h1>
        <div className={'report-score grade-' + analysis.projectScore.grade}>
          <span className="report-score-num">{analysis.projectScore.score}</span>
          <span className="report-score-grade">{analysis.projectScore.grade}</span>
        </div>
      </header>
      <p className="report-meta">
        {t('report.date')}: {date} · {t('report.files')}: {analysis.zipNames.join(', ')}
      </p>

      <div className="report-options no-print">
        <span className="report-options-label">{t('report.filter.title')}</span>
        {SEVERITIES.map((sev) => (
          <label key={sev} className={'sev-toggle sev-' + sev + (sevOn[sev] ? ' on' : '')}>
            <input
              type="checkbox"
              checked={sevOn[sev]}
              onChange={() => setSevOn((s) => ({ ...s, [sev]: !s[sev] }))}
            />
            {SEV_ICON[sev]} {t('report.severity.' + sev)} ({severityCounts[sev]})
          </label>
        ))}
        <span className="report-options-hint">{t('report.filter.hint')}</span>
      </div>

      <h2>{t('report.summary')}</h2>
      <div className="table-scroll">
        <table className="report-table">
          <thead>
            <tr>
              <Th col="name" label={t('report.taskbot')} sort={sort} onSort={toggleSort} />
              <Th col="lines" label={t('node.lines')} sort={sort} onSort={toggleSort} />
              <Th col="comments" label={t('node.comments')} sort={sort} onSort={toggleSort} />
              <Th col="logs" label={t('node.logs')} sort={sort} onSort={toggleSort} />
              <Th col="vars" label={t('node.vars')} sort={sort} onSort={toggleSort} />
              <Th col="findings" label={t('report.findings')} sort={sort} onSort={toggleSort} />
              <Th col="score" label={t('report.score')} sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bot.path} className="row-link" title={t('report.openOnMap')} onClick={() => onSelectBot(r.bot.path)}>
                <td>{r.bot.name}</td>
                <td>{r.m.totalLines}</td>
                <td>{r.m.commentLines}</td>
                <td>{r.m.logMessages}</td>
                <td>{r.m.variables}</td>
                <td>{r.findings.length}</td>
                <td className={'grade-' + r.s.grade}>
                  {r.s.score} · {r.s.grade}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.map((r) => (
        <section key={r.bot.path} className="report-bot">
          <h2>
            {r.bot.name} <span className={'tb-grade grade-' + r.s.grade}>{r.s.score} · {r.s.grade}</span>
          </h2>
          <p className="report-bot-path">{r.bot.path}</p>
          {r.findings.length === 0 && <p>{t('report.noFindings')}✅</p>}
          {r.findings.map((f, i) => (
            <div key={i} className={'report-finding sev-' + f.severity}>
              <div className="finding-msg">
                {SEV_ICON[f.severity]} <strong>{t('report.severity.' + f.severity)}</strong>
                {f.line ? ` · ${t('report.finding.line')} ${f.line}` : ''} · <code>{f.ruleId}</code>
                <br />
                {t(`rule.${f.ruleId}.msg`, f.params)}
              </div>
              <div className="finding-fix">
                <strong>{t('report.finding.fix')}:</strong> {t(`rule.${f.ruleId}.fix`, f.params)}
              </div>
            </div>
          ))}
        </section>
      ))}
      <footer className="report-foot">
        {t('report.generatedBy')} · {date}
        <br />
        {t('credit')}
      </footer>
    </div>
  )
}
