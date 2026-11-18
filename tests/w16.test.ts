import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import type { Finding } from '../src/core/model'
import Report from '../src/ui/report/Report'
import Rules from '../src/ui/rules/Rules'
import { PointsLost } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON } from '../src/ui/findings/SeverityFilter'
import { fixFirst, lostLabel, lostPoints, projectLines } from '../src/ui/findings/findings'
import { LangContext, translate, type Lang } from '../src/ui/i18n'

const DEMO = new URL('./fixtures/', import.meta.url)
const zip = (name: string) => ({ name, data: new Uint8Array(readFileSync(new URL(name, DEMO))) })
const analysis = analyzeZips([zip('Demo-Facturas.zip'), zip('Demo-Segundo.zip')])
const old = analysis.taskbots.find((b) => b.name === 'Proceso_Antiguo')!

globalThis.document ??= { documentElement: { dataset: {} } } as unknown as Document

const wrap = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))
const report = (lang: Lang, a = analysis) =>
  wrap(lang, createElement(Report, { analysis: a, onOpen: () => {}, sevOn: DEFAULT_SEVERITY_ON, onToggleSeverity: () => {}, onRule: () => {} }))
const text = (html: string) => html.replace(/<[^>]+>/g, '')
const f = (ruleId: string, severity: Finding['severity']): Finding => ({ ruleId, severity, botPath: 'p', line: 1, params: {} })

describe('Points lost row names', () => {
  it('uses the rule title when one rule of the family has findings, the family name when two or more share it', () => {
    const one = lostPoints([f('VAR_NO_DESCRIPTION', 'warn')])
    expect(lostLabel('en', one[0])).toBe(translate('en', 'rule.VAR_NO_DESCRIPTION.title'))
    const local = lostPoints([f('VAR_NO_DESCRIPTION_LOCAL', 'info')])
    expect(lostLabel('es', local[0])).toBe(translate('es', 'rule.VAR_NO_DESCRIPTION_LOCAL.title'))
    const two = lostPoints([f('VAR_NO_DESCRIPTION', 'warn'), f('VAR_NO_DESCRIPTION_LOCAL', 'info')])
    expect(lostLabel('en', two[0])).toBe(translate('en', 'rule.VAR_NO_DESCRIPTION.family'))
    const html = wrap('en', createElement(PointsLost, { lost: one }))
    expect(html).toContain(`<span class="report-lost-title">${translate('en', 'rule.VAR_NO_DESCRIPTION.title')}</span>`)
  })
})

describe('hidden findings phrasing', () => {
  it('says "{list}, not shown" in the summary cell and in Points lost, in both languages', () => {
    const master = (lang: Lang) => report(lang).split('<tr role="row"').find((r) => r.includes('000_MasterFacturas'))!
    expect(text(master('en'))).toContain('1 Info, not shown')
    expect(text(master('es'))).toContain('1 Info, no se muestra')
    expect(report('en')).not.toMatch(/Info hidden|Info oculto/)
  })
})

describe('report facts', () => {
  it('shows no Included sentence for a clean project', () => {
    expect(report('en')).toContain('Included: Error, Warning.')
    expect(report('en', { ...analysis, findings: [] })).not.toContain('Included:')
    expect(report('es', { ...analysis, findings: [] })).not.toContain('Incluido:')
  })
})

describe('fix first labels and ties', () => {
  it('names both values and returns the cut ties in rank order', () => {
    const { items, more, ties } = fixFirst(analysis)
    expect(ties).toHaveLength(more)
    expect(ties.every((i) => i.project === items.at(-1)!.project)).toBe(true)
    expect(translate('en', 'report.fixFirst.bot', { points: '15' })).toBe('−15 taskbot')
    expect(translate('es', 'report.fixFirst.bot', { points: '15' })).toBe('−15 taskbot')
    expect(text(report('es'))).toContain('−15 taskbot (tope) · −10,4 proyecto')
  })
})

describe('line weight in the summary', () => {
  it('shows each taskbot share of the project lines beside its lines, localized', () => {
    const total = projectLines(analysis)
    expect(total).toBe(analysis.taskbots.reduce((n, b) => n + analysis.metrics[b.path].totalLines, 0))
    const row = (lang: Lang) => report(lang).split('<tr role="row"').find((r) => r.includes('data-bot="' + old.path + '"'))!
    const pct = Math.round((analysis.metrics[old.path].totalLines / total) * 100)
    expect(row('en')).toContain(`${analysis.metrics[old.path].totalLines}<span class="lines-share"> · ${pct}%</span>`)
    // es-419 writes the percent with a space before the sign
    expect(text(row('es'))).toMatch(new RegExp(`${analysis.metrics[old.path].totalLines} · ${pct}\\s%`))
  })
})

describe('copy', () => {
  it('names CALL_DEPTH by its title in the rules text, and uses infinitive and entrada in Spanish', () => {
    expect(text(wrap('en', createElement(Rules, { analysis: null })))).toContain(`every taskbot counts as “${translate('en', 'rule.CALL_DEPTH.title')}”.`)
    expect(text(wrap('es', createElement(Rules, { analysis: null })))).toContain(`todos cuentan como “${translate('es', 'rule.CALL_DEPTH.title')}”.`)
    expect(translate('en', 'rules.depthExemptNote', { rule: 'x' })).not.toContain('CALL_DEPTH')
    expect(translate('es', 'rule.TOO_LONG.fix')).toMatch(/^Dividirlo en /)
    expect(translate('es', 'rule.CALL_INPUT_UNKNOWN.fix')).toContain('como entrada en el taskbot')
  })
})
