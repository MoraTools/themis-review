import { describe, expect, it } from 'vitest'
import {
  DETAIL_ZOOM,
  firstFitViewport,
  gradeOrder,
  isDetailZoom,
  legendCloses,
  nextInCycle,
} from '../src/ui/canvas/Canvas'
import { compactHeight, nodeHeight, type TBNodeData } from '../src/ui/canvas/nodeTypes'
import { plural } from '../src/ui/i18n'

const pane = { width: 1440, height: 900 }
const corner = { width: 250, height: 150 }

describe('first fit', () => {
  it('centers a narrow tall graph right of the corner and starts it at the top', () => {
    const graph = { x: 10, y: 20, width: 400, height: 4000 }
    const v = firstFitViewport(graph, pane, { floor: 0.5, top: 60, corner })
    expect(v.zoom).toBe(0.5)
    // 200 px wide, centered in the 1190 px right of the corner
    expect(v.x + graph.x * v.zoom).toBe(250 + (1190 - 200) / 2)
    // the graph top at the strip band plus the padding: no node cut at the top
    expect(v.y + graph.y * v.zoom).toBe(60 + 24)
  })

  it('starts a wide graph at the left, above the corner when it fits there', () => {
    const graph = { x: -40, y: 0, width: 6000, height: 600 }
    const v = firstFitViewport(graph, pane, { floor: 0.5, top: 60, corner })
    expect(v.zoom).toBe(0.5)
    expect(v.x + graph.x * v.zoom).toBe(24) // the root column, with padding
    const bottom = v.y + (graph.y + graph.height) * v.zoom
    expect(bottom).toBeLessThanOrEqual(pane.height - corner.height)
    expect(v.y).toBeGreaterThanOrEqual(60)
  })

  it('starts a graph that overflows both ways right of the corner', () => {
    const graph = { x: 0, y: 0, width: 6000, height: 6000 }
    const v = firstFitViewport(graph, pane, { floor: 0.5, top: 60, corner })
    expect(v.x).toBe(250 + 24)
    expect(v.y).toBe(60 + 24)
  })

  it('fits a small graph whole, never above zoom 1, clear of the corner and the strip', () => {
    const graph = { x: 0, y: 0, width: 600, height: 300 }
    const v = firstFitViewport(graph, pane, { floor: 0.5, top: 60, corner })
    expect(v.zoom).toBe(1)
    const left = v.x
    const bottom = v.y + 300
    expect(left >= 250 || bottom <= pane.height - corner.height).toBe(true)
    expect(v.y).toBeGreaterThanOrEqual(60 + 24)
  })

  it('centers the anchor (the entry taskbots) of a wide top-to-bottom graph', () => {
    const graph = { x: 0, y: 0, width: 3000, height: 3000 }
    const anchor = { x: 1400, y: 0, width: 200, height: 100 }
    const v = firstFitViewport(graph, { width: 390, height: 700 }, { floor: 0.4, anchor })
    expect(v.x + (anchor.x + anchor.width / 2) * v.zoom).toBe(195)
    // an anchor at the graph's left edge starts at the padding instead of leaving room left of it
    const left = firstFitViewport(graph, { width: 390, height: 700 }, { floor: 0.4, anchor: { ...anchor, x: 0 } })
    expect(left.x).toBe(24)
  })
})

describe('grade strip', () => {
  const scores = {
    b1: { score: 80, grade: 'B' as const },
    f1: { score: 30, grade: 'F' as const },
    f2: { score: 10, grade: 'F' as const },
    f3: { score: 30, grade: 'F' as const },
    a1: { score: 95, grade: 'A' as const },
  }

  it('orders each grade worst score first, then by path', () => {
    expect(gradeOrder(scores)).toEqual({ A: ['a1'], B: ['b1'], C: [], D: [], F: ['f2', 'f1', 'f3'] })
  })

  it('cycles through the taskbots of a grade', () => {
    const list = gradeOrder(scores).F
    const seen: string[] = []
    let last: string | undefined
    for (let i = 0; i < 4; i++) seen.push((last = nextInCycle(list, last))!)
    expect(seen).toEqual(['f2', 'f1', 'f3', 'f2'])
    expect(nextInCycle([], undefined)).toBeUndefined()
  })

  it('names each grade button with its count in both languages', () => {
    expect(plural('en', 'canvas.grades.next', 7, { grade: 'F', band: 'under 40' })).toBe('F, under 40, ×7, next taskbot with grade F')
    expect(plural('es', 'canvas.grades.next', 1, { grade: 'C', band: '60 o más' })).toBe('C, 60 o más, ×1, siguiente taskbot con nota C')
    expect(plural('en', 'node.errors', 1)).toBe('1 error')
    expect(plural('es', 'node.warnings', 2)).toBe('2 advertencias')
  })
})

describe('legend', () => {
  it('closes only by Escape or a pointerdown outside it', () => {
    expect(legendCloses({ type: 'keydown', key: 'Escape', inside: true })).toBe(true)
    expect(legendCloses({ type: 'keydown', key: 'Tab', inside: false })).toBe(false)
    expect(legendCloses({ type: 'pointerdown', inside: false })).toBe(true)
    expect(legendCloses({ type: 'pointerdown', inside: true })).toBe(false)
    expect(legendCloses({ type: 'pointerleave', inside: false })).toBe(false)
    expect(legendCloses({ type: 'focusin', inside: false })).toBe(false)
  })
})

describe('node detail', () => {
  it('switches to compact nodes under zoom 0.85, where 12 px text drops under about 10 px', () => {
    expect(DETAIL_ZOOM).toBe(0.85)
    expect(isDetailZoom(0.85)).toBe(true)
    expect(isDetailZoom(0.84)).toBe(false)
    expect(12 * DETAIL_ZOOM).toBeGreaterThanOrEqual(10)
  })

  it('gives a long name the compact room it needs at a low zoom', () => {
    const d: TBNodeData = {
      label: '101_ConciliarMovimientosBancariosPendientesDelMes',
      path: 'p',
      ghost: false,
      inputVars: [],
      wireOutVars: [],
      outputVars: [],
      findingsCount: 3,
    }
    expect(compactHeight(d, 1)).toBeLessThan(nodeHeight(d))
    expect(compactHeight(d, 0.4)).toBeGreaterThan(nodeHeight(d))
    // more lines at a lower zoom: the text keeps its screen size while the node shrinks
    expect(compactHeight(d, 0.4) * 0.4).toBeGreaterThan(compactHeight(d, 0.6) * 0.6)
  })
})
