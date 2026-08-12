import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import type { ElkNode } from 'elkjs/lib/elk-api'
import '@xyflow/react/dist/style.css'
import type { ProjectAnalysis } from '../../core/model'
import TaskbotNode from './TaskbotNode'
import FileNode from './FileNode'
import {
  DetailContext,
  FILE_NODE_HEIGHT,
  FILE_NODE_WIDTH,
  NODE_WIDTH,
  nodeHeight,
  typeColor,
  type FileNodeData,
  type TBNodeData,
} from './nodeTypes'
import { useT } from '../i18n'

const nodeTypes = { taskbot: TaskbotNode, file: FileNode }

/** minimap size is fixed so the zoom controls can be parked right beside it */
const MINIMAP_W = 190
const MINIMAP_H = 130
const DETAIL_ZOOM = 0.25
const MINIMAP_NODE_LIMIT = 100

const LEGEND_KEYS = ['call', 'wire', 'ghost', 'file'] as const

/** Folded to a single row by default — expanded it covered too much canvas.
 *  Opens on click, closes again as soon as the pointer or focus leaves. */
function Legend() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // fold as soon as attention moves elsewhere: focus or a click outside, or Escape.
  // Document-level listeners rather than onBlur, which never fired reliably here.
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as HTMLElement | null)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('focusin', away)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('focusin', away)
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={'legend' + (open ? ' open' : '')} onPointerLeave={() => setOpen(false)}>
      <button className="legend-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="legend-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {t('canvas.legend.title')}
      </button>
      {open && (
        <dl className="legend-body">
          {LEGEND_KEYS.map((k) => (
            <div className="legend-item" key={k}>
              <dt>
                <i className={'leg-' + k} /> {t('canvas.legend.' + k)}
              </dt>
              <dd>{t('canvas.legend.' + k + '.desc')}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

type FlowNode = Node<TBNodeData> | Node<FileNodeData>

export function displayEdges(edges: Edge[], detailed: boolean, selectedEdge: string | null): Edge[] {
  const visible = detailed ? edges : edges.filter((edge) => edge.id.startsWith('call:'))
  return visible.map((edge) => (edge.id === selectedEdge ? { ...edge, animated: true, selected: true } : edge))
}

function buildFlow(a: ProjectAnalysis): { nodes: FlowNode[]; edges: Edge[] } {
  const byPath = new Map(a.taskbots.map((t) => [t.path, t]))
  const findingCounts = new Map<string, number>()
  for (const finding of a.findings) {
    findingCounts.set(finding.botPath, (findingCounts.get(finding.botPath) ?? 0) + 1)
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
      findingsCount: findingCounts.get(bot.path) ?? 0,
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
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#ffb900' },
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
          style: { stroke: typeColor(calleeTypes.get(i.calleeVar) ?? 'ANY'), strokeWidth: 1.5 },
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

async function layout(nodes: FlowNode[], edges: Edge[], signal: AbortSignal): Promise<FlowNode[]> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
    },
    children: nodes.map((n) =>
      n.type === 'file'
        ? { id: n.id, width: FILE_NODE_WIDTH, height: FILE_NODE_HEIGHT }
        : { id: n.id, width: NODE_WIDTH, height: nodeHeight(n.data as TBNodeData) },
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

export function fullGraphBounds(nodes: FlowNode[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const width = node.type === 'file' ? FILE_NODE_WIDTH : NODE_WIDTH
    const height = node.type === 'file' ? FILE_NODE_HEIGHT : nodeHeight(node.data as TBNodeData)
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
  const { nodes: rawNodes, edges } = useMemo(() => buildFlow(analysis), [analysis])
  const [nodes, setNodes] = useState<FlowNode[] | null>(null)
  const [rf, setRf] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null)
  const [detailed, setDetailed] = useState(false)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // nodes are read through a ref here: keeping them in the effect's deps made every
  // drag (which rewrites the array) recentre the viewport mid-gesture
  const nodesRef = useRef<FlowNode[] | null>(null)
  nodesRef.current = nodes
  const handledFocus = useRef(-1)
  const initiallyFitted = useRef(false)
  // flips once when the async layout lands; unlike `nodes` it doesn't change on drag
  const layoutReady = nodes !== null

  // centre the node a report row asked for. Uses the laid-out geometry rather than
  // fitView, which silently does nothing until React Flow has measured the nodes.
  useEffect(() => {
    if (!focus || !rf || focus.nonce === handledFocus.current) return
    const node = nodesRef.current?.find((n) => n.id === focus.path)
    if (!node) return
    handledFocus.current = focus.nonce
    const w = node.type === 'file' ? FILE_NODE_WIDTH : NODE_WIDTH
    const h = node.type === 'file' ? FILE_NODE_HEIGHT : nodeHeight(node.data as TBNodeData)
    const zoom = Math.min(Math.max(rf.getZoom(), 0.6), 1.2)
    setDetailed(zoom >= DETAIL_ZOOM)
    // duration 0: an animated pan depends on requestAnimationFrame, which never runs
    // while the tab is backgrounded, leaving the viewport silently unmoved
    rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom, duration: 0 })
    // must return the same array when nothing changes, or this effect re-triggers itself
    setNodes((ns) => {
      if (!ns) return ns
      let changed = false
      const next = ns.map((n) => {
        const selected = n.id === focus.path
        if (n.selected === selected) return n
        changed = true
        return { ...n, selected }
      })
      return changed ? next : ns
    })
    // `nodes` deliberately excluded — see nodesRef above
  }, [focus, rf, layoutReady])

  useEffect(() => {
    const controller = new AbortController()
    void layout(rawNodes, edges, controller.signal)
      .then(setNodes)
      .catch((error) => {
        if (!controller.signal.aborted) console.error('Layout failed', error)
      })
    return () => {
      controller.abort()
    }
  }, [rawNodes, edges])

  useEffect(() => {
    if (!rf || !nodes || initiallyFitted.current) return
    initiallyFitted.current = true
    void rf.fitBounds(fullGraphBounds(nodes), { padding: 0.1, duration: 0 }).then(() => {
      setDetailed(rf.getZoom() >= DETAIL_ZOOM)
    })
  }, [rf, nodes])

  const shownNodes = useMemo(
    () => (detailed ? nodes : nodes?.filter((node) => node.type !== 'file')),
    [detailed, nodes],
  )
  const shownEdges = useMemo(
    () => displayEdges(edges, detailed, selectedEdge),
    [detailed, edges, selectedEdge],
  )
  const onMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, viewport: { zoom: number }) => {
      setDetailed(viewport.zoom >= DETAIL_ZOOM)
    },
    [],
  )

  if (!shownNodes) return <div className="canvas-loading">…</div>

  return (
    <DetailContext.Provider value={detailed}>
      <ReactFlow
        className={rawNodes.length > MINIMAP_NODE_LIMIT ? 'no-minimap' : undefined}
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        onInit={setRf}
        onNodesChange={(chs) => setNodes((ns) => (ns ? applyNodeChanges(chs, ns) : ns))}
        onNodeClick={(_, n) => {
          setSelectedEdge(null)
          if (n.type === 'taskbot' && !(n.data as TBNodeData).ghost) onSelect(n.id)
        }}
        onEdgeClick={(_, edge) => setSelectedEdge(edge.id.startsWith('call:') ? edge.id : null)}
        onMoveEnd={onMoveEnd}
        nodesDraggable
        onlyRenderVisibleElements
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        {rawNodes.length <= MINIMAP_NODE_LIMIT && (
          <MiniMap position="bottom-left" pannable zoomable style={{ width: MINIMAP_W, height: MINIMAP_H }} />
        )}
        <Controls position="bottom-left" showInteractive={false} />
        <Legend />
      </ReactFlow>
    </DetailContext.Provider>
  )
}
