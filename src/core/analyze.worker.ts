import { analyzeZips } from './analyze'

self.onmessage = (event: MessageEvent<{ name: string; data: Uint8Array }[]>) => {
  try {
    self.postMessage({ analysis: analyzeZips(event.data) })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
