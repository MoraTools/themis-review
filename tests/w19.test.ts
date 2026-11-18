import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import Report from '../src/ui/report/Report'
import { SeverityIcon } from '../src/ui/Icons'
import { PointsLost } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON } from '../src/ui/findings/SeverityFilter'
import { LangContext, type Lang } from '../src/ui/i18n'

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

describe('severity icons', () => {
  it('draws error as an octagon and info as a circle, so they differ by shape', () => {
    const error = renderToStaticMarkup(createElement(SeverityIcon, { severity: 'error' }))
    const info = renderToStaticMarkup(createElement(SeverityIcon, { severity: 'info' }))
    expect(error).not.toContain('<circle')
    expect(error).toContain('H8.688')
    expect(info).toContain('<circle')
    // same size and ink as the other icons
    for (const svg of [error, info]) expect(svg).toMatch(/class="icon severity-icon sev-\w+" viewBox="0 0 24 24" fill="none" stroke="currentColor"/)
  })
})

describe('Points lost', () => {
  it('gives both summaries the target height outside any media query', () => {
    expect(css).toMatch(/\n\.drawer-lost-summary, \.report-lost-summary, \.report-facts-summary \{[^}]*box-sizing: border-box; min-height: var\(--target-min\);/)
  })

  it('draws a neutral bar per row, relative to the largest row, hidden from screen readers', () => {
    const lost = [
      { group: 'VAR_NO_DESCRIPTION', points: 10, capped: false, rules: ['VAR_NO_DESCRIPTION'] },
      { group: 'TOO_LONG', points: 2.5, capped: false, rules: ['TOO_LONG'] },
    ]
    const html = wrap('en', createElement(PointsLost, { lost }))
    expect(html.match(/<span class="report-lost-bar" aria-hidden="true" style="width:(\d+(?:\.\d+)?)%"><\/span>/g)).toHaveLength(2)
    expect(html).toContain('style="width:100%"')
    expect(html).toContain('style="width:25%"')
    // the total row has no bar
    expect(html.split('report-lost-total')[1]).not.toContain('report-lost-bar')
    expect(css).toMatch(/\n\.report-lost-bar \{[^}]*height: 3px; margin: 1px 0 0 auto;[^}]*background: var\(--border-strong\);/)
    expect(printBlock).not.toContain('report-lost-bar')
  })
})

describe('print grade chips', () => {
  it('give the chip one tabular width, so the chips align across rows', () => {
    expect(printBlock).toMatch(/\.grade-chip \{ min-width:calc\(5ch \+ 0\.35em \+ 14px\); text-align:center; \}/)
    expect(css).toMatch(/\n\.grade-chip \{[^}]*font-variant-numeric: tabular-nums;/)
  })
})

describe('scoring lines on phones', () => {
  const original = globalThis.matchMedia
  afterEach(() => { globalThis.matchMedia = original })

  it('puts the scoring lines in a details element, open on desktop and closed at 760 px and under', () => {
    const desktop = report('en')
    expect(desktop).toMatch(/<details class="report-facts-more" open=""><summary class="report-facts-summary">.*?How the score works<\/summary><p class="report-facts-rule">/)
    globalThis.matchMedia = ((q: string) => ({ matches: q === '(max-width: 760px)' })) as unknown as typeof matchMedia
    expect(report('es')).toMatch(/<details class="report-facts-more"><summary class="report-facts-summary">.*?Cómo se calcula el puntaje<\/summary>/)
    // the scope line stays outside, above the toggle
    expect(desktop.indexOf('report-facts-scope')).toBeLessThan(desktop.indexOf('report-facts-more'))
  })

  it('hides the toggle while open on a wide screen, and always shows the lines in print', () => {
    expect(css).toContain('@media screen and (min-width: 761px) { .report-facts-more[open] > .report-facts-summary { display: none; } }')
    expect(printBlock).toContain('.report-facts-more::details-content { content-visibility:visible; display:block; }')
    expect(printBlock).toContain('.report-facts-summary { display:none; }')
    const source = readFileSync(new URL('../src/ui/report/Report.tsx', import.meta.url), 'utf8')
    expect(source).toContain("'details:is(.report-lost-box, .report-facts-more):not([open])'")
  })

  it('hides the Findings header cell visually on phones and keeps it for screen readers', () => {
    expect(css).toMatch(/\.summary-table thead \.col-findings \{ position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip-path:inset\(50%\); white-space:nowrap; \}/)
    // its sort button stays visible while it has keyboard focus
    expect(css).toMatch(/\.summary-table thead \.col-findings:focus-within \{ position:static;[^}]*clip-path:none; grid-area:1\/2; \}/)
    expect(report('en')).toMatch(/<th[^>]*class="[^"]*col-findings[^"]*"/)
  })
})

describe('style tokens and recipes', () => {
  it('uses the hover state tokens in the hover rules of buttons, chips and the grade strip', () => {
    expect(css).toContain('.btn:hover, .icon-btn:hover { background:var(--hover-bg); }')
    expect(css).toContain('.sev-toggle:hover { background:var(--hover-bg); color:var(--text); }')
    expect(css).toContain('.grade-strip button:hover { border-color: var(--hover-border); background: var(--hover-bg); }')
    expect(css).not.toMatch(/:hover[^{]*\{[^}]*background: ?var\(--surface-raised\)/)
  })

  it('keeps gold off the cap value, the rules table code and the static zip tab', () => {
    expect(css).toMatch(/\.rules-model-value \{[^}]*color: var\(--text\);/)
    expect(css).toContain('.rules-table code { color: var(--text); }')
    expect(css).toMatch(/\.dropzone-tab \{[^}]*border-bottom: 2px solid var\(--text\);\s*color: var\(--text\);/)
    expect(css).not.toMatch(/tr:hover code/)
  })

  it('has no dead .chip rules and one minimap mask value', () => {
    expect(css).not.toMatch(/\.chip\b/)
    expect(css).toContain('.react-flow__minimap-mask { fill: var(--minimap-mask); }')
    expect(css.match(/minimap-mask:color-mix/g)).toHaveLength(1)
  })

  it('sets the report footer with the shared caps-label recipe', () => {
    const caps = css.match(/\n([^\n{]*) \{ font: 600 var\(--fs-11\)\/var\(--lh-label\) var\(--font-mono\);/)![1]
    expect(caps).toContain('.report-foot')
    expect(css.match(/\n\.report-foot \{([^}]*)\}/)![1]).not.toMatch(/font|letter-spacing|text-transform/)
  })
})
