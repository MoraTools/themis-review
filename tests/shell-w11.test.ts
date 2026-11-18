import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScoreBadge, ViewTabs } from '../src/ui/App'
import { SeverityFilter } from '../src/ui/findings/SeverityFilter'
import { LangContext, type Lang } from '../src/ui/i18n'

const render = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))

const tabs = (view: 'map' | 'report' | 'rules', hasAnalysis: boolean) =>
  render('en', createElement(ViewTabs, { view, hasAnalysis, uploadHref: '/themis/', onUpload: () => {} }))

describe('view tabs', () => {
  it('are links to the view hashes with an analysis, the active one aria-current=page', () => {
    const html = tabs('report', true)
    expect(html).not.toContain('<button')
    expect(html).toContain('<a class="tab" href="#map">Map</a>')
    expect(html).toContain('<a class="tab active" href="#report" aria-current="page">Report</a>')
    expect(html).toContain('<a class="tab" href="#rules">Rules</a>')
  })

  it('without an analysis: the upload tab links to the clean address, Rules to #rules, no Report', () => {
    const html = tabs('rules', false)
    expect(html).toContain('<a class="tab" href="/themis/">Upload zip</a>')
    expect(html).toContain('<a class="tab active" href="#rules" aria-current="page">Rules</a>')
    expect(html).not.toContain('#report')
    expect(tabs('map', false)).toContain('<a class="tab active" href="/themis/" aria-current="page">Upload zip</a>')
  })
})

describe('score badge', () => {
  it('is a link to the report with a name that says so, in both languages', () => {
    const score = { score: 64.2, grade: 'C' } as const
    const en = render('en', createElement(ScoreBadge, { score: score as never }))
    expect(en).toMatch(/^<a class="score-badge" href="#report" aria-label="Project score C 64.2, open the report">/)
    const es = render('es', createElement(ScoreBadge, { score: score as never }))
    expect(es).toContain('aria-label="Puntaje del proyecto C 64,2, abrir el reporte"')
  })
})

describe('severity filter', () => {
  it('is a fieldset named by its legend', () => {
    const html = render('en', createElement(SeverityFilter, {
      label: 'Include in the report:',
      counts: { error: 1, warn: 2, info: 3 },
      on: { error: true, warn: true, info: false },
      onToggle: () => {},
    }))
    expect(html).toMatch(/^<fieldset class="sev-filter"><legend class="report-options-label">Include in the report:<\/legend>/)
    expect(html.match(/type="checkbox"/g)).toHaveLength(3)
  })
})

describe('sort header', () => {
  it('keeps an explicit columnheader role for the grid layouts', async () => {
    const { SortHeader } = await import('../src/ui/shared/SortHeader')
    const html = renderToStaticMarkup(createElement(SortHeader, { col: 'a', label: 'A', sort: { col: 'a', dir: 1 }, onSort: () => {} }))
    expect(html).toContain('role="columnheader"')
  })
})
