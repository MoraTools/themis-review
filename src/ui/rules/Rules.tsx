import { useMemo, useState } from 'react'
import { CALL_DEPTH_EXEMPT_TASKBOTS } from '../../core/graph'
import type { ProjectAnalysis, Severity } from '../../core/model'
import { RULES, type RuleCategory } from '../../core/rulesInfo'
import { DEDUCTION, GRADE_BANDS, RULE_CAP } from '../../core/score'
import { useT } from '../i18n'

const SEV_ICON = { error: '🔴', warn: '🟡', info: '🔵' } as const
const SEV_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

type SortCol = 'id' | 'severity' | 'category' | 'fired' | 'deducted'
type Sort = { col: SortCol; dir: 1 | -1 }

// module scope: defining this inside Rules would remount every <th> on each render
function Th({ col, label, sort, onSort }: { col: SortCol; label: string; sort: Sort; onSort: (c: SortCol) => void }) {
  const active = sort.col === col
  return (
    <th className={'sortable' + (active ? ' sorted' : '')} onClick={() => onSort(col)}>
      {label}
      <span className="sort-arrow">{active ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
    </th>
  )
}

export default function Rules({ analysis }: { analysis: ProjectAnalysis | null }) {
  const t = useT()
  const [sort, setSort] = useState<Sort>({ col: 'severity', dir: 1 })

  /** how much each rule family actually cost on the loaded upload, cap included */
  const stats = useMemo(() => {
    const fired = new Map<string, number>()
    const rawByBotAndGroup = new Map<string, number>()
    if (analysis) {
      for (const f of analysis.findings) {
        fired.set(f.ruleId, (fired.get(f.ruleId) ?? 0) + 1)
        const key = f.botPath + '|' + f.ruleId.replace(/_LOCAL$/, '')
        rawByBotAndGroup.set(key, (rawByBotAndGroup.get(key) ?? 0) + DEDUCTION[f.severity])
      }
    }
    // the cap applies per bot per family, exactly as scoreFindings does it
    const deducted = new Map<string, number>()
    for (const [key, raw] of rawByBotAndGroup) {
      const group = key.split('|')[1]
      deducted.set(group, (deducted.get(group) ?? 0) + Math.min(raw, RULE_CAP))
    }
    return { fired, deducted }
  }, [analysis])

  const rows = useMemo(() => {
    const list = RULES.map((r) => ({
      ...r,
      fired: stats.fired.get(r.id) ?? 0,
      deducted: stats.deducted.get(r.capGroup) ?? 0,
    }))
    const value = (r: (typeof list)[number]): string | number => {
      switch (sort.col) {
        case 'id': return r.id
        case 'severity': return SEV_ORDER[r.severity]
        case 'category': return r.category
        case 'fired': return r.fired
        case 'deducted': return r.deducted
      }
    }
    return [...list].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      const cmp = typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)
      return cmp * sort.dir || a.id.localeCompare(b.id)
    })
  }, [sort, stats])

  const toggleSort = (col: SortCol) => setSort((s) => ({ col, dir: s.col === col && s.dir === 1 ? -1 : 1 }))
  const categories = [...new Set(RULES.map((r) => r.category))] as RuleCategory[]
  /** cap families with more than one rule share a single points total */
  const sharedFamilies = new Set(
    [...new Map(RULES.map((r) => [r.capGroup, RULES.filter((x) => x.capGroup === r.capGroup).length]))]
      .filter(([, n]) => n > 1)
      .map(([g]) => g),
  )

  return (
    <div className="report rules-view">
      <header className="report-head">
        <h1>{t('rules.title')}</h1>
      </header>
      <p className="report-meta">
        {RULES.length} {t('rules.count')}
        {analysis ? ` · ${t('rules.onUpload')}: ${analysis.zipNames.join(', ')}` : ` · ${t('rules.noUpload')}`}
      </p>

      <h2>{t('rules.model')}</h2>
      <div className="rules-model">
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.perFinding')}</span>
          <ul>
            {(['error', 'warn', 'info'] as Severity[]).map((s) => (
              <li key={s}>
                {SEV_ICON[s]} {t('report.severity.' + s)} <strong>−{DEDUCTION[s]}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.cap')}</span>
          <p className="rules-model-value">−{RULE_CAP}</p>
          <p className="rules-model-note">{t('rules.capNote')}</p>
        </div>
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.bands')}</span>
          <ul>
            {GRADE_BANDS.map((b) => (
              <li key={b.grade}>
                <span className={'grade-' + b.grade}>{b.grade}</span> ≥ {b.min}
              </li>
            ))}
          </ul>
        </div>
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.depthExempt')}</span>
          <ul>
            {CALL_DEPTH_EXEMPT_TASKBOTS.map((name) => <li key={name}>{name}</li>)}
          </ul>
          <p className="rules-model-note">{t('rules.depthExemptNote')}</p>
        </div>
      </div>
      <p className="rules-note">{t('rules.note')}</p>

      <h2>{t('rules.table')}</h2>
      <div className="table-scroll">
        <table className="report-table rules-table">
          <thead>
            <tr>
              <Th col="id" label={t('rules.col.id')} sort={sort} onSort={toggleSort} />
              <Th col="severity" label={t('rules.col.severity')} sort={sort} onSort={toggleSort} />
              <Th col="category" label={t('rules.col.category')} sort={sort} onSort={toggleSort} />
              <Th col="fired" label={t('rules.col.fired')} sort={sort} onSort={toggleSort} />
              <Th col="deducted" label={t('rules.col.deducted')} sort={sort} onSort={toggleSort} />
              <th>{t('rules.col.detects')}</th>
              <th>{t('rules.col.fix')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><code>{r.id}</code></td>
                <td>{SEV_ICON[r.severity]} −{DEDUCTION[r.severity]}</td>
                <td>{t('rules.cat.' + r.category)}</td>
                <td>{r.fired || '—'}</td>
                <td title={sharedFamilies.has(r.capGroup) ? t('rules.sharedCap', { group: r.capGroup }) : undefined}>
                  {r.deducted ? '−' + Math.round(r.deducted * 10) / 10 : '—'}
                  {sharedFamilies.has(r.capGroup) && r.deducted ? <span className="rules-shared">∑</span> : null}
                </td>
                <td className="rules-msg">{t(`rule.${r.id}.msg`, placeholders)}</td>
                <td className="rules-msg">{t(`rule.${r.id}.fix`, placeholders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="rules-note">
        {t('rules.categories')}: {categories.map((c) => t('rules.cat.' + c)).join(' · ')}
        {sharedFamilies.size > 0 && (
          <>
            <br />∑ {t('rules.sharedCapNote')}
          </>
        )}
      </p>
    </div>
  )
}

/** rule texts are templates; fill the slots with readable stand-ins for the reference table */
const placeholders: Record<string, string> = {
  name: 'nombreVariable',
  suggestion: 'pStrEjemplo',
  scope: 'p',
  expected: 'i',
  token: 'Str',
  line: 'N',
  command: 'acción',
  path: 'C:\\ruta\\fija',
  depth: '3',
  lines: '300',
  max: '250',
  pct: '5.0',
  comments: '10',
  boxes: '3',
  logs: '1',
  target: 'utilidad_x',
  callee: 'taskbot_llamado',
  var: 'iStrDato',
}
