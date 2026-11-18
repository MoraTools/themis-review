import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import { localDate } from '../src/ui/App'
import EditorDrawer from '../src/ui/editor/EditorDrawer'
import Report from '../src/ui/report/Report'
import Rules from '../src/ui/rules/Rules'
import { FindingCard, FindingGroupCard } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON, SeverityFilter } from '../src/ui/findings/SeverityFilter'
import { LangContext, type Lang } from '../src/ui/i18n'

const DEMO = new URL('./fixtures/', import.meta.url)
const zip = (name: string) => ({ name, data: new Uint8Array(readFileSync(new URL(name, DEMO))) })
const analysis = analyzeZips([zip('Demo-Facturas.zip'), zip('Demo-Segundo.zip')])
const old = analysis.taskbots.find((b) => b.name === 'Proceso_Antiguo')!

// ThemeToggles reads the theme from <html>; server rendering has no document
globalThis.document ??= { documentElement: { dataset: {} } } as unknown as Document

const wrap = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))
const report = (lang: Lang, a = analysis) =>
  wrap(lang, createElement(Report, { analysis: a, onOpen: () => {}, sevOn: DEFAULT_SEVERITY_ON, onToggleSeverity: () => {}, onRule: () => {} }))
const editor = (lang: Lang) =>
  wrap(lang, createElement(EditorDrawer, { analysis, botPath: old.path, onClose: () => {}, onShowOnMap: () => {}, onRule: () => {} }))
const text = (html: string) => html.replace(/<[^>]+>/g, '')
const finding = analysis.findings.find((f) => f.botPath === old.path)!

describe('label in name', () => {
  it('starts each line button name with its visible text, in both languages', () => {
    const single = wrap('en', createElement(FindingCard, { finding, line: 62, onLine: () => {}, lineAction: 'open in the editor' }))
    expect(single).toContain('aria-label="Line 62, open in the editor"')
    const group = wrap('es', createElement(FindingGroupCard, {
      findings: [{ ...finding, line: 62 }, { ...finding, line: 70 }],
      lineOf: (f) => f.line,
      onLine: () => {},
      lineAction: 'abrir en el editor',
    }))
    expect(group).toContain('aria-label="L62, abrir en el editor"')
    expect(report('en')).toMatch(/aria-label="L\d+, open in the editor"/)
    expect(report('es')).toMatch(/aria-label="Línea \d+, abrir en el editor"|aria-label="L\d+, abrir en el editor"/)
  })

  it('names the report taskbot buttons by their text, with one describedby hint', () => {
    for (const [lang, hint] of [['en', 'Opens in the editor'], ['es', 'Abre en el editor']] as const) {
      const html = report(lang)
      expect(html).toContain(`<span id="report-open-hint" hidden="">${hint}</span>`)
      expect(html).toMatch(/<button type="button" class="row-name report-bot-open no-print" aria-describedby="report-open-hint">/)
      expect(html).not.toMatch(/class="row-name[^"]*"[^>]*aria-label=/)
      // the print copy of the name in the h2 is the heading text of the tagged PDF (display:none on screen)
      expect(html).toMatch(/<span class="print-only"><span class="report-bot-name">/)
      expect(html).not.toMatch(/<span class="print-only" aria-hidden="true"><span class="report-bot-name">/)
    }
  })
})

