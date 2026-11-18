import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  applyNodeChanges,
  Background,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import ElkApi, { type ElkNode } from 'elkjs/lib/elk-api'
import '@xyflow/react/dist/style.css'
import type { BotScore, ProjectAnalysis, Severity } from '../../core/model'
import TaskbotNode from './TaskbotNode'
import FileNode from './FileNode'
import RoutedEdge, { type RoutedEdgeData } from './RoutedEdge'
import { elkRoutes, type Point } from './routes'
import {
  DetailContext,
  FILE_NODE_HEIGHT,
  FILE_NODE_WIDTH,
  NODE_WIDTH,
  compactHeight,
  compactWidth,
  nodeHeight,
  SEVERITIES,
  STAT_ICONS,
  typeColor,
  typeLabel,
  VerticalContext,
  type FileNodeData,
  type TBNodeData,
} from './nodeTypes'
import { Icon, SeverityIcon } from '../Icons'
import { LangContext, plural, translate, usePlural, useT } from '../i18n'
import { fixFirst, gradeBands, gradeDistribution } from '../findings/findings'
import { FixItemText } from '../findings/FindingCard'
import { GradeCount } from '../shared/Grade'

const nodeTypes = { taskbot: TaskbotNode, file: FileNode }
const edgeTypes = { routed: RoutedEdge }

/** minimap size is fixed so the zoom controls can be parked right beside it */
const MINIMAP_W = 190
const MINIMAP_H = 130
/** below this zoom the 12 px node text drops under about 10 px on screen: nodes turn compact
 *  (grade, name, severity counts, counter-scaled by --s) and wires and files hide */
export const DETAIL_ZOOM = 0.85
/** from this zoom variable rows also show their short type tag */
const TYPE_TAG_ZOOM = 0.9
/** The first fit never zooms out further than this; the user pans for the rest. Compact text
 *  stays 12 px on screen down to zoom 1/3.4 (the --s cap), but each node gets the room its whole
 *  name needs at the floor, so a lower floor makes taller slots. Measured on a 43-taskbot map:
 *  0.5 shows the most whole taskbots at 1440x900. */
const FIT_FLOOR = 0.5
/** top to bottom (phones): the first view fits the width, down to this: the --s cap, where compact text is still 12 px */
const FIT_FLOOR_NARROW = 1 / 3.4
/** screen px between the band of taskbots with no calls and the call chains, at the floor zoom */
const BAND_GAP_PX = 40
/** panes narrower than this lay the call chain out top to bottom */
const NARROW_QUERY = '(max-width: 760px)'
const MINIMAP_NODE_LIMIT = 100
/** up to this many nodes all render, so Tab reaches every taskbot and the view follows the focus */
const RENDER_ALL_LIMIT = 150

const LEGEND_KEYS = ['call', 'wire', 'ghost', 'file'] as const
const GRADES = ['A', 'B', 'C', 'D', 'F'] as const
const SEVERITY_LABEL = { error: 'node.errors', warn: 'node.warnings', info: 'node.infos' } as const

export const isDetailZoom = (zoom: number) => zoom >= DETAIL_ZOOM

/** the open legend closes only by its toggle, Escape or a pointerdown outside it;
 *  not when the pointer leaves or focus moves, so it can be read and scrolled */
export function legendCloses(event: { type: string; key?: string; inside: boolean }): boolean {
  if (event.type === 'keydown') return event.key === 'Escape'
  return event.type === 'pointerdown' && !event.inside
}

