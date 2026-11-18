import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import {
  arrowTarget,
  firstFitViewport,
  GradeStrip,
  isolateRows,
  layoutOrder,
  LegendBody,
  worstTaskbot,
} from '../src/ui/canvas/Canvas'
import { elkRoutes, fitRoute, routePath } from '../src/ui/canvas/routes'
import { LangContext, type Lang } from '../src/ui/i18n'

const wrap = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, createElement(ReactFlowProvider, null, el)),
  )
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/\s+/g, ' ')

const scores = {
  a1: { score: 95, grade: 'A' as const },
  b1: { score: 80, grade: 'B' as const },
  f1: { score: 30, grade: 'F' as const },
  f2: { score: 10, grade: 'F' as const },
}

describe('first view of a large map', () => {
  const pane = { width: 1440, height: 843 }
  const opts = { floor: 0.5, top: 44, corner: { width: 244, height: 142 } }
  const panels = [
    { x: 12, y: 12, width: 365, height: 32 },
    { x: 12, y: 701, width: 232, height: 130 },
  ]

  it('is the worst score of the worst grade present', () => {
    expect(worstTaskbot(scores)).toBe('f2')
    expect(worstTaskbot({ a1: scores.a1, b1: scores.b1 })).toBe('b1')
    expect(worstTaskbot({})).toBeUndefined()
  })

  it('centers the worst taskbot when the graph overflows, and cuts no node at the top or under a panel', () => {
    // three columns of eleven 200-high taskbots, 60 apart, each column offset by 20 (a gap common to all three exists)
    const many = [0, 1, 2].flatMap((c) =>
      Array.from({ length: 11 }, (_, r) => ({ x: c * 420, y: r * 260 + c * 20, width: 280, height: 200 })),
    )
    const tall = { x: 0, y: 0, width: 1120, height: 10 * 260 + 40 + 200 }
    const anchor = many[30] // low in the last column
    const v = firstFitViewport(tall, pane, { ...opts, anchor, nodes: many, panels })
    expect(v.overflow).toBe(true)
    expect(v.zoom).toBe(0.5)
    const top = v.y + anchor.y * v.zoom
    expect(top).toBeGreaterThanOrEqual(44)
    expect(top + anchor.height * v.zoom).toBeLessThanOrEqual(pane.height)
    for (const n of many) {
      const t = v.y + n.y * v.zoom
      const b = t + n.height * v.zoom
      expect(t < 0 && b > 0, 'cut at the top').toBe(false)
      const l = v.x + n.x * v.zoom
      const r = l + n.width * v.zoom
      for (const p of panels) expect(r > p.x && l < p.x + p.width && b > p.y && t < p.y + p.height, 'under a panel').toBe(false)
    }
    // without an anchor the same graph starts at its top
    expect(firstFitViewport(tall, pane, { ...opts, nodes: many, panels }).y).toBe(44 + 24)
  })

  it('keeps the whole-graph fit of a small project that fits (anchor or not)', () => {
    const small = { x: 0, y: 0, width: 600, height: 300 }
    const plain = firstFitViewport(small, pane, opts)
    const anchored = firstFitViewport(small, pane, {
      ...opts,
      anchor: { x: 0, y: 0, width: 280, height: 100 },
      nodes: [{ x: 0, y: 0, width: 280, height: 100 }],
      panels,
    })
    expect(anchored).toEqual(plain)
    expect(plain.overflow).toBe(false)
    expect(plain.zoom).toBe(1)
  })

  it('fits the widest rank to a phone width at a readable zoom, starting at the top', () => {
    const phone = { width: 390, height: 747 }
    const g = { x: 0, y: 0, width: 620, height: 3000 }
    const v = firstFitViewport(g, phone, { floor: 0.4, narrow: true, top: 64 })
    expect(v.zoom).toBeCloseTo((390 - 48) / 620)
    expect(v.x + g.width * v.zoom).toBeLessThanOrEqual(390 - 24 + 1e-9) // no node cut at the right
    expect(v.y).toBe(64 + 24)
    // a rank too wide for the readable zoom keeps the floor (compact text stays 12 px)
    expect(firstFitViewport({ ...g, width: 3000 }, phone, { floor: 0.4, narrow: true }).zoom).toBe(0.4)
  })

  it('puts taskbots with no edges in rows above the call chains, wrapped at their width', () => {
    const chains = [
      { x: 10, y: 500, width: 280, height: 200 },
      { x: 430, y: 800, width: 280, height: 200 },
    ]
    const rows = isolateRows(
      [
        { id: 'a', height: 100 },
        { id: 'b', height: 150 },
        { id: 'c', height: 100 },
      ],
      chains,
    )
    // two fit in the chains' 700 width (280 + 60 + 280), the third wraps; the last row ends one band gap (100) above y 500
    expect(rows).toEqual([
      { id: 'a', x: 10, y: 500 - 100 - 100 - 60 - 150 },
      { id: 'b', x: 350, y: 500 - 100 - 100 - 60 - 150 },
      { id: 'c', x: 10, y: 500 - 100 - 100 },
    ])
  })

  it('is a band above the nodes and call routes under it, with the gap the caller gives', () => {
    const chains = [
      { x: 1300, y: 0, width: 280, height: 200 }, // a root far to the right, not under the row
      { x: 0, y: 360, width: 280, height: 200 }, // the first chain node under the row
      { x: 340, y: 360, width: 280, height: 200 },
    ]
    const bus = { x: 140, y: 330, width: 1160, height: 0 } // the root's call bus runs under the row at y 330
    expect(isolateRows([{ id: 'a', height: 210 }], chains)).toEqual([{ id: 'a', x: 0, y: 360 - 100 - 210 }])
    const [row] = isolateRows([{ id: 'a', height: 210 }], chains, [bus], { node: 60, band: 40 / 0.3 })
    expect(row).toEqual({ id: 'a', x: 0, y: 330 - 40 / 0.3 - 210 })
    expect(330 - (row.y + 210)).toBeCloseTo(40 / 0.3) // 40 px on screen at a first-fit zoom of 0.3
  })
})