describe('semantics', () => {
  it('makes the card title a heading that names the card: h3 in the report, h2 in the editor', () => {
    const html = report('en')
    const id = html.match(/<article id="([^"]+)"[^>]*aria-labelledby="\1-title"/)![1]
    expect(html).toContain(`<h3 class="finding-title" id="${id}-title">`)
    const ed = editor('en')
    expect(ed).toMatch(/<article id="editor-finding-\d+"[^>]*aria-labelledby="editor-finding-\d+-title"/)
    expect(ed).toMatch(/<h2 class="finding-title" id="editor-finding-\d+-title">/)
    expect(ed).not.toContain('<h3 class="finding-title"')
  })

  it('names the summary and Variables tables, with the variable name as row header', () => {
    expect(report('en')).toContain('<table class="report-table summary-table" role="table" aria-labelledby="report-summary-title">')
    const ed = editor('en')
    expect(ed).toContain('<table class="var-table" aria-labelledby="editor-tab-vars">')
    expect(ed).toContain(`<th scope="row">${old.variables[0].name}</th>`)
  })

  it('links rule ids in the editor cards and orders the head toggles, Show on map, Close', () => {
    const ed = editor('en')
    expect(ed).toContain('class="finding-rule finding-rule-link"')
    const head = ed.slice(ed.indexOf('drawer-actions'), ed.indexOf('drawer-close'))
    expect(head.indexOf('header-toggles')).toBeLessThan(head.indexOf('drawer-map'))
    expect(text(ed.slice(ed.indexOf('drawer-sub'), ed.indexOf('drawer-actions')))).toContain(old.path)
  })
})

describe('naming key', () => {
  it('sits inside the naming card above its rename list, not above the card list', () => {
    const renames = [
      { ...finding, ruleId: 'VAR_NAME_FORMAT', line: 7, varName: 'x', params: { suggestion: 'pStrX' } },
      { ...finding, ruleId: 'VAR_NAME_FORMAT', line: 9, varName: 'y', params: { suggestion: 'pStrY' } },
    ]
    const group = wrap('en', createElement(FindingGroupCard, { findings: renames, lineOf: (f) => f.line }))
    expect(group.indexOf('class="name-key"')).toBeGreaterThan(-1)
    expect(group.indexOf('class="name-key"')).toBeLessThan(group.indexOf('<ul'))
    // every key is inside a card: no key between cards or above the list
    const outside = (html: string) => html.split('class="name-key"').slice(0, -1).some((before) => before.lastIndexOf('</article>') > before.lastIndexOf('<article'))
    for (const html of [report('en'), editor('en')]) {
      expect(html).toContain('class="name-key"')
      expect(outside(html)).toBe(false)
    }
  })
})

describe('severity filter', () => {
  it('disables a chip whose count is 0', () => {
    const html = wrap('en', createElement(SeverityFilter, {
      label: 'Show:', counts: { error: 2, warn: 0, info: 1 }, on: { error: true, warn: true, info: false }, onToggle: () => {},
    }))
    // a count-0 chip is disabled, not checked and not 'on', also when its state is on
    expect(html).toContain('<label class="sev-toggle sev-warn disabled"><input type="checkbox" disabled=""/>')
    expect(html).toMatch(/<label class="sev-toggle sev-error on"><input type="checkbox" checked=""\/>/)
  })

  it('shows no filter box when the project has no findings', () => {
    expect(report('en')).toContain('class="sev-filter"')
    expect(report('en', { ...analysis, findings: [] })).not.toContain('class="sev-filter"')
  })
})

describe('rules page', () => {
  it('uses example values that fire the rule: CALL_DEPTH at level 4, DEEP_NESTING at 6, in both languages', () => {
    const en = text(wrap('en', createElement(Rules, { analysis: null })))
    expect(en).toContain('which sits at taskbot nesting level 4.')
    expect(en).toContain('Deep nesting (level 6)')
    const es = text(wrap('es', createElement(Rules, { analysis: null })))
    expect(es).toContain('que queda en el nivel 4 de anidación')
    expect(es).toContain('Anidación profunda (nivel 6)')
    expect(en).not.toContain('util*')
  })

  it('keeps the number headers short and says all taskbots once in the caption', () => {
    const html = wrap('en', createElement(Rules, { analysis: null }))
    expect(text(html)).toContain('Times and Points add up all taskbots.')
    expect(html.match(/all taskbots/g)).toHaveLength(1)
    // rule ids break only after '_'
    expect(html).toContain('<code class="rules-id">CALL_<wbr/>DEPTH</code>')
  })
})

describe('PDF file name date', () => {
  it('uses the local date, not UTC', () => {
    expect(localDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
    expect(localDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
})