/** the unfolded legend: grade bands, node figures, lines and nodes, data types */
export function LegendBody({ types, detailed = true }: { types: string[]; detailed?: boolean }) {
  const t = useT()
  const { lang } = useContext(LangContext)
  return (
    <div className="legend-body" tabIndex={0} role="region" aria-label={t('canvas.legend.title')}>
      <p className="legend-group">{t('canvas.legend.grades')}</p>
      <ul className="legend-row">
        {gradeBands(lang).map((b) => (
          <li key={b.grade} className={'grade-' + b.grade}>
            <i className="leg-swatch" /> {b.grade} <span className="legend-band">{b.text}</span>
          </li>
        ))}
      </ul>
      <p className="legend-note">{t('canvas.legend.bar')}</p>
      <p className="legend-group">{t('canvas.legend.stats')}</p>
      <ul className="legend-grid">
        {/* the figures, the variable wire and the data types are drawn only at the detail zoom */}
        {detailed && (Object.keys(STAT_ICONS) as (keyof typeof STAT_ICONS)[]).map((k) => (
          <li key={k}>
            <Icon name={STAT_ICONS[k]} /> {t('node.' + k)}
          </li>
        ))}
        {SEVERITIES.map((sev) => (
          <li key={sev} className={'sev-' + sev}>
            <SeverityIcon severity={sev} /> {t(SEVERITY_LABEL[sev])}
          </li>
        ))}
      </ul>
      <p className="legend-group">{t('canvas.legend.links')}</p>
      <dl>
        {LEGEND_KEYS.filter((k) => detailed || k !== 'wire').map((k) => (
          <div className="legend-item" key={k}>
            <dt>
              <i className={'leg-' + k} /> {t('canvas.legend.' + k)}
            </dt>
            <dd>{t('canvas.legend.' + k + '.desc')}</dd>
          </div>
        ))}
      </dl>
      {detailed && types.length > 0 && (
        <>
          <p className="legend-group">{t('canvas.legend.types')}</p>
          <ul className="legend-row">
            {types.map((type) => (
              <li key={type}>
                <i className="leg-dot" style={{ background: typeColor(type) }} /> {typeLabel(type, lang)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Folded to a single row by default — expanded it covered too much canvas. */
function Legend({ types, detailed }: { types: string[]; detailed: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // document-level listeners rather than onBlur, which never fired reliably here
  useEffect(() => {
    if (!open) return
    const onEvent = (e: Event) => {
      const inside = !!ref.current?.contains(e.target as HTMLElement | null)
      if (legendCloses({ type: e.type, key: (e as KeyboardEvent).key, inside })) setOpen(false)
    }
    document.addEventListener('pointerdown', onEvent)
    document.addEventListener('keydown', onEvent)
    return () => {
      document.removeEventListener('pointerdown', onEvent)
      document.removeEventListener('keydown', onEvent)
    }
  }, [open])

  // a scrolling body ends after its last whole row, never in the middle of one
  useLayoutEffect(() => {
    const body = ref.current?.querySelector<HTMLElement>('.legend-body')
    if (!body) return
    body.style.maxHeight = ''
    const limit = body.clientHeight
    if (body.scrollHeight <= limit) return
    const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0
    let bottom = 0
    for (const row of body.querySelectorAll<HTMLElement>(':scope > p, li, .legend-item')) {
      const end = row.offsetTop + row.offsetHeight
      if (end + pad <= limit) bottom = Math.max(bottom, end)
    }
    if (bottom) body.style.maxHeight = bottom + pad + body.clientTop + 'px'
  }, [open, detailed, types])

  return (
    <div ref={ref} className={'legend' + (open ? ' open' : '')}>
      <button className="legend-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="legend-caret" aria-hidden="true">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        </span>
        {t('canvas.legend.title')}
      </button>
      {open && <LegendBody types={types} detailed={detailed} />}
    </div>
  )
}

/** taskbots of each grade, worst score first (then by name): the order the grade strip walks */
export function gradeOrder(scores: Record<string, BotScore>): Record<BotScore['grade'], string[]> {
  const out = Object.fromEntries(GRADES.map((g) => [g, [] as string[]])) as Record<BotScore['grade'], string[]>
  const paths = Object.keys(scores).sort((a, b) => scores[a].score - scores[b].score || a.localeCompare(b))
  for (const path of paths) out[scores[path].grade].push(path)
  return out
}

/** the taskbot after `last` in the list, back to the first after the end */
export function nextInCycle(list: string[], last: string | undefined): string | undefined {
  return list[(list.indexOf(last ?? '') + 1) % list.length]
}

/** the taskbot the large map opens on and the first Tab stop: the worst score of the worst grade */
export function worstTaskbot(scores: Record<string, BotScore>): string | undefined {
  const order = gradeOrder(scores)
  return [...GRADES].reverse().map((g) => order[g][0]).find(Boolean)
}

/** taskbots in reading order of the layout: by column, then down (top to bottom layout: by row, then right) */
export function layoutOrder(nodes: { id: string; position: { x: number; y: number } }[], vertical: boolean): string[] {
  const [main, cross] = vertical ? (['y', 'x'] as const) : (['x', 'y'] as const)
  return [...nodes]
    .sort((a, b) => a.position[main] - b.position[main] || a.position[cross] - b.position[cross])
    .map((n) => n.id)
}

/** the node an arrow key moves to: right and down next, left and up previous, Home and End the ends */
export function arrowTarget(order: string[], current: string, key: string): string | undefined {
  const i = order.indexOf(current)
  if (i < 0) return undefined
  if (key === 'Home') return order[0]
  if (key === 'End') return order[order.length - 1]
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0
  return step ? order[Math.min(order.length - 1, Math.max(0, i + step))] : undefined
}

/** 'A ×16 · B ×19 · C ×1 · F ×7': each grade a button to the next taskbot with it, worst first */
export function GradeStrip({ scores, onShow }: { scores: Record<string, BotScore>; onShow: (path: string) => void }) {
  const t = useT()
  const plural = usePlural()
  const order = useMemo(() => gradeOrder(scores), [scores])
  const counts = useMemo(() => gradeDistribution(Object.values(scores)), [scores])
  const last = useRef<Partial<Record<BotScore['grade'], string>>>({})
  const present = GRADES.filter((g) => counts[g] > 0)
  if (!present.length) return null
  return (
    <div className="grade-strip" aria-labelledby="grade-strip-label" role="group">
      <span id="grade-strip-label" className="grade-strip-label">
        {t('canvas.grades')}
      </span>
      {present.map((g) => (
        <button
          key={g}
          type="button"
          aria-label={plural('canvas.grades.next', counts[g], { grade: g })}
          title={plural('canvas.grades.next', counts[g], { grade: g })}
          onClick={() => {
            const path = nextInCycle(order[g], last.current[g])
            if (!path) return
            last.current[g] = path
            onShow(path)
          }}
        >
          <GradeCount grade={g} count={counts[g]} />
        </button>
      ))}
    </div>
  )
}

/** Fix first on the map: the report's items from the same fixFirst() call; each opens its taskbot at the rule family.
 *  Closed at first at every width: open, it would cover the first rank of a large map */
export function MapFixFirst({
  analysis,
  onOpen,
}: {
  analysis: Pick<ProjectAnalysis, 'findings' | 'taskbots' | 'metrics' | 'scores'>
  onOpen: (path: string, group: string) => void
}) {
  const t = useT()
  const { items } = fixFirst(analysis)
  if (!items.length) return null
  const names = new Map(analysis.taskbots.map((b) => [b.path, b.name]))
  return (
    <details className="map-fix">
      <summary>{t('report.fixFirst')}</summary>
      <ol className="report-fix-list">
        {items.map((l) => (
          <li key={l.botPath + l.group}>
            <button type="button" className="report-lost-link" onClick={() => onOpen(l.botPath, l.group)}>
              <FixItemText name={names.get(l.botPath) ?? l.botPath} item={l} />
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

type Rect = { x: number; y: number; width: number; height: number }

/** The first view: fit the whole graph into the pane, but never below `floor`. The bottom-left
 *  corner (minimap and controls) and the strip at the top stay free of nodes: the graph goes right
 *  of the corner or above it, whichever gives the larger zoom. A graph that fits is centered. One
 *  that overflows at the floor centers `anchor` (the worst taskbot) on both axes, moved just enough
 *  that no node in `nodes` is cut at the top or lies under a panel in `panels`. `narrow` (top to bottom
 *  layout) fits the width only, so the widest rank fills the pane at a zoom of at least `floor`, and starts
 *  at the top of the graph.
 *  `detailZoom`: a zoom from it up to 1 would draw the detailed node text under 12 CSS px, so the view
 *  goes just under it instead, where compact nodes keep their text at 12 px. */
export function firstFitViewport(
  graph: Rect,
  pane: { width: number; height: number },
  { floor, anchor, nodes = [], panels = [], narrow = false, top = 0, corner = { width: 0, height: 0 }, pad = 24, maxZoom = 1, detailZoom }: {
    floor: number
    detailZoom?: number
    /** when the graph overflows, center this part of it instead of starting at the top left */
    anchor?: Rect
    /** the node boxes (flow units) and the panels on the map (pane pixels): the anchored view cuts
     *  no node at the top and puts none under a panel */
    nodes?: Rect[]
    panels?: Rect[]
    narrow?: boolean
    top?: number
    corner?: { width: number; height: number }
    pad?: number
    maxZoom?: number
  },
): { x: number; y: number; zoom: number; overflow: boolean } {
  const right = { x: corner.width, y: top, width: pane.width - corner.width, height: pane.height - top }
  const above = { x: 0, y: top, width: pane.width, height: pane.height - top - corner.height }
  const fit = (box: Rect) =>
    Math.min((box.width - 2 * pad) / graph.width, (box.height - 2 * pad) / graph.height, maxZoom)
  let box = fit(right) >= fit(above) ? right : above
  let zoom = fit(box)
  const overflow = zoom < floor
  if (narrow) {
    // the widest rank fits the width; a graph that also fits above the bottom controls at a zoom of at
    // least `floor` is shown whole, else the rest is reached by panning down
    const widthFit = Math.min((above.width - 2 * pad) / graph.width, maxZoom)
    const heightFit = (above.height - 2 * pad) / graph.height
    zoom = Math.max(floor, heightFit >= floor ? Math.min(widthFit, heightFit) : widthFit)
    box = above
  } else if (overflow) {
    zoom = floor
    // floor applied: keep the corner free either by starting right of it or by staying above it
    const fitsRight = graph.width * zoom <= right.width - 2 * pad
    const fitsAbove = graph.height * zoom <= above.height - 2 * pad
    box = !fitsRight && fitsAbove ? above : right
  }
  if (detailZoom !== undefined && zoom >= detailZoom && zoom < 1) zoom = detailZoom - 0.01
  const place = (start: number, room: number, size: number) => start + (size <= room - 2 * pad ? (room - size) / 2 : pad)
  // centered on the anchor, but no empty room before the graph's first edge or after its last one
  const center = (axis: 'x' | 'y', start: number, room: number, a: Rect) => {
    const pos = axis === 'x' ? 'x' : 'y'
    const size = axis === 'x' ? 'width' : 'height'
    return Math.max(
      Math.min(place(start, room, a[size] * zoom) - a[pos] * zoom, start + pad - graph[pos] * zoom),
      start + room - pad - (graph[pos] + graph[size]) * zoom,
    )
  }
  const wide = graph.width * zoom > box.width - 2 * pad
  const tall = graph.height * zoom > box.height - 2 * pad
  let x = place(box.x, box.width, graph.width * zoom) - graph.x * zoom
  if (wide && anchor) {
    x = center('x', box.x, box.width, anchor)
    if (overflow) x = clearX(x, { zoom, anchor, nodes, pane, pad })
  }
  let y = place(box.y, box.height, graph.height * zoom) - graph.y * zoom
  if (narrow && tall) {
    // top to bottom starts at the top of the graph, right under the panels, moved only to keep nodes from under one
    const start = { x: graph.x, y: graph.y, width: graph.width, height: 0 }
    // a quarter pane at most: further down the first ranks would leave the screen
    y = clearY(y, { x, zoom, anchor: start, nodes, panels, top, pane, pad, maxShift: pane.height / 4 })
  } else if (overflow && anchor && tall) {
    y = clearY(center('y', box.y, box.height, anchor), { x, zoom, anchor, nodes, panels, top, pane, pad })
  }
  return { x, y, zoom, overflow }
}

/** The view offset nearest `y0` that keeps the anchor in view, cuts no node at the pane top and
 *  puts no node under a panel; if no offset meets both, a node cut at the top is allowed before one
 *  under a panel (text under a panel collides with the panel text). */
function clearY(
  y0: number,
  { x, zoom, anchor, nodes, panels, top, pane, pad, maxShift = Infinity }: {
    maxShift?: number
    x: number
    zoom: number
    anchor: Rect
    nodes: Rect[]
    panels: Rect[]
    top: number
    pane: { width: number; height: number }
    pad: number
  },
): number {
  const valid = (y: number, strict: boolean, uncut = true) => {
    if (y + anchor.y * zoom < top || y + (anchor.y + anchor.height) * zoom > pane.height) return false
    return nodes.every((n) => {
      const t = y + n.y * zoom
      const b = t + n.height * zoom
      if (uncut && t < 0 && b > 0) return false
      const l = x + n.x * zoom
      const r = l + n.width * zoom
      return !strict || panels.every((p) => r <= p.x || l >= p.x + p.width || b <= p.y || t >= p.y + p.height)
    })
  }
  // the ends of every forbidden range, a small gap off: an offset that meets the rules is among them if one exists
  const gap = pad / 3
  const candidates = [y0]
  for (const n of nodes) {
    const t = n.y * zoom
    const b = (n.y + n.height) * zoom
    candidates.push(top + pad - t, gap - t, -gap - b)
    for (const p of panels) candidates.push(p.y + p.height + gap - t, p.y - gap - b)
  }
  const near = candidates.filter((y) => Math.abs(y - y0) <= maxShift)
  return nearest(y0, near, [(y) => valid(y, true), (y) => valid(y, true, false), (y) => valid(y, false)])
}

/** The same on the x axis, for a graph wider than the pane: no node cut at the left or the right
 *  edge; else none at the left (the start of the call chains). */
function clearX(
  x0: number,
  { zoom, anchor, nodes, pane, pad }: { zoom: number; anchor: Rect; nodes: Rect[]; pane: { width: number }; pad: number },
): number {
  const cut = (x: number, edge: number) => nodes.some((n) => x + n.x * zoom < edge && x + (n.x + n.width) * zoom > edge)
  const shown = (x: number) => x + anchor.x * zoom >= 0 && x + (anchor.x + anchor.width) * zoom <= pane.width
  const gap = pad / 3
  const candidates = [x0]
  for (const n of nodes) {
    const l = n.x * zoom
    const r = (n.x + n.width) * zoom
    candidates.push(gap - l, -gap - r, pane.width - gap - r, pane.width + gap - l)
  }
  return nearest(x0, candidates, [
    (x) => shown(x) && !cut(x, 0) && !cut(x, pane.width),
    (x) => shown(x) && !cut(x, 0),
  ])
}

/** the candidate nearest `v0` that passes the first rule any candidate passes; `v0` when none does */
function nearest(v0: number, candidates: number[], rules: ((v: number) => boolean)[]): number {
  candidates.sort((a, b) => Math.abs(a - v0) - Math.abs(b - v0))
  for (const rule of rules) {
    const found = candidates.find(rule)
    if (found !== undefined) return found
  }
  return v0
}

type FlowNode = Node<TBNodeData> | Node<FileNodeData>

/** call arrows: neutral at rest, gold for the hovered, focused or selected taskbot */
const callMarker = (active: boolean) => ({
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color: active ? 'var(--edge-call)' : 'var(--border-strong)',
})

export function displayEdges(
  edges: Edge[],
  detailed: boolean,
  selectedEdge: string | null,
  activeNodes: ReadonlySet<string> = new Set(),
): Edge[] {
  const visible = detailed ? edges : edges.filter((edge) => edge.id.startsWith('call:'))
  return visible.map((edge) => {
    if (edge.id === selectedEdge) return { ...edge, animated: true, selected: true }
    if (!activeNodes.has(edge.source) && !activeNodes.has(edge.target)) return edge
    // wires and calls of the hovered, focused or selected taskbot draw at full strength
    if (edge.id.startsWith('wire:')) return { ...edge, className: 'edge-wire active', zIndex: 1 }
    if (edge.id.startsWith('call:')) return { ...edge, className: 'edge-call active', markerEnd: callMarker(true), zIndex: 1 }
    return edge
  })
}

function buildFlow(a: ProjectAnalysis): { nodes: FlowNode[]; edges: Edge[] } {
  const byPath = new Map(a.taskbots.map((t) => [t.path, t]))
  const findingCounts = new Map<string, Record<Severity, number>>()
  for (const finding of a.findings) {
    const counts = findingCounts.get(finding.botPath) ?? { error: 0, warn: 0, info: 0 }
    counts[finding.severity]++
    findingCounts.set(finding.botPath, counts)
  }
  const inputNames = new Map<string, Set<string>>()
  const variableTypes = new Map<string, Map<string, string>>()
  for (const bot of a.taskbots) {
    const inputs = new Set<string>()
    const types = new Map<string, string>()
    for (const variable of bot.variables) {
      if (variable.input) inputs.add(variable.name)
      types.set(variable.name, variable.type)
    }
    inputNames.set(bot.path, inputs)
    variableTypes.set(bot.path, types)
  }

  // vars per bot that feed outgoing call wires
  const wireOut = new Map<string, Set<string>>()
  for (const e of a.edges) {
    for (const c of e.calls) {
      for (const i of c.inputs) {
        if (i.callerVars.length > 0) {
          const s = wireOut.get(e.from) ?? new Set()
          i.callerVars.forEach((v) => s.add(v))
          wireOut.set(e.from, s)
        }
      }
    }
  }

  const inCalls = new Set(a.edges.flatMap((e) => [e.from, e.to]))
  const nodes: FlowNode[] = []
  for (const bot of a.taskbots) {
    const vtypes = new Map(bot.variables.map((v) => [v.name, v.type]))
    const data: TBNodeData = {
      label: bot.name,
      path: bot.path,
      ghost: false,
      metrics: a.metrics[bot.path],
      score: a.scores[bot.path],
      inputVars: bot.variables.filter((v) => v.input).map((v) => ({ name: v.name, type: v.type })),
      wireOutVars: [...(wireOut.get(bot.path) ?? [])].map((n) => ({ name: n, type: vtypes.get(n) ?? 'ANY' })),
      outputVars: bot.variables.filter((v) => v.output).map((v) => v.name),
      findingsCount: SEVERITIES.reduce((sum, sev) => sum + (findingCounts.get(bot.path)?.[sev] ?? 0), 0),
      bySeverity: findingCounts.get(bot.path),
      uncalled: a.edges.length > 0 && !inCalls.has(bot.path),
    }
    nodes.push({ id: bot.path, type: 'taskbot', position: { x: 0, y: 0 }, data })
  }
  for (const g of a.ghostPaths) {
    nodes.push({
      id: g,
      type: 'taskbot',
      position: { x: 0, y: 0 },
      data: {
        label: g.split('/').pop() ?? g,
        path: g,
        ghost: true,
        inputVars: [],
        wireOutVars: [],
        outputVars: [],
        findingsCount: 0,
      },
    })
  }

  // static files that at least one taskbot references; shown as small nodes, never analyzed
  const referenced = new Set(a.fileEdges.map((fe) => fe.to))
  for (const f of a.otherFiles) {
    if (!referenced.has(f.path)) continue
    const label = f.path.split('/').pop() ?? f.path
    nodes.push({
      id: f.path,
      type: 'file',
      position: { x: 0, y: 0 },
      data: { label, path: f.path, kind: f.kind, ext: (label.split('.').pop() ?? '').toLowerCase() },
    })
  }

  const edges: Edge[] = []
  const seenWire = new Set<string>()
  for (const fe of a.fileEdges) {
    edges.push({
      id: 'file:' + fe.from + '→' + fe.to,
      source: fe.from,
      target: fe.to,
      sourceHandle: 'call-out',
      targetHandle: 'file-in',
      className: 'edge-file',
    })
  }
  for (const e of a.edges) {
    edges.push({
      id: 'call:' + e.from + '→' + e.to,
      source: e.from,
      target: e.to,
      sourceHandle: 'call-out',
      targetHandle: 'call-in',
      type: 'routed',
      className: 'edge-call',
      markerEnd: callMarker(false),
    })
    const callee = byPath.get(e.to)
    if (!callee) continue
    const calleeInputs = inputNames.get(callee.path)!
    const calleeTypes = variableTypes.get(callee.path)!
    for (const c of e.calls) {
      for (const i of c.inputs) {
        if (i.callerVars.length === 0 || !calleeInputs.has(i.calleeVar)) continue
        const src = i.callerVars[0]
        const key = e.from + '|' + src + '→' + e.to + '|' + i.calleeVar
        if (seenWire.has(key)) continue
        seenWire.add(key)
        edges.push({
          id: 'wire:' + key,
          source: e.from,
          target: e.to,
          sourceHandle: 'out:' + src,
          targetHandle: 'in:' + i.calleeVar,
          className: 'edge-wire',
          style: { stroke: typeColor(calleeTypes.get(i.calleeVar) ?? 'ANY') },
        })
      }
    }
  }
  return { nodes, edges }
}

type Laid = { positions: { id: string; x: number; y: number }[]; routes: { id: string; points: Point[] }[] }

const laidOut = (result: ElkNode): Laid => ({
  positions: result.children?.map((child) => ({ id: child.id, x: child.x ?? 0, y: child.y ?? 0 })) ?? [],
  routes: elkRoutes(result),
})

/** ELK's API on this thread, its layout code in a worker (elkjs README, "Web Worker" with workerFactory). */
export function layoutInWorker(graph: ElkNode, signal?: AbortSignal): Promise<Laid> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined
    const elk = new ElkApi({
      workerFactory: () => (worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })),
    })
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      elk.terminateWorker()
      callback()
    }
    const abort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')))
    // a worker script that fails to load or start never answers ELK's messages
    if (worker) worker.onerror = (event) => finish(() => reject(new Error(event.message)))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    elk.layout(graph).then(
      (result) => finish(() => resolve(laidOut(result))),
      (error) => finish(() => reject(error)),
    )
  })
}

/** Taskbots with no call and no file edge go in rows above the call chains (top to bottom layout
 *  only), wrapped at the chains' width, so they do not stack into a tall column. The rows are a band
 *  of their own, `gap.band` above the highest chain node or call route segment (`routes`) under them:
 *  a call bus never runs along them, and a root far off to the side does not push them up. */
export function isolateRows(
  isolates: { id: string; height: number }[],
  placed: Rect[],
  routes: Rect[] = [],
  gap = { node: 60, band: 100 },
): { id: string; x: number; y: number }[] {
  const rest = placed.length
    ? {
        x: Math.min(...placed.map((r) => r.x)),
        y: Math.min(...placed.map((r) => r.y)),
        width: Math.max(...placed.map((r) => r.x + r.width)) - Math.min(...placed.map((r) => r.x)),
      }
    : { x: 0, y: 0, width: 0 }
  const limit = Math.max(rest.width, NODE_WIDTH)
  const rows: { id: string; height: number }[][] = [[]]
  for (const node of isolates) {
    const row = rows[rows.length - 1]
    if (row.length && (row.length + 1) * NODE_WIDTH + row.length * gap.node > limit) rows.push([node])
    else row.push(node)
  }
  const span = Math.max(...rows.map((row) => row.length)) * (NODE_WIDTH + gap.node) - gap.node
  const under = [...placed, ...routes].filter((r) => r.x < rest.x + span && r.x + r.width > rest.x)
  const top = under.length ? Math.min(...under.map((r) => r.y)) : rest.y
  const heights = rows.map((row) => Math.max(...row.map((n) => n.height)))
  let y = top - gap.band - heights.reduce((sum, h) => sum + h, 0) - (rows.length - 1) * gap.node
  return rows.flatMap((row, i) => {
    const out = row.map((n, j) => ({ id: n.id, x: rest.x + j * (NODE_WIDTH + gap.node), y }))
    y += heights[i] + gap.node
    return out
  })
}

async function layout(
  nodes: FlowNode[],
  edges: Edge[],
  signal: AbortSignal,
  vertical: boolean,
  aspectRatio: number,
  sizeOf: (n: FlowNode) => { width: number; height: number },
  /** layout units between the band of taskbots with no calls and the call chains (top to bottom only) */
  bandGap = 100,
): Promise<{ nodes: FlowNode[]; routes: Map<string, Point[]> }> {
  // call + file edges shape the layout so assets settle next to the bot that uses them
  const links = edges.filter((e) => e.id.startsWith('call:') || e.id.startsWith('file:'))
  const linked = new Set(links.flatMap((e) => [e.source, e.target]))
  const isolates = vertical && linked.size ? nodes.filter((n) => !linked.has(n.id)) : []
  const laidByElk = isolates.length ? nodes.filter((n) => linked.has(n.id)) : nodes
  // ELK merges the edges of one port into a shared trunk. Each call leaves its caller by a port of its own, so it
  // has its own lane; the calls of one callee share its one in-port, so a shared stretch always ends at that callee
  // (RoutedEdge keeps each port's place on the side and marks where a lane joins)
  const side = (end: 'in' | 'out') => (vertical ? (end === 'in' ? 'NORTH' : 'SOUTH') : end === 'in' ? 'WEST' : 'EAST')
  const ports = new Map<string, { id: string; width: number; height: number; layoutOptions: Record<string, string> }[]>()
  const port = (node: string, end: 'in' | 'out', edge: string) => {
    const id = end === 'in' ? node + '#in' : node + '#out#' + edge
    const list = ports.get(node) ?? []
    if (!list.some((p) => p.id === id)) ports.set(node, [...list, { id, width: 0, height: 0, layoutOptions: { 'elk.port.side': side(end) } }])
    return id
  }
  const elkEdges = links.map((e) => ({ id: e.id, sources: [port(e.source, 'out', e.id)], targets: [port(e.target, 'in', e.id)] }))
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      // narrow panes: the call chain reads down the screen
      'elk.direction': vertical ? 'DOWN' : 'RIGHT',
      // packs separate call trees to the pane's shape; top to bottom stacks them, so the widest rank sets the width
      'elk.aspectRatio': String(vertical ? Math.min(aspectRatio, 0.2) : aspectRatio),
      // top to bottom, a rank lies across the narrow pane: a third of the gap between its nodes
      'elk.spacing.nodeNode': vertical ? '20' : '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
      'elk.edgeRouting': 'ORTHOGONAL',
      // each call its own lane, 12 apart, and 24 clear of every box it passes
      'elk.layered.mergeEdges': 'false',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
      'elk.spacing.edgeNode': '24',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      // a caller sits at the middle of its callees; top to bottom the narrowest placement, so the widest rank
      // fits a phone at a zoom that keeps compact text at 12 px
      'elk.layered.nodePlacement.strategy': vertical ? 'SIMPLE' : 'NETWORK_SIMPLEX',
    },
    children: laidByElk.map((n) => {
      const { width, height } = sizeOf(n)
      // ELK spreads the ports of a side over its length, in the order that crosses the fewest edges
      return { id: n.id, width, height, layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' }, ports: ports.get(n.id) ?? [] }
    }),
    edges: elkEdges,
  }
  let laid: Laid
  try {
    laid = await layoutInWorker(graph, signal)
  } catch {
    signal.throwIfAborted()
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default
    const result = await new ELK().layout(graph)
    signal.throwIfAborted()
    laid = laidOut(result)
  }
  const pos = new Map(laid.positions.map((child) => [child.id, { x: child.x, y: child.y }]))
  if (isolates.length) {
    const placed = laidByElk.map((n) => ({ ...n, position: pos.get(n.id) ?? { x: 0, y: 0 } }))
    // every route segment as a box, so the band also keeps clear of the call buses
    const segments = laid.routes.flatMap((r) =>
      r.points.slice(1).map((b, i) => {
        const a = r.points[i]
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
      }),
    )
    const rows = isolateRows(
      isolates.map((n) => ({ id: n.id, height: sizeOf(n).height })),
      placed.map((n) => fullGraphBounds([n], sizeOf)),
      segments,
      { node: 60, band: bandGap },
    )
    for (const p of rows) pos.set(p.id, { x: p.x, y: p.y })
  }
  return {
    nodes: nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? { x: 0, y: 0 } })),
    routes: new Map(laid.routes.map((r) => [r.id, r.points])),
  }
}

/** the detailed size of a node, in flow units */
export const detailSize = (n: FlowNode) =>
  n.type === 'file' ? { width: FILE_NODE_WIDTH, height: FILE_NODE_HEIGHT } : { width: NODE_WIDTH, height: nodeHeight(n.data as TBNodeData) }

export function fullGraphBounds(nodes: FlowNode[], sizeOf: (n: FlowNode) => { width: number; height: number } = detailSize) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const { width, height } = sizeOf(node)
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  }
  return nodes.length
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : { x: 0, y: 0, width: 0, height: 0 }
}

export default function Canvas({
  analysis,
  onSelect,
  focus,
  hint = false,
}: {
  analysis: ProjectAnalysis
  /** open a taskbot in the editor, at a rule family when given */
  onSelect: (path: string, rule?: string) => void
  focus?: { path: string; nonce: number } | null
  /** show the first-step line beside the grade strip */
  hint?: boolean
}) {
  const t = useT()
  const countText = usePlural()
  const { lang } = useContext(LangContext)
  const { nodes: rawNodes, edges } = useMemo(() => buildFlow(analysis), [analysis])
  const [nodes, setNodes] = useState<FlowNode[] | null>(null)
  // the ELK routes and the node positions they were made for (a drag moves a node off its route)
  const [routes, setRoutes] = useState<{ points: Map<string, Point[]>; at: Map<string, Point> }>(() => ({
    points: new Map(),
    at: new Map(),
  }))
  // the node that keeps the map's one Tab stop once it had focus
  const [lastFocused, setLastFocused] = useState<string | null>(null)
  // fit all must reach the whole graph, also a very wide one on a phone
  const [minZoom, setMinZoom] = useState(0.1)
  const [rf, setRf] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null)
  const [detailed, setDetailed] = useState(false)
  const [compact, setCompact] = useState(false)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  // the node to move keyboard focus to once it is rendered (grade strip, Show on map)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const [vertical, setVertical] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  const wrapRef = useRef<HTMLDivElement>(null)
  const floor = vertical ? FIT_FLOOR_NARROW : FIT_FLOOR
  // each taskbot gets the room its compact form needs at the floor zoom, so compact nodes never overlap;
  // left to right, a long name also makes the slot wider (top to bottom keeps the width for the phone)
  // kept per node data: the node and edge lists ask for it on every change of the nodes
  const slotSize = useMemo(() => {
    const sizes = new WeakMap<TBNodeData, { width: number; height: number }>()
    return (n: FlowNode) => {
      if (n.type === 'file') return detailSize(n)
      const d = n.data as TBNodeData
      let size = sizes.get(d)
      if (!size) {
        const width = vertical ? NODE_WIDTH : compactWidth(d, floor)
        size = { width, height: Math.max(nodeHeight(d), compactHeight(d, floor, width)) }
        sizes.set(d, size)
      }
      return size
    }
  }, [floor, vertical])
  // nodes are read through a ref here: keeping them in the effect's deps made every
  // drag (which rewrites the array) recentre the viewport mid-gesture
  const nodesRef = useRef<FlowNode[] | null>(null)
  nodesRef.current = nodes
  const handledFocus = useRef(-1)
  const initiallyFitted = useRef(false)
  // flips once when the async layout lands; unlike `nodes` it doesn't change on drag
  const layoutReady = nodes !== null

  // compact nodes scale their text by 1/zoom; a CSS variable avoids a React render per frame
  const applyZoom = useCallback((zoom: number) => {
    const el = wrapRef.current
    el?.style.setProperty('--zoom', String(zoom))
    // a data attribute, not a class: React rewrites className on re-render
    if (el) el.dataset.typeTags = String(zoom >= TYPE_TAG_ZOOM)
    setDetailed(isDetailZoom(zoom))
  }, [])

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY)
    const onChange = () => setVertical(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // accessible names, rebuilt only when the analysis or the language changes
  const labels = useMemo(() => {
    const number = new Intl.NumberFormat(lang).format
    return new Map(
      rawNodes.map((n) => {
        if (n.type === 'file') return [n.id, (n.data as FileNodeData).label]
        const d = n.data as TBNodeData
        if (d.ghost) return [n.id, translate(lang, 'node.aria.ghost', { name: d.label })]
        const name = translate(lang, 'node.aria', {
          name: d.label,
          grade: d.score?.grade ?? '',
          score: d.score ? number(d.score.score) : '',
          findings: plural(lang, 'report.group.count', d.findingsCount),
        })
        return [n.id, d.uncalled ? `${name}, ${translate(lang, 'node.uncalled')}` : name]
      }),
    )
  }, [rawNodes, lang])

  const types = useMemo(() => {
    const present = new Set<string>()
    for (const n of rawNodes) {
      if (n.type !== 'taskbot') continue
      const d = n.data as TBNodeData
      for (const v of [...d.inputVars, ...d.wireOutVars]) present.add(v.type)
    }
    return [...present].sort()
  }, [rawNodes])

  // centre, select and focus a node. Uses the laid-out geometry rather than fitView,
  // which silently does nothing until React Flow has measured the nodes.
  const showNode = useCallback(
    (path: string, zoom: number, focusNode = true) => {
      const node = nodesRef.current?.find((n) => n.id === path)
      if (!rf || !node) return false
      const w = node.type === 'file' ? FILE_NODE_WIDTH : NODE_WIDTH
      const h = node.type === 'file' ? FILE_NODE_HEIGHT : nodeHeight(node.data as TBNodeData)
      applyZoom(zoom)
      // duration 0: an animated pan depends on requestAnimationFrame, which never runs
      // while the tab is backgrounded, leaving the viewport silently unmoved
      void rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom, duration: 0 })
      // must return the same array when nothing changes, or the focus effect re-triggers itself
      setNodes((ns) => {
        if (!ns) return ns
        let changed = false
        const next = ns.map((n) => {
          const selected = n.id === path
          if (n.selected === selected) return n
          changed = true
          return { ...n, selected }
        })
        return changed ? next : ns
      })
      if (focusNode) setPendingFocus(path)
      return true
    },
    [rf, applyZoom],
  )

  // the editor's 'Show on map' (a new nonce each time)
  useEffect(() => {
    if (!focus || !rf || focus.nonce === handledFocus.current) return
    if (showNode(focus.path, Math.min(Math.max(rf.getZoom(), 0.6), 1.2))) handledFocus.current = focus.nonce
    // `nodes` deliberately excluded — see nodesRef above
  }, [focus, rf, layoutReady, showNode])

  useEffect(() => {
    if (!pendingFocus) return
    const el = wrapRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(pendingFocus)}"]`)
    if (!el) return // not rendered yet (large maps render only what is in view): retried on the next render
    el.focus({ preventScroll: true })
    setPendingFocus(null)
  })

  useEffect(() => {
    const controller = new AbortController()
    const pane = wrapRef.current ?? document.documentElement
    void layout(rawNodes, edges, controller.signal, vertical, pane.clientWidth / Math.max(1, pane.clientHeight), slotSize, BAND_GAP_PX / floor)
      .then((laidOut) => {
        initiallyFitted.current = false // every new layout gets its own first view
        setNodes(laidOut.nodes)
        setRoutes({ points: laidOut.routes, at: new Map(laidOut.nodes.map((n) => [n.id, n.position])) })
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error('Layout failed', error)
      })
    return () => {
      controller.abort()
    }
    // `vertical` re-runs the layout when the pane crosses the narrow width
  }, [rawNodes, edges, vertical, slotSize, floor])

  useEffect(() => {
    if (!rf || !nodes || initiallyFitted.current) return
    initiallyFitted.current = true
    const el = wrapRef.current
    if (!el) return
    const pane = el.getBoundingClientRect()
    // the panels stay free of nodes: those in the top half (grade strip; legend and controls when
    // narrow) as a band at the top, those in the bottom-left (minimap, controls) as a corner
    let top = 0
    let cornerRight = 0
    let cornerTop = pane.bottom
    const panels: Rect[] = []
    for (const part of el.querySelectorAll('.react-flow__minimap, .react-flow__controls, .map-head, .legend')) {
      const r = part.getBoundingClientRect()
      if (!r.width) continue
      panels.push({ x: r.left - pane.left, y: r.top - pane.top, width: r.width, height: r.height })
      if (r.top < pane.top + pane.height / 2) top = Math.max(top, r.bottom - pane.top)
      else if (r.left < pane.left + pane.width / 2) {
        cornerRight = Math.max(cornerRight, r.right - pane.left)
        cornerTop = Math.min(cornerTop, r.top)
      }
    }
    const called = new Set(edges.filter((e) => e.id.startsWith('call:')).map((e) => e.target))
    const roots = nodes.filter((n) => n.type === 'taskbot' && !called.has(n.id))
    const worst = nodes.find((n) => n.id === worstTaskbot(analysis.scores))
    const whole = fullGraphBounds(nodes, slotSize)
    const viewport = firstFitViewport(
      whole,
      { width: pane.width, height: pane.height },
      {
        floor,
        // an overflowing map opens on the worst taskbot; with no grades, top to bottom starts at the entry taskbots
        anchor: worst ? fullGraphBounds([worst], slotSize) : vertical && roots.length ? fullGraphBounds(roots, slotSize) : undefined,
        nodes: nodes.map((n) => fullGraphBounds([n], slotSize)),
        panels,
        narrow: vertical,
        // compact text is 12 px from zoom 1/3.4 (the --s cap) up: both floors are above it
        detailZoom: DETAIL_ZOOM,
        // a phone has no room to spare at the sides
        pad: vertical ? 12 : 24,
        top,
        corner: { width: cornerRight, height: pane.bottom - cornerTop },
      },
    )
    setMinZoom(Math.min(0.1, (0.9 * Math.min(pane.width / whole.width, pane.height / whole.height)) || 0.1))
    void rf.setViewport(viewport, { duration: 0 })
    applyZoom(viewport.zoom)
    // shown selected, not focused and not opened: the user decides what to open
    if (viewport.overflow && worst) setNodes((ns) => ns && ns.map((n) => (n.id === worst.id ? { ...n, selected: true } : n)))
    // `vertical` is read, not a trigger: the fit waits for the new layout's nodes
  }, [rf, nodes, edges, applyZoom, analysis.scores])

  const showDetails = detailed && !compact
  const isTaskbot = (n: FlowNode) => n.type === 'taskbot' && !(n.data as TBNodeData).ghost
  // arrow keys walk the taskbots in this order
  const order = useMemo(() => layoutOrder(nodes?.filter(isTaskbot) ?? [], vertical), [nodes, vertical])
  // roving tabindex: the map is one Tab stop, the last focused taskbot, else the selected, else the worst
  const tabStop = useMemo(() => {
    const has = (id: string | null | undefined) => (id && order.includes(id) ? id : undefined)
    return has(lastFocused) ?? has(nodes?.find((n) => n.selected)?.id) ?? has(worstTaskbot(analysis.scores)) ?? order[0]
  }, [order, lastFocused, nodes, analysis.scores])
  const shownNodes = useMemo(
    () =>
      (showDetails ? nodes : nodes?.filter((node) => node.type !== 'file'))?.map((node) => ({
        ...node,
        ariaLabel: labels.get(node.id),
        // a compact node grows with its name up to its layout slot (styles.css .tb-node.compact)
        style: { '--slot-w': slotSize(node).width + 'px' } as CSSProperties,
        // taskbots open the editor (Enter, Space, click); ghosts and file nodes are not tab stops
        ...(isTaskbot(node)
          // a button needs no "node" role description: React Flow sets it first, domAttributes override it
          ? { ariaRole: 'button' as const, domAttributes: { tabIndex: node.id === tabStop ? 0 : -1, 'aria-roledescription': undefined } }
          : { focusable: false, ariaRole: 'group' as const }),
      })),
    [showDetails, nodes, labels, tabStop, slotSize],
  )
  const shownEdges = useMemo(() => {
    const active = new Set(nodes?.filter((n) => n.selected).map((n) => n.id))
    if (hovered) active.add(hovered)
    if (focused) active.add(focused)
    // call edges carry the ELK route, where it put their two nodes and the size of their layout slots
    const byId = new Map(nodes?.map((n) => [n.id, n]))
    const callsIn = new Map<string, number>()
    for (const edge of edges) if (edge.type === 'routed') callsIn.set(edge.target, (callsIn.get(edge.target) ?? 0) + 1)
    const slot = (id: string) => {
      const node = byId.get(id)
      return node && slotSize(node)
    }
    const routed = edges.map((edge) => {
      const points = routes.points.get(edge.id)
      if (!points || edge.type !== 'routed') return edge
      const data: RoutedEdgeData = {
        points,
        sourceAt: routes.at.get(edge.source),
        targetAt: routes.at.get(edge.target),
        sourceSlot: slot(edge.source),
        targetSlot: slot(edge.target),
        joins: (callsIn.get(edge.target) ?? 0) > 1,
      }
      return { ...edge, data }
    })
    return displayEdges(routed, showDetails, selectedEdge, active)
  }, [showDetails, edges, selectedEdge, nodes, hovered, focused, routes, slotSize])
  const nodeId = (target: EventTarget) => {
    const el = target as HTMLElement
    return el.classList?.contains('react-flow__node') ? (el.dataset.id ?? null) : null
  }
  const onMove = useCallback(
    (_: MouseEvent | TouchEvent | null, viewport: { zoom: number }) => {
      wrapRef.current?.style.setProperty('--zoom', String(viewport.zoom))
    },
    [],
  )
  const onMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, viewport: { zoom: number }) => applyZoom(viewport.zoom),
    [applyZoom],
  )
  const minimapColor = useCallback((n: FlowNode) => {
    if (n.type === 'file') return 'var(--border-strong)'
    const d = n.data as TBNodeData
    if (d.ghost) return 'transparent'
    return d.score ? `var(--grade-${d.score.grade.toLowerCase()})` : 'var(--border-strong)'
  }, [])
  const isGhost = (n: FlowNode) => n.type === 'taskbot' && (n.data as TBNodeData).ghost
  // F gets a second channel in the minimap: a stroke in the text color
  const minimapClass = (n: FlowNode) =>
    isGhost(n) ? 'mm-ghost' : n.type === 'taskbot' && (n.data as TBNodeData).score ? 'mm-' + (n.data as TBNodeData).score!.grade : ''

  // React Flow sets role=application, but the map has no key model beyond its buttons: a labelled region
  useEffect(() => {
    wrapRef.current?.setAttribute('role', 'region')
  }, [layoutReady])

  // arrow keys move the focus between taskbots; off-screen ones on large maps are centered first
  const moveFocus = (id: string) => {
    const el = wrapRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
    if (el) return el.focus()
    const node = nodesRef.current?.find((n) => n.id === id)
    if (!rf || !node) return
    void rf.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + nodeHeight(node.data as TBNodeData) / 2, {
      zoom: rf.getZoom(),
      duration: 0,
    })
    setPendingFocus(id)
  }

  if (!shownNodes)
    return (
      <div className="canvas-loading" role="region" aria-label={t('canvas.label')} aria-busy="true">
        <p role="status">{countText('canvas.loading', analysis.taskbots.length)}</p>
        <a href="#report">{t('canvas.openReport')}</a>
      </div>
    )

  return (
    <DetailContext.Provider value={showDetails}>
     <VerticalContext.Provider value={vertical}>
      <ReactFlow
        ref={wrapRef}
        className={rawNodes.length > MINIMAP_NODE_LIMIT ? 'no-minimap' : undefined}
        ariaLabelConfig={{
          'controls.zoomIn.ariaLabel': t('canvas.zoomIn'),
          'controls.zoomOut.ariaLabel': t('canvas.zoomOut'),
          'controls.fitView.ariaLabel': t('canvas.fit'),
          'minimap.ariaLabel': t('canvas.minimap'),
          'node.a11yDescription.default': t('canvas.nodeHelp'),
        }}
        aria-label={t('canvas.label')}
        // a focused taskbot shows its wires like a hovered one
        onFocus={(e) => {
          const id = nodeId(e.target)
          setFocused(id)
          if (id) setLastFocused(id)
        }}
        onBlur={(e) => {
          if (nodeId(e.target)) setFocused(null)
        }}
        // arrow keys move the focus to the next or previous taskbot, never the node itself
        // (React Flow moves the selected node by default)
        onKeyDownCapture={(e) => {
          const id = nodeId(e.target)
          if (!id || !(e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) return
          e.stopPropagation()
          e.preventDefault()
          const next = arrowTarget(order, id, e.key)
          if (next && next !== id) moveFocus(next)
        }}
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        // nodes are never deleted from the map (Backspace would remove the selected one)
        deleteKeyCode={null}
        onInit={setRf}
        onNodesChange={(chs) => setNodes((ns) => (ns ? applyNodeChanges(chs, ns) : ns))}
        onNodeClick={(_, n) => {
          setSelectedEdge(null)
          if (n.type === 'taskbot' && !(n.data as TBNodeData).ghost) onSelect(n.id)
        }}
        // Enter or Space on a focused taskbot opens it like a click; React Flow only selects
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          const el = e.target as HTMLElement
          if (!el.classList.contains('react-flow__node')) return
          const node = nodesRef.current?.find((n) => n.id === el.dataset.id)
          if (node?.type !== 'taskbot' || (node.data as TBNodeData).ghost) return
          e.preventDefault()
          onSelect(node.id)
        }}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onEdgeClick={(_, edge) => setSelectedEdge(edge.id.startsWith('call:') ? edge.id : null)}
        onMove={onMove}
        onMoveEnd={onMoveEnd}
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable={false}
        onlyRenderVisibleElements={rawNodes.length > RENDER_ALL_LIMIT}
        autoPanOnNodeFocus
        minZoom={minZoom}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        {/* DOM order is Tab order: the strip comes right after the map's one Tab stop */}
        {/* the strip; under it Fix first and the first-step hint (the open list takes a row of its own) */}
        <Panel position="top-left" className="map-head">
          <GradeStrip scores={analysis.scores} onShow={(path) => showNode(path, rf?.getZoom() ?? 1)} />
          <div className="map-head-row">
            <MapFixFirst
              analysis={analysis}
              onOpen={(path, group) => {
                // selected and centered, not focused: focus goes into the editor
                showNode(path, rf?.getZoom() ?? 1, false)
                onSelect(path, group)
              }}
            />
            {hint && <p className="map-hint">{t('canvas.hint')}</p>}
          </div>
        </Panel>
        {rawNodes.length <= MINIMAP_NODE_LIMIT && (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            style={{ width: MINIMAP_W, height: MINIMAP_H }}
            nodeColor={minimapColor}
            nodeStrokeColor={(n) => (isGhost(n) ? 'var(--border-strong)' : 'transparent')}
            nodeStrokeWidth={8}
            maskStrokeColor="var(--text-muted)"
            maskStrokeWidth={1}
            nodeClassName={minimapClass}
          />
        )}
        {/* narrow panes: a row at the bottom, so the top keeps one row for the strip and the legend */}
        <Controls
          position="bottom-left"
          orientation={vertical ? 'horizontal' : 'vertical'}
          showInteractive={false}
        >
          <ControlButton
            className={'compact-toggle' + (compact ? ' active' : '')}
            title={t('canvas.compact')}
            aria-label={t('canvas.compact')}
            aria-pressed={compact}
            onClick={() => setCompact((value) => !value)}
          >
            <Icon name="minimize-2" />
          </ControlButton>
        </Controls>
        <Legend types={types} detailed={showDetails} />
      </ReactFlow>
     </VerticalContext.Provider>
    </DetailContext.Provider>
  )
}
