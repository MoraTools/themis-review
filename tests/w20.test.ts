import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import type { Finding } from '../src/core/model'
import { firstViewAnchor, MapFixFirst, worstTaskbot } from '../src/ui/canvas/Canvas'
import { FixItemText, PointsLost } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON } from '../src/ui/findings/SeverityFilter'
import { fixFirst } from '../src/ui/findings/findings'
import Report from '../src/ui/report/Report'
import { LangContext, translate, type Lang } from '../src/ui/i18n'

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')
const printBlock = css.slice(css.indexOf('@media print {'))
const DEMO = new URL('./fixtures/', import.meta.url)
const zip = (name: string) => ({ name, data: new Uint8Array(readFileSync(new URL(name, DEMO))) })
const analysis = analyzeZips([zip('Demo-Facturas.zip'), zip('Demo-Segundo.zip')])

globalThis.document ??= { documentElement: { dataset: {} } } as unknown as Document

const wrap = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))
const report = (lang: Lang) =>
  wrap(lang, createElement(Report, { analysis, onOpen: () => {}, sevOn: DEFAULT_SEVERITY_ON, onToggleSeverity: () => {}, onRule: () => {} }))
const text = (html: string) => html.replace(/<[^>]+>/g, '')
/** the body of the narrow-pane map block */
const narrowMap = css.slice(css.indexOf('@media screen and (max-width: 760px) {\n  .map-head'), css.indexOf('.leg-wire'))

describe('W20 1: phone map head', () => {
  it('puts the strip on its own row and Fix first on a full-width row under it, its summary up to 2 lines', () => {
    expect(narrowMap).toContain('.grade-strip { flex-basis: 100%;')
    expect(narrowMap).toContain('.map-fix { flex: 1 1 100%; }')
    expect(narrowMap).toMatch(/\.map-fix-text \{[^}]*-webkit-line-clamp: 2;[^}]*white-space: normal;/)
    // the legend keeps its room at the right, the targets stay 44 px
    expect(narrowMap).toContain('max-width: calc(100% - 120px)')
    expect(css).toMatch(/\n\.map-fix summary \{[^}]*min-height: var\(--control-h\);/)
    // desktop keeps the one-line summary
    expect(css).toContain('\n.map-fix-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }')
  })

  it('names the taskbot, then the rule title, in the summary', () => {
    const html = wrap('en', createElement(MapFixFirst, { analysis, onOpen: () => {} }))
    expect(text(html.slice(0, html.indexOf('</summary>')))).toBe('Fix first: Proceso_Antiguo\u00a0·\u00a0Message Box that does not close')
  })
})

describe('W20 2: Points lost bar tracks', () => {
  it('draws a fixed track with a faint ground and a strong fill, thinner in print', () => {
    expect(css).toMatch(/\n\.report-lost-track \{[^}]*width: 64px; height: 4px;[^}]*background: var\(--border\);/)
    expect(css).toMatch(/\n\.report-lost-bar \{[^}]*background: var\(--border-strong\);/)
    expect(printBlock).toContain('.report-lost-track { width:48px; height:2px; }')
  })

  it('renders title | track | points per row and no track in the total', () => {
    const lost = [
      { group: 'TOO_LONG', points: 4, capped: false, rules: ['TOO_LONG'] },
      { group: 'NO_LOGS', points: 2, capped: false, rules: ['NO_LOGS'] },
    ]
    const html = wrap('en', createElement(PointsLost, { lost }))
    const rows = html.split('<li').slice(1, 3)
    for (const row of rows) expect(row.indexOf('report-lost-title')).toBeLessThan(row.indexOf('report-lost-track'))
    for (const row of rows) expect(row.indexOf('report-lost-track')).toBeLessThan(row.indexOf('report-lost-points'))
    expect(html).toContain('style="width:50%"')
    expect(html.split('report-lost-total')[1]).not.toContain('report-lost-track')
  })
})

describe('W20 3: Fix first separators', () => {
  const item = fixFirst(analysis).items[0]
  for (const lang of ['en', 'es'] as const) {
    it(`keeps the values and their leading separator in one group, glued to the text before it (${lang})`, () => {
      const html = wrap(lang, createElement(FixItemText, { name: 'Bot', item }))
      const points = html.slice(html.indexOf('<span class="report-lost-points">'))
      // the leading separator is inside the value group, with no-break spaces, so no line starts or ends on it
      expect(points).toMatch(/^<span class="report-lost-points"><span class="report-fix-sep"> · <\/span><span class="report-fix-value">/)
      expect(html).toContain('<span class="report-fix-bot">Bot</span><span class="report-fix-sep"> · </span>')
      expect(points).toContain('<span class="report-fix-vsep"> · </span>')
    })
  }

  it('keeps the group on one line on desktop; at 760 px and under hides the separators and stacks the values', () => {
    expect(css).toContain('.report-fix-item .report-lost-points { white-space: nowrap; }')
    const narrow = css.slice(css.indexOf('@media screen and (max-width:760px) {\n  .report-fix-list'))
    expect(narrow).toMatch(/^[^}]*\{[^}]*\}[\s\S]*?\.report-fix-item \.report-lost-points \{ display:grid; justify-items:end; justify-self:end; text-align:right; \}/)
    expect(narrow.slice(0, narrow.indexOf('\n}'))).toContain('.report-fix-sep, .report-fix-vsep { display:none; }')
  })
})