describe('map keyboard', () => {
  const nodes = [
    { id: 'c', position: { x: 420, y: 0 } },
    { id: 'a', position: { x: 0, y: 300 } },
    { id: 'd', position: { x: 420, y: 300 } },
    { id: 'b', position: { x: 0, y: 600 } },
  ]

  it('orders the taskbots by column then down, or by row then right top to bottom', () => {
    expect(layoutOrder(nodes, false)).toEqual(['a', 'b', 'c', 'd'])
    expect(layoutOrder(nodes, true)).toEqual(['c', 'a', 'd', 'b'])
  })

  it('moves next on right and down, previous on left and up, to the ends on Home and End', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(arrowTarget(order, 'b', 'ArrowRight')).toBe('c')
    expect(arrowTarget(order, 'b', 'ArrowDown')).toBe('c')
    expect(arrowTarget(order, 'b', 'ArrowLeft')).toBe('a')
    expect(arrowTarget(order, 'b', 'ArrowUp')).toBe('a')
    expect(arrowTarget(order, 'd', 'ArrowRight')).toBe('d') // stops at the end
    expect(arrowTarget(order, 'a', 'ArrowUp')).toBe('a')
    expect(arrowTarget(order, 'c', 'Home')).toBe('a')
    expect(arrowTarget(order, 'a', 'End')).toBe('d')
    expect(arrowTarget(order, 'a', 'Enter')).toBeUndefined()
    expect(arrowTarget(order, 'ghost', 'ArrowRight')).toBeUndefined()
  })
})

describe('call edges on the ELK routes', () => {
  const route = [
    { x: 280, y: 100 },
    { x: 350, y: 100 },
    { x: 350, y: 400 },
    { x: 420, y: 400 },
  ]

  it('reads start, bend points and end from the edge sections', () => {
    const result = {
      id: 'root',
      edges: [
        {
          id: 'call:a→b',
          sources: ['a#out'],
          targets: ['b#in'],
          sections: [{ id: 's', startPoint: route[0], bendPoints: [route[1], route[2]], endPoint: route[3] }],
        },
        { id: 'call:a→c', sources: ['a#out'], targets: ['c#in'] },
      ],
    }
    expect(elkRoutes(result as never)).toEqual([{ id: 'call:a→b', points: route }])
  })

  it('moves the ends to the rendered handles and keeps every segment straight', () => {
    expect(fitRoute(route, { x: 285, y: 90 }, { x: 415, y: 380 }, false)).toEqual([
      { x: 285, y: 90 },
      { x: 350, y: 90 },
      { x: 350, y: 380 },
      { x: 415, y: 380 },
    ])
    // a straight route whose handles no longer line up gets one jog half way
    expect(fitRoute([route[0], { x: 420, y: 100 }], { x: 280, y: 100 }, { x: 420, y: 140 }, false)).toEqual([
      { x: 280, y: 100 },
      { x: 350, y: 100 },
      { x: 350, y: 140 },
      { x: 420, y: 140 },
    ])
  })

  it('draws a path through the points with rounded corners', () => {
    const d = routePath(route, 8)
    expect(d.startsWith('M 280 100 L 342 100 Q 350 100 350 108')).toBe(true)
    expect(d.endsWith('L 420 400')).toBe(true)
    expect(routePath([route[0], route[3]])).toBe('M 280 100 L 420 400')
  })
})

describe('grade strip and legend', () => {
  it('labels the strip and counts in the count form, keeping the button names', () => {
    const html = wrap('en', createElement(GradeStrip, { scores, onShow: () => {} }))
    expect(text(html)).toContain('Taskbots by grade')
    expect(text(html)).toContain('A ×1')
    expect(text(html)).toContain('F ×2')
    expect(html).toContain('aria-labelledby="grade-strip-label"')
    expect(html).toContain('aria-label="F ×2, next taskbot with grade F"')
    expect(html).not.toContain('grade-score')
    expect(text(wrap('es', createElement(GradeStrip, { scores, onShow: () => {} })))).toContain('Taskbots por nota')
  })

  it('shows the grade bands, the bar note and the type names in the legend', () => {
    const en = text(wrap('en', createElement(LegendBody, { types: ['DICTIONARY', 'STRING'] })))
    expect(en).toContain('A ≥ 90')
    expect(en).toContain('B ≥ 75')
    expect(en).toContain('F < 40')
    expect(en).toContain('C, D, F: bar on the left')
    expect(en).toContain('Dict · Dictionary')
    expect(en).not.toContain('DICTIONARY')
    const es = text(wrap('es', createElement(LegendBody, { types: ['STRING'] })))
    expect(es).toContain('C, D, F: barra a la izquierda')
    expect(es).toContain('Str · Texto')
  })
})

describe('compact severity row', () => {
  it('counts a second row when the counts do not fit the node at a high counter-scale', async () => {
    const { sevRows, compactHeight } = await import('../src/ui/canvas/nodeTypes')
    const d = { label: 'Proceso_Antiguo', findingsCount: 43, bySeverity: { error: 6, warn: 24, info: 13 } } as never
    expect(sevRows(d, 1)).toBe(1)
    expect(sevRows(d, 2.5)).toBe(2)
    expect(compactHeight(d, 0.4)).toBeGreaterThan(compactHeight({ ...(d as object), bySeverity: { error: 6, warn: 0, info: 0 } } as never, 0.4))
  })
})
