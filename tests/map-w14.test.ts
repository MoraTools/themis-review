import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import { countInView, firstFitViewport, MapFixFirst } from '../src/ui/canvas/Canvas'
import { compactWidth, NODE_WIDTH } from '../src/ui/canvas/nodeTypes'
import { DEFAULT_SEVERITY_ON } from '../src/ui/findings/SeverityFilter'
import { fixFirst } from '../src/ui/findings/findings'
import Report from '../src/ui/report/Report'
import { LangContext, plural, type Lang } from '../src/ui/i18n'
import { joinPoint } from '../src/ui/canvas/routes'

const DEMO = new URL('./fixtures/', import.meta.url)
const zip = (name: string) => ({ name, data: new Uint8Array(readFileSync(new URL(name, DEMO))) })
const analysis = analyzeZips([zip('Demo-Facturas.zip'), zip('Demo-Segundo.zip')])

const wrap = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** the text of every Fix first item, in document order */
function fixItems(html: string): string[] {
  const out: string[] = []
  const open = '<span class="report-fix-item">'
  for (let i = html.indexOf(open); i >= 0; i = html.indexOf(open, i + 1)) {
    const tags = /<\/?span\b[^>]*>/g
    tags.lastIndex = i
    let depth = 0
    for (let m = tags.exec(html); m; m = tags.exec(html)) {
      depth += m[0].startsWith('</') ? -1 : 1
      if (depth === 0) {
        out.push(text(html.slice(i, tags.lastIndex)))
        break
      }
    }
  }
  return out
}

describe('Fix first on the map', () => {
  for (const lang of ['en', 'es'] as const) {
    it(`lists the report's items in the report's order (${lang})`, () => {
      const map = fixItems(wrap(lang, createElement(MapFixFirst, { analysis, onOpen: () => {} })))
      // the report draws each item twice: a button on screen and an anchor in print; the tied items follow in their own list
      const html = wrap(lang, createElement(Report, { analysis, onOpen: () => {}, sevOn: DEFAULT_SEVERITY_ON, onToggleSeverity: () => {}, onRule: () => {} }))
      const report = fixItems(html.slice(0, html.indexOf('report-fix-ties'))).filter((item, i, all) => item !== all[i - 1])
      expect(map).toHaveLength(fixFirst(analysis).items.length)
      expect(map.length).toBeGreaterThan(0)
      expect(map).toEqual(report)
    })
  }

  it('is a closed disclosure whose summary names the first item, with one button per item', () => {
    const html = wrap('en', createElement(MapFixFirst, { analysis, onOpen: () => {} }))
    expect(html).toMatch(/^<details class="map-fix"><summary><span class="caret" aria-hidden="true">/)
    expect(text(html.slice(0, html.indexOf('</summary>')))).toBe('Fix first: Proceso_Antiguo · Message Box that does not close')
    const es = wrap('es', createElement(MapFixFirst, { analysis, onOpen: () => {} }))
    expect(text(es.slice(0, es.indexOf('</summary>')))).toMatch(/^Corregir primero: Proceso_Antiguo · /)
    expect(html.match(/<button type="button"/g)).toHaveLength(fixFirst(analysis).items.length)
  })
})

describe('cut first view', () => {
  it('counts the boxes that lie whole in the pane', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 150, y: 0, width: 100, height: 50 },
      { x: 0, y: 300, width: 100, height: 50 },
    ]
    expect(countInView(boxes, { x: 0, y: 0, zoom: 1 }, { width: 400, height: 400 })).toBe(3)
    // half of the second box is right of the pane, the third is under it
    expect(countInView(boxes, { x: 0, y: 0, zoom: 1 }, { width: 200, height: 200 })).toBe(1)
    expect(countInView(boxes, { x: 10, y: 10, zoom: 0.5 }, { width: 200, height: 200 })).toBe(3)
  })

  it('names the part in both languages', () => {
    expect(plural('en', 'canvas.cut', 43, { shown: '16' })).toBe('Showing 16 of 43')
    expect(plural('es', 'canvas.cut', 43, { shown: '16' })).toBe('Mostrando 16 de 43')
  })
})

describe('compact node width', () => {
  it('grows with the name up to 22 characters a line', () => {
    expect(compactWidth({ label: 'Corto' }, 0.5)).toBe(NODE_WIDTH)
    const long = compactWidth({ label: 'x'.repeat(45) }, 0.5)
    expect(long).toBeGreaterThan(NODE_WIDTH)
    expect(compactWidth({ label: 'x'.repeat(22) }, 0.5)).toBe(long)
  })
})

describe('first view zoom', () => {
  it('goes under the detail zoom rather than draw the detailed text under 12 px', () => {
    const pane = { width: 1440, height: 900 }
    // fits at about 0.95: detailed nodes would draw their 12 px text at 11.4 px
    const v = firstFitViewport({ x: 0, y: 0, width: 1466, height: 896 }, pane, { floor: 0.5, detailZoom: 0.85 })
    expect(v.zoom).toBeLessThan(0.85)
    expect(firstFitViewport({ x: 0, y: 0, width: 500, height: 300 }, pane, { floor: 0.5, detailZoom: 0.85 }).zoom).toBe(1)
    expect(firstFitViewport({ x: 0, y: 0, width: 3000, height: 1800 }, pane, { floor: 0.5, detailZoom: 0.85 }).zoom).toBe(0.5)
  })
})

describe('junction dot of a shared in-port', () => {
  it('sits where the lane turns onto the shared last stretch', () => {
    // horizontal: out-port, bend down, bus x 300, run along y 200 to the in-port
    const lane = [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 200 },
      { x: 400, y: 200 },
    ]
    expect(joinPoint(lane, false)).toEqual({ x: 300, y: 50 })
    expect(joinPoint(lane.map(({ x, y }) => ({ x: y, y: x })), true)).toEqual({ x: 50, y: 300 })
  })

  it('is absent on a straight lane', () => {
    expect(joinPoint([{ x: 0, y: 0 }, { x: 100, y: 0 }], false)).toBeUndefined()
  })
})
