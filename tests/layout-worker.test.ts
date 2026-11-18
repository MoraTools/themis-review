import { afterEach, describe, expect, it, vi } from 'vitest'
import ElkApi from 'elkjs/lib/elk-api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('layout worker', () => {
  it('answers the ELK API from a worker scope', async () => {
    // a worker scope: self, no document
    const scope: { onmessage?: (event: { data: unknown }) => void; postMessage: (data: unknown) => void } = {
      postMessage: (data) => port.onmessage?.({ data }),
    }
    const port: { onmessage?: (event: { data: unknown }) => void; postMessage: (data: unknown) => void; terminate: () => void } = {
      postMessage: (data) => setTimeout(() => scope.onmessage?.({ data })),
      terminate: () => {},
    }
    vi.stubGlobal('self', scope)
    await import('../src/ui/canvas/layout.worker')
    expect(scope.onmessage).toBeTypeOf('function')

    const elk = new ElkApi({ workerFactory: () => port as unknown as Worker })
    const result = await elk.layout({
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered' },
      children: [{ id: 'a', width: 10, height: 10 }, { id: 'b', width: 10, height: 10 }],
      edges: [{ id: 'e', sources: ['a'], targets: ['b'] }],
    })
    const [a, b] = result.children!
    expect(b.x!).toBeGreaterThan(a.x!)
  })
})
