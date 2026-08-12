import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Edge } from '@xyflow/react'
import { analyzeInWorker } from '../src/ui/DropZone'
import { displayEdges, fullGraphBounds, layoutInWorker } from '../src/ui/canvas/Canvas'

class WorkerStub {
  static instances: WorkerStub[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false

  constructor() {
    WorkerStub.instances.push(this)
  }

  postMessage() {}

  terminate() {
    this.terminated = true
  }
}

afterEach(() => {
  WorkerStub.instances = []
  vi.unstubAllGlobals()
})

const edges: Edge[] = [
  { id: 'call:a→b', source: 'a', target: 'b' },
  { id: 'wire:a→b', source: 'a', target: 'b' },
  { id: 'file:a→c', source: 'a', target: 'c' },
]

describe('large graph rendering', () => {
  it('keeps only call edges in overview and animates only the selected edge', () => {
    expect(displayEdges(edges, false, null)).toEqual([edges[0]])
    expect(displayEdges(edges, true, 'call:a→b')).toEqual([
      { ...edges[0], animated: true, selected: true },
      edges[1],
      edges[2],
    ])
  })

  it('fits against full taskbot dimensions and file nodes', () => {
    expect(
      fullGraphBounds([
        {
          id: 'bot',
          type: 'taskbot',
          position: { x: 10, y: 20 },
          data: {
            label: 'bot',
            path: 'bot',
            ghost: false,
            inputVars: [{ name: 'a', type: 'STRING' }, { name: 'b', type: 'STRING' }, { name: 'c', type: 'STRING' }],
            wireOutVars: [],
            outputVars: [],
            findingsCount: 0,
          },
        },
        {
          id: 'file',
          type: 'file',
          position: { x: 500, y: 300 },
          data: { label: 'file', path: 'file', kind: 'asset', ext: 'png' },
        },
      ]),
    ).toEqual({ x: 10, y: 20, width: 660, height: 332 })
  })

  it('terminates obsolete analysis and layout workers', async () => {
    vi.stubGlobal('Worker', WorkerStub)
    const analysisController = new AbortController()
    const analysis = analyzeInWorker([], analysisController.signal)
    analysisController.abort()
    await expect(analysis).rejects.toMatchObject({ name: 'AbortError' })

    const layoutController = new AbortController()
    const positions = layoutInWorker({ id: 'root' }, layoutController.signal)
    layoutController.abort()
    await expect(positions).rejects.toMatchObject({ name: 'AbortError' })
    expect(WorkerStub.instances.map((worker) => worker.terminated)).toEqual([true, true])
  })
})
