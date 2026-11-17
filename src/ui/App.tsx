import { useEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { LangContext, useT, type Lang } from './i18n'
import { ThemeToggles } from './ThemeToggles'
import { Icon, SeverityIcon } from './Icons'
import DropZone, { useBusyText, useUpload } from './DropZone'
import Canvas from './canvas/Canvas'
import EditorDrawer from './editor/EditorDrawer'
import Report from './report/Report'
import Rules from './rules/Rules'
import { initialShell, shellReducer } from './shared/selection'
import { Grade } from './shared/Grade'
import { DEFAULT_SEVERITY_ON, severityFilterReducer } from './findings/SeverityFilter'

function Shell() {
  const t = useT()
  const busyText = useBusyText()
  const [{ analysis, nav: { view, selection } }, dispatch] = useReducer(shellReducer, initialShell)
  // the report filter lives here, so view switches keep it and Export PDF from any view prints with it
  const [sevOn, dispatchSeverity] = useReducer(severityFilterReducer, DEFAULT_SEVERITY_ON)
  const setView = (next: typeof view) => dispatch({ type: 'view', view: next })
  // where focus goes back after the editor closes: the opener in the view it came from
  const [returnTo, setReturnTo] = useState<{ path: string; from: 'map' | 'report' } | null>(null)

  // one file picker for "Choose files" and "New analysis"; the old analysis stays until a new one succeeds
  const fileInput = useRef<HTMLInputElement>(null)
  const chooseButton = useRef<HTMLButtonElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const upload = useUpload((next) => {
    setReturnTo(null)
    dispatch({ type: 'loaded', analysis: next })
    dispatchSeverity({ type: 'loaded', analysis: next })
  })
  // after a failed upload, focus goes back to the button that chooses files
  useEffect(() => {
    if (upload.error) (newButton.current ?? chooseButton.current)?.focus()
  }, [upload.error])

  useEffect(() => {
    if (!returnTo) return
    const selector = returnTo.from === 'report'
      ? `.report [data-bot="${CSS.escape(returnTo.path)}"]`
      : `.react-flow__node[data-id="${CSS.escape(returnTo.path)}"]`
    // the report keeps its own focus (the dialog restores it to the opener); only fill in when focus was lost
    const focused = document.activeElement
    if (!focused || focused === document.body) document.querySelector<HTMLElement>(selector)?.focus()
    setReturnTo(null)
  }, [returnTo])

  // Export PDF and Ctrl+P from any view print the report, with the zip names and date as the PDF file name
  useEffect(() => {
    if (!analysis) return
    let title = document.title
    const before = () => {
      title = document.title
      flushSync(() => dispatch({ type: 'view', view: 'report' }))
      const names = analysis.zipNames.map((n) => n.replace(/\.zip$/i, '')).join(', ')
      document.title = `Themis - ${names} - ${new Date().toISOString().slice(0, 10)}`
    }
    const after = () => { document.title = title }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [analysis])

  return (
    <div className="app">
      <a className="skip-link no-print" href="#main">{t('skip.main')}</a>
      <header className="header no-print">
        <div className="brand">
          <span className="brand-name">Themis</span>
          <span className="brand-sub">Review</span>
        </div>
        <div className="header-zone header-left">
          <nav className="tabs" aria-label={t('nav.views')}>
            {/* without an upload the map tab is the way back to the drop zone */}
            <button className={view === 'map' ? 'tab active' : 'tab'} aria-current={view === 'map' ? 'page' : undefined} onClick={() => setView('map')}>
              {analysis ? t('tab.map') : t('tab.upload')}
            </button>
            {analysis && (
              <button
                className={view === 'report' ? 'tab active' : 'tab'}
                aria-current={view === 'report' ? 'page' : undefined}
                onClick={() => setView('report')}
              >
                {t('tab.report')}
              </button>
            )}
            {/* the rule reference stands on its own, with or without an upload */}
            <button
              className={view === 'rules' ? 'tab active' : 'tab'}
              aria-current={view === 'rules' ? 'page' : undefined}
              onClick={() => setView('rules')}
            >
              {t('tab.rules')}
            </button>
          </nav>
        </div>

        {analysis && (
          <div className="header-zone header-right">
            <span className="score-badge">
              <span className="score-badge-label">{t('score.project')}</span>
              <Grade score={analysis.projectScore} className="score-badge-value" />
            </span>
            {/* at 480px and below these show only their icon */}
            <div className="header-tools">
              <button className="btn primary" aria-label={t('header.export')} title={t('header.export')} onClick={() => window.print()}>
                <Icon name="download" /><span className="btn-label">{t('header.export')}</span>
              </button>
              <button
                ref={newButton}
                className="btn"
                aria-label={t('header.reset')}
                title={t('header.reset')}
                disabled={upload.busy > 0}
                aria-busy={upload.busy > 0}
                onClick={() => fileInput.current?.click()}
              ><Icon name="plus" /><span className="btn-label">{t('header.reset')}</span></button>
            </div>
          </div>
        )}
        <ThemeToggles />
      </header>

      {analysis && (
        <div className="upload-bar no-print">
          <div className="upload-status" role="status">{upload.busy > 0 && <p>{busyText(upload.busy)}</p>}</div>
          {/* always rendered, so the alert region exists before the message */}
          <p className="error" role="alert">
            {upload.error && <><SeverityIcon severity="error" />{t('drop.error.' + upload.error.kind, { name: upload.error.name })}</>}
          </p>
        </div>
      )}

      <main id="main" className="app-main" tabIndex={-1}>
      {!analysis && view !== 'rules' && (
        <DropZone
          busy={upload.busy}
          error={upload.error}
          onPick={() => fileInput.current?.click()}
          onFiles={(files) => void upload.run(files)}
          buttonRef={chooseButton}
        />
      )}
      {view === 'rules' && <Rules analysis={analysis} />}
      {analysis && (
        <div className="canvas-wrap no-print" hidden={view !== 'map'}>
          <h1 className="sr-only">{t('tab.map')}</h1>
          <Canvas analysis={analysis} onSelect={(path) => dispatch({ type: 'open', path, from: 'map' })} />
        </div>
      )}
      {analysis && view === 'report' && (
        <Report
          analysis={analysis}
          onOpen={(path, line) => dispatch({ type: 'open', path, from: 'report', line })}
          sevOn={sevOn}
          onToggleSeverity={(severity) => dispatchSeverity({ type: 'severity', severity })}
          onRule={(ruleId) => {
            flushSync(() => setView('rules'))
            const row = document.getElementById('rule-' + ruleId)
            row?.scrollIntoView({ block: 'center' })
            row?.focus({ preventScroll: true })
          }}
        />
      )}
      </main>
      <input
        ref={fileInput}
        type="file"
        accept=".zip"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = '' // choosing the same file again still fires change
          void upload.run(files)
        }}
      />
      {analysis && selection && (
        <EditorDrawer
          // a new open (other bot, other line) starts a fresh editor
          key={selection.path + ':' + (selection.line ?? '')}
          analysis={analysis}
          botPath={selection.path}
          from={selection.from}
          line={selection.line}
          onClose={() => {
            setReturnTo({ path: selection.path, from: selection.from })
            dispatch({ type: 'close' })
          }}
        />
      )}
    </div>
  )
}

declare global {
  interface Window {
    SuitePreferences: { setLang: (lang: Lang) => void; toggleTheme: () => void }
  }
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => document.documentElement.lang === 'es' ? 'es' : 'en')
  useEffect(() => {
    const sync = () => setLangState(document.documentElement.lang === 'es' ? 'es' : 'en')
    document.addEventListener('suite:lang', sync)
    return () => document.removeEventListener('suite:lang', sync)
  }, [])
  return (
    <LangContext.Provider value={{ lang, setLang: (next) => window.SuitePreferences.setLang(next) }}>
      <Shell />
    </LangContext.Provider>
  )
}