describe('W20 4: hidden notes in Points lost', () => {
  it('puts the note on the row line after the title, also when the family has shown findings', () => {
    const html = report('en')
    const old = analysis.taskbots.findIndex((b) => b.name === 'Proceso_Antiguo')
    const section = html.slice(html.indexOf(`id="bot-${old}"`))
    const lost = section.slice(section.indexOf('class="report-lost-list'), section.indexOf('report-lost-total'))
    const family = translate('en', 'rule.VAR_NO_DESCRIPTION.family')
    // one Warning shown, one Info hidden: the row links to its card and says what it hides
    expect(lost).toMatch(new RegExp(`<button type="button" class="report-lost-link no-print"><span class="report-lost-title">${family}</span><span class="report-lost-hidden">1 Info, not shown</span><span class="report-lost-track"`))
  })

  it('keeps the show button for a family whose findings are all hidden, inside its row', () => {
    const lost = [{ group: 'UNUSED_VAR', points: 4, capped: false, rules: ['UNUSED_VAR'] }]
    const html = wrap('en', createElement(PointsLost, { lost, hiddenOf: () => '8 Info, not shown', onShowHidden: () => {} }))
    expect(html).toMatch(/<span class="report-lost-row"><span class="report-lost-title">[^<]*<\/span><button type="button" class="report-lost-hidden report-lost-show no-print"/)
    expect(css).toContain('.report-lost-list .report-lost-hidden { flex: none; white-space: nowrap; }')
  })
})

describe('W20 5: PDF fix line for hidden Fix first items', () => {
  it('prints the fix of an item whose cards the filter hides, and only for those', () => {
    const tie = fixFirst(analysis).ties[0]
    expect(tie.group).toBe('UNUSED_VAR')
    for (const lang of ['en', 'es'] as const) {
      const html = report(lang)
      const ties = html.slice(html.indexOf('id="report-fix-ties"'), html.indexOf('</section>'))
      expect(ties).toContain(`<p class="report-fix-hint print-only">${translate(lang, 'report.finding.fix')}: ${translate(lang, 'rule.UNUSED_VAR.groupFix') !== 'rule.UNUSED_VAR.groupFix' ? translate(lang, 'rule.UNUSED_VAR.groupFix') : translate(lang, 'rule.UNUSED_VAR.fix')}</p>`)
      // the shown items have their card: no extra line
      const top = html.slice(html.indexOf('class="report-fix-list"'), html.indexOf('id="report-fix-ties"'))
      expect(top).not.toContain('report-fix-hint')
    }
    expect(css).toContain('.print-only { display: none; }')
  })
})

describe('W20 6: large map first view', () => {
  it('anchors on the taskbot of the first Fix first item, else the worst taskbot', () => {
    expect(firstViewAnchor(analysis)).toBe(fixFirst(analysis).items[0].botPath)
    // the worst taskbot is short, the other one carries the project: Fix first leads with the other one
    const taskbots = [{ path: 'p/0', name: 'Short' }, { path: 'p/1', name: 'Long' }]
    const findings: Finding[] = taskbots.flatMap((b) =>
      Array.from({ length: 4 }, (_, k) => ({ ruleId: 'MSGBOX_BLOCKING', severity: 'error' as const, botPath: b.path, line: k + 1, params: {} })))
    const a = {
      taskbots,
      findings,
      metrics: { 'p/0': { totalLines: 10 }, 'p/1': { totalLines: 1000 } },
      scores: { 'p/0': { score: 10, grade: 'F' }, 'p/1': { score: 50, grade: 'D' } },
    } as unknown as Parameters<typeof fixFirst>[0]
    expect(worstTaskbot(a.scores)).toBe('p/0')
    expect(firstViewAnchor(a)).toBe('p/1')
    expect(firstViewAnchor({ ...a, findings: [] })).toBe('p/0')
  })
})

describe('W20 8: closed editor dialog', () => {
  it('makes only an open dialog a flex box', () => {
    expect(css).toContain('\n.drawer[open] { display: flex; }')
    expect(css.match(/\n\.drawer \{([^}]*)\}/)![1]).not.toContain('display')
  })
})

describe('W20 9: Fix first copy', () => {
  it('shows the gains with a plus sign and says a capped item needs all its findings fixed', () => {
    expect(translate('en', 'report.fixFirst.project', { points: '10.4' })).toBe('+10.4 project')
    expect(translate('es', 'report.fixFirst.project', { points: '10,4' })).toBe('+10,4 proyecto')
    expect(translate('en', 'report.fixFirst.all', { n: '5' })).toBe('fix all 5')
    expect(translate('es', 'report.fixFirst.all', { n: '5' })).toBe('corrige los 5')
    const item = fixFirst(analysis).items[0]
    expect(item.capped && item.count).toBe(5)
    expect(text(wrap('en', createElement(FixItemText, { name: 'Bot', item })))).toBe('Bot · Message Box that does not close · +15 taskbot (fix all 5) · +10.4 project')
    // Points lost keeps its minus sign and '(cap)'
    const lost = wrap('en', createElement(PointsLost, { lost: [item] }))
    expect(text(lost)).toContain('−15 (cap)')
    expect(lost).not.toContain('fix all')
  })
})

describe('narrow header', () => {
  it('moves PDF and New to a third row below the measured fit width, per language', () => {
    const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')
    const rule = '{ grid-column:1/-1; grid-row:3; justify-self:end; padding-bottom:8px; }'
    expect(css).toContain(`@media screen and (max-width:376px) { .header .header-tools ${rule} }`)
    expect(css).toContain(`@media screen and (max-width:402px) { html:lang(es) .header .header-tools ${rule} }`)
  })
})
