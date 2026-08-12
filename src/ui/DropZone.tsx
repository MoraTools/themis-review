import { useContext, useEffect, useRef, useState } from 'react'
import type { ProjectAnalysis } from '../core/model'
import { HERO_PHRASES, LangContext, useT } from './i18n'
import heroArt from './assets/themis-dither-square.png'

export function analyzeInWorker(
  zips: { name: string; data: Uint8Array }[],
  signal?: AbortSignal,
): Promise<ProjectAnalysis> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../core/analyze.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      callback()
    }
    const abort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')))
    worker.onmessage = (event: MessageEvent<{ analysis?: ProjectAnalysis; error?: string }>) => {
      finish(() => {
        if (event.data.analysis) resolve(event.data.analysis)
        else reject(new Error(event.data.error ?? 'Analysis failed'))
      })
    }
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message)))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    try {
      worker.postMessage(zips, zips.map((zip) => zip.data.buffer as ArrayBuffer))
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

export default function DropZone({ onAnalyzed }: { onAnalyzed: (a: ProjectAnalysis) => void }) {
  const t = useT()
  const { lang } = useContext(LangContext)
  const [phraseIdx] = useState(() => Math.floor(Math.random() * HERO_PHRASES.en.length))
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeAnalysis = useRef<AbortController | null>(null)

  useEffect(() => () => activeAnalysis.current?.abort(), [])

  const handleFiles = async (files: FileList | File[]) => {
    activeAnalysis.current?.abort()
    const controller = new AbortController()
    activeAnalysis.current = controller
    setError(null)
    try {
      const zips = await Promise.all(
        [...files]
          .filter((f) => f.name.toLowerCase().endsWith('.zip'))
          .map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
      )
      if (controller.signal.aborted || zips.length === 0) return
      const a = await analyzeInWorker(zips, controller.signal)
      if (a.taskbots.length === 0) {
        setError(t('drop.error'))
        return
      }
      onAnalyzed(a)
    } catch (e) {
      if (!controller.signal.aborted) setError(String(e))
    } finally {
      if (activeAnalysis.current === controller) activeAnalysis.current = null
    }
  }

  return (
    <main className="hero">
      <div className="hero-visual" aria-hidden="true">
        <img src={heroArt} alt="" />
      </div>
      <p className="kicker">{t('drop.kicker')}</p>
      <h1 className="display">{HERO_PHRASES[lang][phraseIdx]}</h1>
      <p className="hero-hint">{t('drop.hint')}</p>

      <div
        className={drag ? 'dropzone drag' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-tabs">
          <span className="dropzone-tab active">{t('drop.tab')}</span>
        </div>
        <div className="dropzone-body">
          <span className="prompt">$</span>
          <span className="dropzone-cmd">{t('drop.title')}</span>
          <button
            className="btn primary"
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
          >
            {t('drop.button')}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <footer className="credit">{t('credit')}</footer>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        multiple
        hidden
        onChange={(e) => e.target.files && void handleFiles(e.target.files)}
      />
    </main>
  )
}
