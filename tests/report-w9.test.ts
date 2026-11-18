import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import type { Finding } from '../src/core/model'
import EditorDrawer from '../src/ui/editor/EditorDrawer'
import Report from '../src/ui/report/Report'
import { FindingCard, FindingGroupCard } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON } from '../src/ui/findings/SeverityFilter'
import { fixFirst, includedList, lostPoints, lostTotal } from '../src/ui/findings/findings'
import { typeLabel } from '../src/ui/canvas/nodeTypes'
import { LangContext, translate, type Lang } from '../src/ui/i18n'

const DEMO = new URL('./fixtures/', import.meta.url)
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
    // closed by default at every width, one layout, no id repeat
    expect(html).toMatch(/<details class="drawer-lost">/)
    const list = html.slice(html.indexOf('drawer-lost'), html.indexOf('</details>')).replace(/<a class="print-only card-anchor"[^]*?<\/a>/g, '')
    expect(list).toContain('class="report-lost-list long"')
    expect(list.match(/report-lost-title/g)).toHaveLength(lost.length)
    expect(list).not.toContain('report-lost-id')
  })

  it('ends the report list with a total and marks items whose cards are hidden', () => {
    const html = report('en')
    const section = html.slice(html.indexOf(`id="bot-${analysis.taskbots.indexOf(old)}"`))
    const lost = lostPoints(analysis.findings.filter((f) => f.botPath === old.path))
    expect(text(section.match(/<li class="report-lost-total">(.*?)<\/li>/)![1])).toBe(`Total −${lostTotal(lost)}`)
    // Proceso_Antiguo has Info-only families, which the default filter hides: a count, a button on screen, text in print
    const unused = analysis.findings.filter((f) => f.botPath === old.path && f.ruleId === 'UNUSED_VAR').length
    expect(unused).toBeGreaterThan(1)
    expect(section).toContain(`<button type="button" class="report-lost-hidden report-lost-show no-print" title="Show these findings and go to their card">${unused} Info, not shown</button>`)
    expect(section).toContain(`<span class="report-lost-hidden print-only">${unused} Info, not shown</span>`)
    expect(report('es')).toContain(`${unused} Info, no se muestran</button>`)
    // a <details> with the editor's summary line, the Points lost items as links on screen and anchors in print
    expect(text(section.match(/<summary class="report-lost-summary">(.*?)<\/summary>/)![1])).toBe(`Points lost: −${lostTotal(lost)} in ${lost.length} rules`)
    const box = section.slice(section.indexOf('report-lost-box'), section.indexOf('</details>'))
    expect(box).toMatch(/<a class="print-only card-anchor" href="#bot-\d+-[A-Z_]+">/)
  })

  it('captions the project grade box', () => {
    expect(report('en')).toMatch(/<div class="report-score"><span class="report-score-label">Project score<\/span>/)
    expect(report('es')).toContain('<span class="report-score-label">Puntaje del proyecto</span>')
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
    for (const row of rows.filter((r) => !r.includes('No findings'))) {
      const slots = [...row.matchAll(/class="sev-slot sev-slot-(\w+)/g)].map((m) => m[1])
      expect(slots).toEqual(['error', 'warn', 'info'])
    }
    expect(table).toMatch(/<span class="sev-slot sev-slot-warn"><\/span>/)
    expect(table).toContain('<span class="sev-shown"><span class="fig">30</span> of <span class="fig">43</span> shown</span>')
    // the ratio only when the filter hides some: 200_ActualizarCatalogo has no hidden finding
    const catalog = rows.find((r) => r.includes('200_ActualizarCatalogo'))!
    expect(catalog).not.toContain('sev-shown')
    // a clean taskbot: 'No findings' alone, without the empty slots
    const clean = rows.find((r) => r.includes('100_LeerCorreo'))!
    expect(clean).toContain('<td role="cell" class="col-findings"><span class="sev-none">No findings</span></td>')
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
  const { items: top, more } = fixFirst(analysis)
  const total = analysis.taskbots.reduce((n, b) => n + analysis.metrics[b.path].totalLines, 0)

  it('ranks the losses by their effect on the project score (lines weighted), then the lowest taskbot score', () => {
    expect(top).toHaveLength(3)
    for (const l of top) expect(l.project).toBe(Math.round((l.points * analysis.metrics[l.botPath].totalLines / total) * 10) / 10)
    const all = analysis.taskbots.flatMap((b) =>
      lostPoints(analysis.findings.filter((f) => f.botPath === b.path)).map((l) => Math.round((l.points * analysis.metrics[b.path].totalLines / total) * 10) / 10))
    expect(top.map((l) => l.project)).toEqual([...all].sort((a, b) => b - a).slice(0, 3))
    // Proceso_Antiguo (315 of 456 lines): two caps, then 'too long' (-4, -2.8 project) and one more of that size
    expect(top.map((l) => [l.group, l.points])).toEqual([['MSGBOX_BLOCKING', 15], ['VAR_NAME_FORMAT', 15], ['TOO_LONG', 4]])
    expect(more).toBe(1)
  })

  it('shows the same items in the same order on screen (buttons) and in print (anchors), with both values', () => {
    const html = report('en')
    const block = html.slice(html.indexOf('class="report-fix"'), html.indexOf('</section>'))
    expect(block).toContain('>Fix first</h2>')
    const items = block.slice(0, block.indexOf('</ol>')).split('<li').slice(1)
    expect(items).toHaveLength(3)
    items.forEach((item, i) => {
      const bot = analysis.taskbots.find((b) => b.path === top[i].botPath)!
      expect(item).toContain(bot.name)
      expect(text(item)).toContain(`· −${top[i].project} project`)
      const button = item.match(/<button type="button" class="report-lost-link no-print">(.*?)<\/button>/)
      const anchor = item.match(/<a class="print-only card-anchor" href="#([^"]+)">(.*?)<\/a>/)
      if (button) {
        expect(anchor?.[2]).toBe(button[1])
        expect(html).toContain(`id="${anchor![1]}"`)
      } else expect(item).toContain('not shown')
    })
    expect(text(block)).toContain('−15 (cap) · −10.4 project')
    expect(block).toContain('<p class="report-fix-more">+1 more of the same size</p>')
    const es = report('es')
    expect(es).toContain('>Corregir primero</h2>')
    expect(es).toContain('+1 más del mismo tamaño')
    expect(text(es)).toContain('−15 (tope) · −10,4 proyecto')
  })

  it('lists one item per taskbot while other taskbots have a loss of the same size, and counts the cut ties', () => {
    // a synthetic large project: 8 taskbots of the same length, each with two capped families
    const taskbots = Array.from({ length: 8 }, (_, i) => ({ path: 'p/' + i, name: 'Bot' + i }))
    const findings: Finding[] = taskbots.flatMap((b) =>
      ['MSGBOX_BLOCKING', 'HARDCODED_PATH'].flatMap((ruleId) =>
        Array.from({ length: 4 }, (_, k) => ({ ruleId, severity: 'error' as const, botPath: b.path, line: k + 1, params: {} }))))
    const big = {
      taskbots,
      findings,
      metrics: Object.fromEntries(taskbots.map((b) => [b.path, { totalLines: 100 }])),
      // lower scores later in the input: the lowest score goes first among equal sizes
      scores: Object.fromEntries(taskbots.map((b, i) => [b.path, { score: 70 - i, grade: 'C' }])),
    } as unknown as Parameters<typeof fixFirst>[0]
    const r = fixFirst(big)
    expect(r.items.map((l) => l.botPath)).toEqual(['p/7', 'p/6', 'p/5'])
    expect(r.items.every((l) => l.points === 15 && l.project === 1.9)).toBe(true)
    expect(r.more).toBe(13)
    // with two taskbots, the second family of each comes after the first family of the other
    const two = { ...big, taskbots: big.taskbots.slice(0, 2), findings: findings.filter((f) => ['p/0', 'p/1'].includes(f.botPath)) }
    expect(fixFirst(two).items.map((l) => [l.botPath, l.group])).toEqual([['p/1', 'HARDCODED_PATH'], ['p/0', 'HARDCODED_PATH'], ['p/1', 'MSGBOX_BLOCKING']])
  })

  it('counts only the gain above 0 when a taskbot score stops at 0', () => {
    // 7 capped families take 105 points: the score is 0, and one fix lifts it to 10, not 15
    const rules = ['MSGBOX_BLOCKING', 'HARDCODED_PATH', 'VAR_NAME_FORMAT', 'TOO_LONG', 'CALL_DEPTH', 'EMPTY_CATCH', 'MSGBOX_DEAD']
    const findings: Finding[] = rules.flatMap((ruleId) =>
      Array.from({ length: 4 }, (_, k) => ({ ruleId, severity: 'error' as const, botPath: 'p/0', line: k + 1, params: {} })))
    const zero = {
      taskbots: [{ path: 'p/0', name: 'Bot0' }],
      findings,
      metrics: { 'p/0': { totalLines: 100 } },
      scores: { 'p/0': { score: 0, grade: 'F' } },
    } as unknown as Parameters<typeof fixFirst>[0]
    expect(lostTotal(lostPoints(findings))).toBe(105)
    expect(fixFirst(zero).items.map((l) => [l.points, l.project])).toEqual([[15, 10], [15, 10], [15, 10]])
  })
})

describe('card heads and labels', () => {
  it('shows the family points on the first card of a family', () => {
    const html = report('en')
    // '(cap)' is an abbr whose title is the cap note
    expect(html).toMatch(/<span class="finding-points"><span class="sr-only">points lost: <\/span><span class="fig">−15<\/span> \(<abbr title="The most one rule family can take off one taskbot.">cap<\/abbr>\)<\/span>/)
    const f = analysis.findings.find((x) => x.botPath === old.path)!
    const card = wrap('en', createElement(FindingCard, { finding: f, points: { group: f.ruleId, points: 4, capped: false } }))
    expect(card).toContain('<span class="finding-points"><span class="sr-only">points lost: </span><span class="fig">−4</span></span>')
  })

  it('marks the later cards of a shared family and lays renames out as a grid of line | old → new', () => {
    const f = analysis.findings.find((x) => x.botPath === old.path)!
    const card = wrap('en', createElement(FindingCard, { finding: f, points: { group: f.ruleId, points: 2, capped: false, inFamily: true } }))
    expect(card).toContain('<span class="finding-points in-family"><span class="sr-only">points lost: </span>in family <span class="fig">−2</span></span>')
    expect(wrap('es', createElement(FindingCard, { finding: f, points: { group: f.ruleId, points: 2, capped: false, inFamily: true } }))).toContain('en la familia <span class="fig">−2</span>')
    const renames = [
      { ...f, ruleId: 'VAR_NAME_FORMAT', line: 7, varName: 'x', params: { suggestion: 'pStrX' } },
      { ...f, ruleId: 'VAR_NAME_FORMAT', line: undefined, varName: 'temp', params: { suggestion: 'pStrTemp' } },
    ]
    const group = wrap('en', createElement(FindingGroupCard, { findings: renames, lineOf: (x: Finding) => x.line }))
    expect(group).toContain('<ul class="finding-items finding-renames">')
    expect(group).toContain('<li><span class="finding-item-line"><span>L7</span></span> <span class="finding-item-text"><code>x</code> → <code class="finding-new">pStrX</code></span></li>')
    expect(group).toContain('<li><span class="finding-item-line"></span> <span class="finding-item-text"><code>temp</code> → <code class="finding-new">pStrTemp</code></span></li>')
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
