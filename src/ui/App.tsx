import { useContext, useEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { LangContext, useT, type Lang } from './i18n'
import { ThemeToggles } from './ThemeToggles'
import { Icon, SeverityIcon } from './Icons'
import DropZone, { useBusyText, useUpload } from './DropZone'
import Canvas from './canvas/Canvas'
import EditorDrawer from './editor/EditorDrawer'
import Report from './report/Report'
import Rules from './rules/Rules'
import {
  cleanStart, closeEditor, editorEntry, initialShell, pageTitle, pushEditor, shellReducer, viewFromHash,
  type Selection, type View,
} from './shared/selection'
import { Grade } from './shared/Grade'
import { DEFAULT_SEVERITY_ON, severityFilterReducer } from './findings/SeverityFilter'
import { includedList } from './findings/findings'

function Shell() {
  const t = useT()
  const { lang } = useContext(LangContext)
  const busyText = useBusyText()
  const [{ analysis, nav: { view, selection, mapFocus } }, dispatch] = useReducer(shellReducer, initialShell)
  // the report filter lives here, so view switches keep it and Export PDF from any view prints with it
  const [sevOn, dispatchSeverity] = useReducer(severityFilterReducer, DEFAULT_SEVERITY_ON)
  // where focus goes back after the editor closes: the opener in the view it came from
  const [returnTo, setReturnTo] = useState<{ path: string; from: 'map' | 'report' } | null>(null)
  // set by a tab, Back or Forward, so the next render moves focus to the view's h1 (not on the first load)
  const focusHeading = useRef(false)
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  // the view lives in the hash (#map, #report, #rules) and nothing else: an address is what people copy and send
  useEffect(() => cleanStart(history, location), [])
  const showHashView = () => {
    if (!analysis && location.hash && location.hash !== '#rules') cleanStart(history, location)
    focusHeading.current = true
    dispatch({ type: 'view', view: viewFromHash(location.hash, !!analysis) })
  }
  useEffect(() => {
    window.addEventListener('hashchange', showHashView)
    return () => window.removeEventListener('hashchange', showHashView)
  })
  // a tab click sets the hash, which adds a history entry; the upload view has no hash
  const goTo = (next: View) => {
    if (analysis || next === 'rules') location.hash = next
    else if (location.hash) {
      history.pushState(null, '', location.pathname + location.search)
      showHashView()
    }
  }

  // the open editor is one history entry with the same URL and the selection in its state; Back closes it
  const open = (next: Selection) => {
    pushEditor(history, next)
    dispatch({ type: 'open', ...next })
  }
  const closeNow = () => {
    const current = selectionRef.current
    if (!current) return
    setReturnTo({ path: current.path, from: current.from })
    dispatch({ type: 'close' })
  }
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const entry = editorEntry(event.state)
      if (entry && analysis?.taskbots.some((b) => b.path === entry.path)) dispatch({ type: 'open', ...entry })
      else closeNow()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })

  useEffect(() => {
    const bot = selection && analysis?.taskbots.find((b) => b.path === selection.path)
    document.title = pageTitle(view, !!analysis, t, bot ? bot.name : undefined)
  }, [view, analysis, selection, lang])
  useEffect(() => {
    if (!focusHeading.current) return
    focusHeading.current = false
    const heading = [...document.querySelectorAll<HTMLElement>('#main h1')].find((h) => !h.closest('[hidden]'))
    if (!heading) return
    heading.tabIndex = -1
    heading.focus()
  }, [view, analysis])

  // one file picker for "Choose files" and "New analysis"; the old analysis stays until a new one succeeds
  const fileInput = useRef<HTMLInputElement>(null)
  const chooseButton = useRef<HTMLButtonElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const upload = useUpload((next) => {
    setReturnTo(null)
    // replace, not push: Back from the first map must not return to an upload page with the analysis gone
    history.replaceState(null, '', '#map')
    dispatch({ type: 'loaded', analysis: next })
    dispatchSeverity({ type: 'loaded', analysis: next })
  })
  const pick = () => {
    if (upload.busy === 0) fileInput.current?.click()
  }
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
      // keep the hash in step with the view, so the Map tab still changes the hash after printing
      history.replaceState(history.state, '', '#report')
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
            <button className={view === 'map' ? 'tab active' : 'tab'} aria-current={view === 'map' ? 'page' : undefined} onClick={() => goTo('map')}>
              {analysis ? t('tab.map') : t('tab.upload')}
            </button>
            {analysis && (
              <button
                className={view === 'report' ? 'tab active' : 'tab'}
                aria-current={view === 'report' ? 'page' : undefined}
                onClick={() => goTo('report')}
              >
                {t('tab.report')}
              </button>
            )}
            {/* the rule reference stands on its own, with or without an upload */}
            <button
              className={view === 'rules' ? 'tab active' : 'tab'}
              aria-current={view === 'rules' ? 'page' : undefined}
              onClick={() => goTo('rules')}
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
              {/* one click from every view; the name says which severities the PDF includes */}
              <button className="btn primary" aria-label={t('header.exportScope', { list: includedList(sevOn, lang) })} title={t('header.exportScope', { list: includedList(sevOn, lang) })} onClick={() => window.print()}>
                <Icon name="download" /><span className="btn-label">{t('header.export')}</span>
              </button>
              <button
                ref={newButton}
                className="btn"
                aria-label={t('header.reset')}
                title={t('header.reset')}
                aria-disabled={upload.busy > 0}
                onClick={pick}
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

      <main id="main" className="app-main" tabIndex={-1} aria-busy={upload.busy > 0}>
      {!analysis && view !== 'rules' && (
        <DropZone
          busy={upload.busy}
          error={upload.error}
          onPick={pick}
          onFiles={(files) => void upload.run(files)}
          buttonRef={chooseButton}
        />
      )}
      {view === 'rules' && <Rules analysis={analysis} />}
      {analysis && (
        <div className="canvas-wrap no-print" hidden={view !== 'map'}>
          <h1 className="sr-only">{t('tab.map')}</h1>
          <Canvas analysis={analysis} focus={mapFocus} onSelect={(path) => open({ path, from: 'map' })} />
        </div>
      )}
      {analysis && view === 'report' && (
        <Report
          analysis={analysis}
          onOpen={(path, line, variable) => open({ path, from: 'report', line, variable })}
          sevOn={sevOn}
          onToggleSeverity={(severity) => dispatchSeverity({ type: 'severity', severity })}
          onRule={(ruleId) => {
            // a view change like a tab, without the h1 focus: focus goes to the rule row
            history.pushState(null, '', '#rules')
            flushSync(() => dispatch({ type: 'view', view: 'rules' }))
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
          key={selection.path + ':' + (selection.line ?? '') + ':' + (selection.variable ?? '')}
          analysis={analysis}
          botPath={selection.path}
          line={selection.line}
          variable={selection.variable}
          onClose={() => closeEditor(history, closeNow)}
          onShowOnMap={() => {
            // the map centers and selects the node from nav.mapFocus; focus goes to the node
            setReturnTo({ path: selection.path, from: 'map' })
            // the editor entry becomes the map entry, so Back returns to the view before it
            history.replaceState(null, '', '#map')
            dispatch({ type: 'showOnMap', path: selection.path })
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
