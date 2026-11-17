import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
import type { ElkNode } from 'elkjs/lib/elk-api'
import '@xyflow/react/dist/style.css'
import type { BotScore, ProjectAnalysis, Severity } from '../../core/model'
import TaskbotNode from './TaskbotNode'
import FileNode from './FileNode'
import {
  DetailContext,
  FILE_NODE_HEIGHT,
  FILE_NODE_WIDTH,
  NODE_WIDTH,
  compactHeight,
  nodeHeight,
  SEVERITIES,
  STAT_ICONS,
  typeColor,
  VerticalContext,
  type FileNodeData,
  type TBNodeData,
} from './nodeTypes'
import { Icon, SeverityIcon } from '../Icons'
import { LangContext, plural, translate, useNumber, usePlural, useT } from '../i18n'
import { gradeDistribution } from '../findings/findings'

const nodeTypes = { taskbot: TaskbotNode, file: FileNode }

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
 *  0.5 shows the most whole taskbots at 1440x900, 0.4 at 390x844 (top to bottom). */
const FIT_FLOOR = 0.5
const FIT_FLOOR_NARROW = 0.4
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

/** Folded to a single row by default — expanded it covered too much canvas. */
function Legend({ types }: { types: string[] }) {
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

  return (
    <div ref={ref} className={'legend' + (open ? ' open' : '')}>
      <button className="legend-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="legend-caret" aria-hidden="true">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        </span>
        {t('canvas.legend.title')}
      </button>
      {open && (
        <div className="legend-body" tabIndex={0} role="region" aria-label={t('canvas.legend.title')}>
          <p className="legend-group">{t('canvas.legend.grades')}</p>
          <ul className="legend-row">
            {GRADES.map((g) => (
              <li key={g} className={'grade-' + g}>
                <i className="leg-swatch" /> {g}
              </li>
            ))}
          </ul>
          <p className="legend-group">{t('canvas.legend.stats')}</p>
          <ul className="legend-grid">
            {(Object.keys(STAT_ICONS) as (keyof typeof STAT_ICONS)[]).map((k) => (
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
            {LEGEND_KEYS.map((k) => (
              <div className="legend-item" key={k}>
                <dt>
                  <i className={'leg-' + k} /> {t('canvas.legend.' + k)}
                </dt>
                <dd>{t('canvas.legend.' + k + '.desc')}</dd>
              </div>
            ))}
          </dl>
          {types.length > 0 && (
            <>
              <p className="legend-group">{t('canvas.legend.types')}</p>
              <ul className="legend-row">
                {types.map((type) => (
                  <li key={type}>
                    <i className="leg-dot" style={{ background: typeColor(type) }} /> {type}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
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

/** 'A 16 · B 19 · C 1 · F 7': each grade a button to the next taskbot with it, worst first */
function GradeStrip({ scores, onShow }: { scores: Record<string, BotScore>; onShow: (path: string) => void }) {
  const t = useT()
  const plural = usePlural()
  const number = useNumber()
  const order = useMemo(() => gradeOrder(scores), [scores])
  const counts = useMemo(() => gradeDistribution(Object.values(scores)), [scores])
  const last = useRef<Partial<Record<BotScore['grade'], string>>>({})
  const present = GRADES.filter((g) => counts[g] > 0)
  if (!present.length) return null
  return (
    <Panel position="top-left" className="grade-strip" aria-label={t('canvas.grades')} role="group">
      {present.map((g) => (
        <button
          key={g}
          type="button"
          className={'grade grade-' + g}
          aria-label={plural('canvas.grades.next', counts[g], { grade: g })}
          title={plural('canvas.grades.next', counts[g], { grade: g })}
          onClick={() => {
            const path = nextInCycle(order[g], last.current[g])
            if (!path) return
            last.current[g] = path
            onShow(path)
          }}
        >
          <span className="grade-letter">{g}</span> <span className="grade-score">{number(counts[g])}</span>
        </button>
      ))}
    </Panel>
  )
}

type Rect = { x: number; y: number; width: number; height: number }

/** The first view: fit the whole graph into the pane, but never below `floor`. The bottom-left
 *  corner (minimap and controls) and the strip at the top stay free of nodes: the graph goes right
 *  of the corner or above it, whichever gives the larger zoom. A graph that fits is centered; one
 *  that overflows starts at the left (the root column) and at the top, with padding. */
export function firstFitViewport(
  graph: Rect,
  pane: { width: number; height: number },
  { floor, anchor, top = 0, corner = { width: 0, height: 0 }, pad = 24, maxZoom = 1 }: {
    floor: number
    /** when the graph is wider than the pane, center this part of it instead of starting at the left */
    anchor?: Rect
    top?: number
    corner?: { width: number; height: number }
    pad?: number
    maxZoom?: number
  },
): { x: number; y: number; zoom: number } {
  const right = { x: corner.width, y: top, width: pane.width - corner.width, height: pane.height - top }
  const above = { x: 0, y: top, width: pane.width, height: pane.height - top - corner.height }
  const fit = (box: Rect) =>
    Math.min((box.width - 2 * pad) / graph.width, (box.height - 2 * pad) / graph.height, maxZoom)
  let box = fit(right) >= fit(above) ? right : above
  let zoom = fit(box)
  if (zoom < floor) {
    zoom = floor
    // floor applied: keep the corner free either by starting right of it or by staying above it
    const fitsRight = graph.width * zoom <= right.width - 2 * pad
    const fitsAbove = graph.height * zoom <= above.height - 2 * pad
    box = !fitsRight && fitsAbove ? above : right
  }
  const place = (start: number, room: number, size: number) => start + (size <= room - 2 * pad ? (room - size) / 2 : pad)
  const wide = graph.width * zoom > box.width - 2 * pad
  // centered on the anchor, but no empty room left of the graph's left edge or right of its right edge
  const anchored =
    anchor &&
    Math.max(
      Math.min(place(box.x, box.width, anchor.width * zoom) - anchor.x * zoom, box.x + pad - graph.x * zoom),
      box.x + box.width - pad - (graph.x + graph.width) * zoom,
    )
  return {
    x: wide && anchored !== undefined ? anchored : place(box.x, box.width, graph.width * zoom) - graph.x * zoom,
    y: place(box.y, box.height, graph.height * zoom) - graph.y * zoom,
    zoom,
  }
}

type FlowNode = Node<TBNodeData> | Node<FileNodeData>

export function displayEdges(
  edges: Edge[],
  detailed: boolean,
  selectedEdge: string | null,
  activeNodes: ReadonlySet<string> = new Set(),
): Edge[] {
  const visible = detailed ? edges : edges.filter((edge) => edge.id.startsWith('call:'))
  return visible.map((edge) => {
    if (edge.id === selectedEdge) return { ...edge, animated: true, selected: true }
    // wires of the hovered or selected taskbot draw at full strength
    if (edge.id.startsWith('wire:') && (activeNodes.has(edge.source) || activeNodes.has(edge.target)))
      return { ...edge, className: 'edge-wire active', zIndex: 1 }
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
      className: 'edge-call',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: 'var(--edge-call)' },
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

export function layoutInWorker(
  graph: ElkNode,
  signal?: AbortSignal,
): Promise<{ id: string; x: number; y: number }[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      callback()
    }
    const abort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')))
    worker.onmessage = (
      event: MessageEvent<{ positions?: { id: string; x: number; y: number }[]; error?: string }>,
    ) => {
      finish(() => {
        if (event.data.positions) resolve(event.data.positions)
        else reject(new Error(event.data.error ?? 'Layout failed'))
      })
    }
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message)))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    try {
      worker.postMessage(graph)
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

async function layout(
  nodes: FlowNode[],
  edges: Edge[],
  signal: AbortSignal,
  vertical: boolean,
  aspectRatio: number,
  heightOf: (d: TBNodeData) => number,
): Promise<FlowNode[]> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      // narrow panes: the call chain reads down the screen
      'elk.direction': vertical ? 'DOWN' : 'RIGHT',
      // packs separate call trees to the pane's shape
      'elk.aspectRatio': String(aspectRatio),
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
    },
    children: nodes.map((n) =>
      n.type === 'file'
        ? { id: n.id, width: FILE_NODE_WIDTH, height: FILE_NODE_HEIGHT }
        : { id: n.id, width: NODE_WIDTH, height: heightOf(n.data as TBNodeData) },
    ),
    // call + file edges shape the layout so assets settle next to the bot that uses them
    edges: edges
      .filter((e) => e.id.startsWith('call:') || e.id.startsWith('file:'))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
  let positions: { id: string; x: number; y: number }[]
  try {
    positions = await layoutInWorker(graph, signal)
  } catch {
    signal.throwIfAborted()
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default
    const result = await new ELK().layout(graph)
    signal.throwIfAborted()
    positions =
      result.children?.map((child) => ({ id: child.id, x: child.x ?? 0, y: child.y ?? 0 })) ?? []
  }
  const pos = new Map(positions.map((child) => [child.id, { x: child.x, y: child.y }]))
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? { x: 0, y: 0 } }))
}

export function fullGraphBounds(nodes: FlowNode[], heightOf: (d: TBNodeData) => number = nodeHeight) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const width = node.type === 'file' ? FILE_NODE_WIDTH : NODE_WIDTH
    const height = node.type === 'file' ? FILE_NODE_HEIGHT : heightOf(node.data as TBNodeData)
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
}: {
  analysis: ProjectAnalysis
  onSelect: (path: string) => void
  focus?: { path: string; nonce: number } | null
}) {
  const t = useT()
  const { lang } = useContext(LangContext)
  const { nodes: rawNodes, edges } = useMemo(() => buildFlow(analysis), [analysis])
  const [nodes, setNodes] = useState<FlowNode[] | null>(null)
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
  // each taskbot gets the room its compact form needs at the floor zoom, so compact nodes never overlap
  const slotHeight = useCallback((d: TBNodeData) => Math.max(nodeHeight(d), compactHeight(d, floor)), [floor])
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
        return [
          n.id,
          translate(lang, 'node.aria', {
            name: d.label,
            grade: d.score?.grade ?? '',
            score: d.score ? number(d.score.score) : '',
            findings: plural(lang, 'report.group.count', d.findingsCount),
          }),
        ]
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
    (path: string, zoom: number) => {
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
      setPendingFocus(path)
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
    void layout(rawNodes, edges, controller.signal, vertical, pane.clientWidth / Math.max(1, pane.clientHeight), slotHeight)
      .then((laidOut) => {
        initiallyFitted.current = false // every new layout gets its own first view
        setNodes(laidOut)
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error('Layout failed', error)
      })
    return () => {
      controller.abort()
    }
    // `vertical` re-runs the layout when the pane crosses the narrow width
  }, [rawNodes, edges, vertical, slotHeight])

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
    for (const part of el.querySelectorAll('.react-flow__minimap, .react-flow__controls, .grade-strip, .legend')) {
      const r = part.getBoundingClientRect()
      if (!r.width) continue
      if (r.top < pane.top + pane.height / 2) top = Math.max(top, r.bottom - pane.top)
      else if (r.left < pane.left + pane.width / 2) {
        cornerRight = Math.max(cornerRight, r.right - pane.left)
        cornerTop = Math.min(cornerTop, r.top)
      }
    }
    const called = new Set(edges.filter((e) => e.id.startsWith('call:')).map((e) => e.target))
    const roots = nodes.filter((n) => n.type === 'taskbot' && !called.has(n.id))
    const viewport = firstFitViewport(
      fullGraphBounds(nodes, slotHeight),
      { width: pane.width, height: pane.height },
      {
        floor,
        // top to bottom: the entry taskbots start centered (left to right they are the left column anyway)
        anchor: vertical && roots.length ? fullGraphBounds(roots, slotHeight) : undefined,
        top,
        corner: { width: cornerRight, height: pane.bottom - cornerTop },
      },
    )
    void rf.setViewport(viewport, { duration: 0 })
    applyZoom(viewport.zoom)
    // `vertical` is read, not a trigger: the fit waits for the new layout's nodes
  }, [rf, nodes, edges, applyZoom])

  const showDetails = detailed && !compact
  const shownNodes = useMemo(
    () =>
      (showDetails ? nodes : nodes?.filter((node) => node.type !== 'file'))?.map((node) => ({
        ...node,
        ariaLabel: labels.get(node.id),
        // taskbots open the editor (Enter, Space, click); file nodes are not tab stops
        ...(node.type === 'file'
          ? { focusable: false }
          : (node.data as TBNodeData).ghost
            ? {}
            : { ariaRole: 'button' as const }),
      })),
    [showDetails, nodes, labels],
  )
  const shownEdges = useMemo(() => {
    const active = new Set(nodes?.filter((n) => n.selected).map((n) => n.id))
    if (hovered) active.add(hovered)
    if (focused) active.add(focused)
    return displayEdges(edges, showDetails, selectedEdge, active)
  }, [showDetails, edges, selectedEdge, nodes, hovered, focused])
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

  if (!shownNodes)
    return (
      <div className="canvas-loading" role="status">
        {t('canvas.loading')}
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
        }}
        aria-label={t('canvas.label')}
        // a focused taskbot shows its wires like a hovered one
        onFocus={(e) => setFocused(nodeId(e.target))}
        onBlur={(e) => {
          if (nodeId(e.target)) setFocused(null)
        }}
        // arrow keys never move a node (React Flow moves the selected one by default)
        onKeyDownCapture={(e) => {
          if (e.key.startsWith('Arrow') && nodeId(e.target)) e.stopPropagation()
        }}
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
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
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        {rawNodes.length <= MINIMAP_NODE_LIMIT && (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            style={{ width: MINIMAP_W, height: MINIMAP_H }}
            nodeColor={minimapColor}
            nodeStrokeColor={(n) => (isGhost(n) ? 'var(--border-strong)' : 'transparent')}
            nodeStrokeWidth={8}
            nodeClassName={(n) => (isGhost(n) ? 'mm-ghost' : '')}
          />
        )}
        {/* narrow panes: a row under the grade strip, so the bottom corner stays free for the call chain */}
        <Controls
          position={vertical ? 'top-left' : 'bottom-left'}
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
        <GradeStrip scores={analysis.scores} onShow={(path) => showNode(path, rf?.getZoom() ?? 1)} />
        <Legend types={types} />
      </ReactFlow>
     </VerticalContext.Provider>
    </DetailContext.Provider>
  )
}
