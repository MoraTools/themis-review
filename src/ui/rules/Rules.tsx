import { SeverityIcon } from '../Icons'
import { Fragment, useContext, useMemo, useState } from 'react'
import { CALL_DEPTH_UTILITY_PREFIX } from '../../core/graph'
import type { ProjectAnalysis, Severity } from '../../core/model'
import { RULES, type RuleCategory } from '../../core/rulesInfo'
import { DEDUCTION, RULE_CAP } from '../../core/score'
import { LangContext, useT, useNumber, usePlural, type Lang } from '../i18n'
import { SortHeader, nextSort, type Sort } from '../shared/SortHeader'
import { gradeBands, groupLabel } from '../findings/findings'

const SEV_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

type SortCol = 'id' | 'severity' | 'category' | 'fired' | 'deducted'

export default function Rules({ analysis }: { analysis: ProjectAnalysis | null }) {
  const t = useT()
  const number = useNumber()
  const plural = usePlural()
  const { lang } = useContext(LangContext)
  const [sort, setSort] = useState<Sort<SortCol>>({ col: 'severity', dir: 1 })

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
        // the Rule column shows the title first, so it sorts by title
        case 'id': return t(`rule.${r.id}.title`)
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
  }, [sort, stats, t])

  const toggleSort = (col: SortCol) => setSort((s) => nextSort(s, col))
  // each rule's example values; a rule with its own values overrides the shared ones
  const ruleSlots = (id: string) => ({ ...placeholders[lang], ...EXAMPLES[lang][id] })
  const categories = [...new Set(RULES.map((r) => r.category))] as RuleCategory[]
  /** cap families with more than one rule share a single points total */
  const sharedFamilies = new Set(
    [...new Map(RULES.map((r) => [r.capGroup, RULES.filter((x) => x.capGroup === r.capGroup).length]))]
      .filter(([, n]) => n > 1)
      .map(([g]) => g),
  )

  return (
    <div className="report rules-view">
      <div className="report-head">
        <h1>{t('rules.title')}</h1>
      </div>
      <p className="report-meta">
        {plural('rules.count', RULES.length)}
        {analysis ? ` · ${t('rules.onUpload')}: ${analysis.zipNames.join(', ')}` : ` · ${t('rules.noUpload')}`}
      </p>

      <h2>{t('rules.model')}</h2>
      <div className="rules-model">
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.perFinding')}</span>
          <ul>
            {(['error', 'warn', 'info'] as Severity[]).map((s) => (
              <li key={s}>
                <SeverityIcon severity={s} /> {t('report.severity.' + s)} <strong>−{number(DEDUCTION[s])}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.cap')}</span>
          <p className="rules-model-value">−{number(RULE_CAP)}</p>
          <p className="rules-model-note">{t('rules.capNote')}</p>
        </div>
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.bands')}</span>
          <ul>
            {gradeBands(lang).map((b) => (
              <li key={b.grade}>
                <span className={'grade-' + b.grade}>{b.grade}</span> {b.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="rules-model-block">
          <span className="rules-model-label">{t('rules.depthExempt')}</span>
          <ul>
            <li>{t('rules.depthExemptItem', { prefix: CALL_DEPTH_UTILITY_PREFIX })}</li>
          </ul>
          <p className="rules-model-note">{t('rules.depthExemptNote', { rule: t('rule.CALL_DEPTH.title') })}</p>
        </div>
      </div>
      <p className="rules-note">{t('rules.note')}</p>

      <h2>{t('rules.table')}</h2>
      {/* one note for the Times and Points columns, so the headers stay short; before the sort label, so on phones
          'Sort by' stays next to its buttons */}
      <p className="rules-caption" id="rules-scope">{t('rules.scope')}</p>
      {/* shown on phones, where the header row becomes a row of sort chips */}
      <p className="rules-sort-by">{t('rules.sortBy')}</p>
      <div className="table-scroll">
        <table className="report-table rules-table" role="table" aria-describedby="rules-scope">
          <caption className="sr-only">{t('rules.table')}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <SortHeader col="id" label={t('rules.col.id')} sort={sort} onSort={toggleSort} />
              <SortHeader col="severity" label={t('rules.col.severity')} sort={sort} onSort={toggleSort} />
              <SortHeader col="category" label={t('rules.col.category')} sort={sort} onSort={toggleSort} />
              <SortHeader col="fired" label={t('rules.col.fired')} sort={sort} onSort={toggleSort} />
              <SortHeader col="deducted" label={t('rules.col.deducted')} sort={sort} onSort={toggleSort} />
              <th role="columnheader">{t('rules.col.detects')}</th>
              <th role="columnheader">{t('rules.col.fix')}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((r) => (
              <tr role="row" key={r.id} id={'rule-' + r.id} tabIndex={-1}>
                <td role="cell" className="rules-name">
                  <span className="rules-title">{t(`rule.${r.id}.title`)}</span> <code className="rules-id"><Breaks text={r.id} /></code>
                </td>
                <td role="cell" className="rules-sev"><SeverityIcon severity={r.severity} /> {t('report.severity.' + r.severity)} <span className="fig">−{number(DEDUCTION[r.severity])}</span></td>
                <td role="cell" className="rules-text">{t('rules.cat.' + r.category)}</td>
                <td role="cell" className="rules-times" data-label={t('rules.col.fired')}>{r.fired ? number(r.fired) : '—'}</td>
                <td role="cell" className="rules-points" data-label={t('rules.col.deducted')}
                  title={sharedFamilies.has(r.capGroup) ? t('rules.sharedCap', { group: `${groupLabel(lang, r.capGroup)} (${r.capGroup})` }) : undefined}>
                  {r.deducted ? '−' + number(Math.round(r.deducted * 10) / 10) : '—'}
                  {sharedFamilies.has(r.capGroup) && r.deducted ? <span className="rules-shared">∑</span> : null}
                </td>
                <td role="cell" className="rules-msg" data-label={t('rules.col.detects')}><Breaks text={t(`rule.${r.id}.msg`, ruleSlots(r.id))} /></td>
                <td role="cell" className="rules-msg" data-label={t('rules.col.fix')}>
                  <Breaks text={t(`rule.${r.id}.fix`, ruleSlots(r.id))} />
                  {/* findings show only the rename, so the naming key lives here */}
                  {r.id === 'VAR_NAME_FORMAT' && <span className="rules-key">{t('report.nameKey')}</span>}
                </td>
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

/** a text that breaks only after '_' and '/' (and the '\\' of a Windows path), never inside a word */
export function Breaks({ text }: { text: string }) {
  return text.split(/(?<=[_/\\])/).map((part, i) => <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>)
}

/** example values for a rule whose slots differ from the shared ones, per language: depth 4 is CALL_DEPTH (level 4
 *  or deeper), DEEP_NESTING fires at 6; the mismatch rules get a name, expected value and rename that fit them
 *  (expected is a type token for the type rule, a scope prefix for the scope rule, as src/core/rules/naming.ts) */
export const EXAMPLES: Record<Lang, Record<string, Record<string, string>>> = {
  en: {
    DEEP_NESTING: { depth: '6' },
    VAR_TYPE_MISMATCH: { name: 'pStrExample', token: 'Str', expected: 'Num', suggestion: 'pNumExample' },
    VAR_SCOPE_MISMATCH: { name: 'pStrExample', scope: 'p', expected: 'i', suggestion: 'iStrExample' },
  },
  es: {
    DEEP_NESTING: { depth: '6' },
    VAR_TYPE_MISMATCH: { name: 'pStrEjemplo', token: 'Str', expected: 'Num', suggestion: 'pNumEjemplo' },
    VAR_SCOPE_MISMATCH: { name: 'pStrEjemplo', scope: 'p', expected: 'i', suggestion: 'iStrEjemplo' },
  },
}

/** rule texts are templates; fill the slots with readable stand-ins for the reference table, in the page language */
const placeholders: Record<Lang, Record<string, string>> = {
  en: {
    name: 'variableName',
    suggestion: 'pStrExample',
    scope: 'p',
    expected: 'i',
    token: 'Str',
    line: 'N',
    command: 'messageBox',
    path: 'C:\\fixed\\path',
    depth: '4',
    lines: '300',
    max: '250',
    pct: '5.0',
    comments: '10',
    boxes: '3',
    logs: '1',
    target: 'utility_x',
    callee: 'called_taskbot',
    var: 'iStrData',
  },
  es: {
    name: 'nombreVariable',
    suggestion: 'pStrEjemplo',
    scope: 'p',
    expected: 'i',
    token: 'Str',
    line: 'N',
    command: 'acción',
    path: 'C:\\ruta\\fija',
    depth: '4',
    lines: '300',
    max: '250',
    pct: '5.0',
    comments: '10',
    boxes: '3',
    logs: '1',
    target: 'utilidad_x',
    callee: 'taskbot_llamado',
    var: 'iStrDato',
  },
}
