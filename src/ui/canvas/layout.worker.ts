import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'

const elk = new ELK()

self.onmessage = async (event: MessageEvent<ElkNode>) => {
  try {
    const result = await elk.layout(event.data)
    self.postMessage({
      positions: result.children?.map((child) => ({ id: child.id, x: child.x ?? 0, y: child.y ?? 0 })) ?? [],
    })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
