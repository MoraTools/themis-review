import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import EditorDrawer from '../src/ui/editor/EditorDrawer'
import Report from '../src/ui/report/Report'
import { FindingCard } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON } from '../src/ui/findings/SeverityFilter'
import { fixFirst, includedList, lostPoints, lostTotal } from '../src/ui/findings/findings'
import { typeLabel } from '../src/ui/canvas/nodeTypes'
import { LangContext, translate, type Lang } from '../src/ui/i18n'

const DEMO = new URL('../.impeccable/review/themis-ui-council-2026-11-17/tools/demo/', import.meta.url)
const zip = (name: string) => ({ name, data: new Uint8Array(readFileSync(new URL(name, DEMO))) })
const analysis = analyzeZips([zip('Demo-Facturas.zip'), zip('Demo-Segundo.zip')])
const old = analysis.taskbots.find((b) => b.name === 'Proceso_Antiguo')!

// ThemeToggles reads the theme from <html>; server rendering has no document
globalThis.document ??= { documentElement: { dataset: {} } } as unknown as Document

const wrap = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))
const report = (lang: Lang) =>
  wrap(lang, createElement(Report, { analysis, onOpen: () => {}, sevOn: DEFAULT_SEVERITY_ON, onToggleSeverity: () => {}, onRule: () => {} }))
const editor = (lang: Lang) =>
  wrap(lang, createElement(EditorDrawer, { analysis, botPath: old.path, onClose: () => {}, onShowOnMap: () => {} }))
const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('points lost', () => {
  it('adds up to 100 - score in every taskbot with findings', () => {
    for (const b of analysis.taskbots) {
      const lost = lostPoints(analysis.findings.filter((f) => f.botPath === b.path))
      expect(lostTotal(lost)).toBe(Math.round((100 - analysis.scores[b.path].score) * 10) / 10)
    }
  })

  it('names the total and the rule count in the editor summary, with every rule in the list', () => {
    const lost = lostPoints(analysis.findings.filter((f) => f.botPath === old.path))
    const html = editor('en')
    const summary = text(html.match(/<summary class="drawer-lost-summary">(.*?)<\/summary>/)![1])
    expect(summary).toBe(`Points lost: −${lostTotal(lost)} in ${lost.length} rules`)
    expect(text(editor('es').match(/<summary class="drawer-lost-summary">(.*?)<\/summary>/)![1]))
      .toBe(`Puntos perdidos: −${String(lostTotal(lost)).replace('.', ',')} en ${lost.length} reglas`)
    // open by default (no matchMedia on the server, as above 760 px), the stacked list, no id repeat
    expect(html).toMatch(/<details class="drawer-lost" open="">/)
    const list = html.slice(html.indexOf('drawer-lost'), html.indexOf('</details>'))
    expect(list).toContain('report-lost-list stacked')
    expect(list.match(/report-lost-title/g)).toHaveLength(lost.length)
    expect(list).not.toContain('report-lost-id')
  })

  it('ends the report list with a total and marks items whose cards are hidden', () => {
    const html = report('en')
    const section = html.slice(html.indexOf(`id="bot-${analysis.taskbots.indexOf(old)}"`))
    const lost = lostPoints(analysis.findings.filter((f) => f.botPath === old.path))
    expect(text(section.match(/<li class="report-lost-total">(.*?)<\/li>/)![1])).toBe(`Total −${lostTotal(lost)}`)
    // Proceso_Antiguo has Info-only families, which the default filter hides
    expect(section).toContain('<span class="report-lost-hidden">Info, not shown</span>')
    expect(report('es')).toContain('<span class="report-lost-hidden">Info, no se muestra</span>')
  })
})

