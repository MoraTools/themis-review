import { useContext, useEffect, useRef, useState, type RefObject } from 'react'
import type { ProjectAnalysis } from '../core/model'
import { HERO_PHRASES, LangContext, useT } from './i18n'
import { SeverityIcon } from './Icons'
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

/** why an upload failed, with the file name(s) to show; translated as `drop.error.<kind>` */
export type UploadError = { kind: 'notZip' | 'damaged' | 'noTaskbot' | 'failed'; name: string }

/** read, check and analyze the chosen files; null when a newer upload aborted this one */
export async function analyzeFiles(
  files: File[],
  signal?: AbortSignal,
): Promise<{ analysis: ProjectAnalysis } | { error: UploadError } | null> {
  const names = files.map((f) => f.name).join(', ')
  try {
    const zips: { name: string; data: Uint8Array }[] = []
    for (const f of files) {
      const data = new Uint8Array(await f.arrayBuffer())
      // every ZIP starts with the "PK" signature
      if (data[0] !== 0x50 || data[1] !== 0x4b) return { error: { kind: 'notZip', name: f.name } }
      zips.push({ name: f.name, data })
    }
    if (signal?.aborted) return null
    const analysis = await analyzeInWorker(zips, signal)
    if (analysis.taskbots.length === 0) return { error: { kind: 'noTaskbot', name: names } }
    return { analysis }
  } catch {
    if (signal?.aborted) return null
    // the worker reports only the parser message: find the archive the parser rejects
    try {
      const { readZip } = await import('../core/zip')
      for (const f of files) {
        try {
          readZip(f.name, new Uint8Array(await f.arrayBuffer()))
        } catch {
          return { error: { kind: 'damaged', name: f.name } }
        }
      }
    } catch {
      // the files cannot be read again: fall through to the general message
    }
    return { error: { kind: 'failed', name: names } }
  }
}

/** one upload at a time: the number of files in progress (0 when idle) and the last error */
export function useUpload(onAnalyzed: (a: ProjectAnalysis) => void) {
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<UploadError | null>(null)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])

  const run = async (files: File[]) => {
    if (files.length === 0) return
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setError(null)
    setBusy(files.length)
    const result = await analyzeFiles(files, controller.signal)
    if (controller.signal.aborted || !result) return
    active.current = null
    setBusy(0)
    if ('analysis' in result) onAnalyzed(result.analysis)
    else setError(result.error)
  }
  return { busy, error, run }
}

/** the "Analyzing N files…" text for a busy upload */
export function useBusyText() {
  const t = useT()
  return (n: number) => (n === 1 ? t('drop.busy.one') : t('drop.busy', { n: String(n) }))
}

export default function DropZone({ busy, error, onPick, onFiles, buttonRef }: {
  busy: number
  error: UploadError | null
  onPick: () => void
  onFiles: (files: File[]) => void
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  const busyText = useBusyText()
  const { lang } = useContext(LangContext)
  const [phraseIdx] = useState(() => Math.floor(Math.random() * HERO_PHRASES.en.length))
  const [drag, setDrag] = useState(false)

  return (
    <div className="hero">
      <div className="hero-visual" aria-hidden="true">
        <img src={heroArt} alt="" />
      </div>
      <h1 className="sr-only">{t('tab.upload')}</h1>
      <p className="display">{HERO_PHRASES[lang][phraseIdx]}</p>
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
          if (!busy) onFiles([...e.dataTransfer.files])
        }}
        onClick={() => !busy && onPick()}
      >
          <div className="dropzone-tabs">
            <span className="dropzone-tab active">{t('drop.tab')}</span>
          </div>
          <div className="dropzone-body">
            <span className="prompt" aria-hidden="true">$</span>
            <span className="dropzone-cmd">{t('drop.title')}</span>
            <button
              ref={buttonRef}
              className="btn primary"
              aria-disabled={busy > 0}
              onClick={(e) => {
                e.stopPropagation()
                if (!busy) onPick()
              }}
            >
              <span className="btn-label">{t('drop.button')}</span>
              <span className="btn-arrow" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </div>
      </div>
      <div className="upload-status" role="status">{busy > 0 && <p>{busyText(busy)}</p>}</div>
      {/* the line is reserved even when empty, so the hero does not move when an error appears */}
      <p className="error drop-error" role="alert">
        {error && <><SeverityIcon severity="error" />{t('drop.error.' + error.kind, { name: error.name })}</>}
      </p>
      <footer className="credit">{t('credit')}</footer>
    </div>
  )
}