describe('summary table', () => {
  const html = report('en')
  const table = html.slice(html.indexOf('summary-table'), html.indexOf('</table>'))

  it('puts Score right after Taskbot', () => {
    const heads = [...table.matchAll(/<th class="sortable ([^"]*)"/g)].map((m) => m[1].trim())
    expect(heads[1]).toContain('col-score')
    expect(heads.at(-1)).toContain('col-findings')
  })

  it('draws three severity slots in a fixed order, empty for 0, then the shown part', () => {
    const rows = table.split('<tr role="row"').slice(2)
    for (const row of rows) {
      const slots = [...row.matchAll(/class="sev-slot sev-slot-(\w+)/g)].map((m) => m[1])
      expect(slots).toEqual(['error', 'warn', 'info'])
    }
    expect(table).toMatch(/<span class="sev-slot sev-slot-warn"><\/span>/)
    expect(table).toContain('of 43 shown')
  })

  it('lists clean taskbots once, in the table, with their hidden note in the row', () => {
    expect(html).not.toContain('report-silent')
    expect(html).not.toContain('report-clean')
    const master = table.split('<tr role="row"').find((r) => r.includes('000_MasterFacturas'))!
    expect(text(master)).toContain('1 Info hidden')
    expect(master).toContain('<span class="print-only row-anchor">000_MasterFacturas</span>')
    expect(table.split('<tr role="row"').find((r) => r.includes('100_LeerCorreo'))).toContain('No findings')
  })
})

describe('fix first', () => {
  const top = fixFirst(analysis.findings)

  it('takes the 3 largest losses over all taskbots, largest first', () => {
    expect(top).toHaveLength(3)
    const all = analysis.taskbots.flatMap((b) => lostPoints(analysis.findings.filter((f) => f.botPath === b.path)).map((l) => l.points))
    expect(top.map((l) => l.points)).toEqual([...all].sort((a, b) => b - a).slice(0, 3))
  })

  it('shows the same items on screen (buttons) and in print (anchors)', () => {
    const html = report('en')
    const block = html.slice(html.indexOf('class="report-fix"'), html.indexOf('</ol>'))
    expect(block).toContain('>Fix first</h2>')
    const items = block.split('<li').slice(1)
    expect(items).toHaveLength(3)
    items.forEach((item, i) => {
      const bot = analysis.taskbots.find((b) => b.path === top[i].botPath)!
      expect(item).toContain(bot.name)
      const button = item.match(/<button type="button" class="report-lost-link no-print">(.*?)<\/button>/)
      const anchor = item.match(/<a class="print-only card-anchor" href="#([^"]+)">(.*?)<\/a>/)
      if (button) {
        expect(anchor?.[2]).toBe(button[1])
        expect(html).toContain(`id="${anchor![1]}"`)
      } else expect(item).toContain('not shown')
    })
    expect(report('es')).toContain('>Corregir primero</h2>')
  })
})

describe('card heads and labels', () => {
  it('shows the family points on the first card of a family', () => {
    const html = report('en')
    expect(html).toMatch(/<span class="finding-points"><span class="sr-only">points lost: <\/span>−15 \(cap\)<\/span>/)
    const f = analysis.findings.find((x) => x.botPath === old.path)!
    const card = wrap('en', createElement(FindingCard, { finding: f, points: { group: f.ruleId, points: 4, capped: false } }))
    expect(card).toContain('<span class="finding-points"><span class="sr-only">points lost: </span>−4</span>')
  })

  it('names the included severities in the Export PDF label', () => {
    expect(translate('en', 'header.exportScope', { list: includedList(DEFAULT_SEVERITY_ON, 'en') })).toBe('Export PDF (Error, Warning)')
    expect(translate('es', 'header.exportScope', { list: includedList(DEFAULT_SEVERITY_ON, 'es') })).toBe('Exportar PDF (Error, Advertencia)')
  })

  it('writes the type tag with its name', () => {
    expect(typeLabel('DICTIONARY', 'en')).toBe('Dict · Dictionary')
    expect(typeLabel('DICTIONARY', 'es')).toBe('Dict · Diccionario')
    expect(typeLabel('ODD', 'en')).toBe('Odd')
  })

  it('writes grade counts as letter and ×count', () => {
    expect(report('en')).toMatch(/<span class="grade-count grade-A">A <span class="grade-count-n">×\d+<\/span><\/span>/)
  })
})
