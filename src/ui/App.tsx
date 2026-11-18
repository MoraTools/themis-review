import { useContext, useEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { LangContext, useNumber, useT, type Lang } from './i18n'
import { ThemeToggles } from './ThemeToggles'
import { Icon, SeverityIcon } from './Icons'
import DropZone, { useBusyText, useUpload } from './DropZone'
import Canvas from './canvas/Canvas'
import EditorDrawer from './editor/EditorDrawer'
import Report from './report/Report'
import Rules from './rules/Rules'
import {
  cleanStart, closeEditor, editorEntry, pageTitle, pushEditor, shellReducer, startShell, tabHref, uploaded, viewFromHash,
  type Selection, type View,
} from './shared/selection'
import { Grade } from './shared/Grade'
import { DEFAULT_SEVERITY_ON, severityFilterReducer } from './findings/SeverityFilter'
import { includedList } from './findings/findings'
import type { BotScore } from '../core/model'

const VIEWS: View[] = ['map', 'report', 'rules']

/** YYYY-MM-DD in local time, as the report date: toISOString() is UTC and can name the next or previous day */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** the view tabs are links to the view hashes; the upload view has no hash, so its tab goes there through onUpload */
export function ViewTabs({ view, hasAnalysis, uploadHref, onUpload }: {
  view: View
  hasAnalysis: boolean
  /** the clean address of the upload view */
  uploadHref: string
  onUpload: () => void
}) {
  const t = useT()
  return (
    <nav className="tabs" aria-label={t('nav.views')}>
      {/* without an upload the map tab is the way back to the drop zone; the rule reference stands on its own */}
      {VIEWS.filter((v) => hasAnalysis || v !== 'report').map((v) => {
        const href = tabHref(v, hasAnalysis)
        return (
          <a
            key={v}
            className={view === v ? 'tab active' : 'tab'}
            href={href ?? uploadHref}
            aria-current={view === v ? 'page' : undefined}
            onClick={href ? undefined : (e) => { e.preventDefault(); onUpload() }}
          >
            {v === 'map' && !hasAnalysis ? t('tab.upload') : t('tab.' + v)}
          </a>
        )
      })}
    </nav>
  )
}

/** the project score opens the report, where the taskbot summary explains it */
export function ScoreBadge({ score }: { score: BotScore }) {
  const t = useT()
  const number = useNumber()
  return (
    <a className="score-badge" href="#report" aria-label={t('score.open', { grade: score.grade, score: number(score.score) })}>
      <span className="score-badge-label">{t('score.project')}</span>
      <Grade score={score} className="score-badge-value grade-chip" />
    </a>
  )
}

function Shell() {
  const t = useT()
  const { lang } = useContext(LangContext)
  const busyText = useBusyText()
  const [{ analysis, nav: { view, selection, mapFocus } }, dispatch] = useReducer(shellReducer, location.hash, startShell)
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
    if (!analysis) cleanStart(history, location)
    focusHeading.current = true
    dispatch({ type: 'view', view: viewFromHash(location.hash, !!analysis) })
  }
  useEffect(() => {
    window.addEventListener('hashchange', showHashView)
    return () => window.removeEventListener('hashchange', showHashView)
  })
  // a tab link sets the hash, which adds a history entry; the upload view has no hash, so its tab comes here
  const goToUpload = () => {
    if (location.hash) {
      history.pushState(null, '', location.pathname + location.search)
      showHashView()
    }
  }

  // the open editor is one history entry with the same URL and the selection in its state; Back closes it
  // the map's first-step hint shows until the first editor open of this page (a reload also drops the analysis)
  const [editorOpened, setEditorOpened] = useState(false)
  const open = (next: Selection) => {
    setEditorOpened(true)
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
    document.title = pageTitle(view, !!analysis, t)
  }, [view, analysis, lang])
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
    // focus goes to the map h1, as on a view change: the drop zone and its focused button are gone
    uploaded(history, next, (action) => { dispatch(action); dispatchSeverity(action) }, focusHeading)
  })
  // a rule id goes to its row in the Rules view, like a tab but with focus on the row. From the report it adds an
  // entry; from the editor it replaces the editor entry, so Back returns to the view the editor was opened from
  const showRule = (ruleId: string, fromEditor: boolean) => {
    if (fromEditor) history.replaceState(null, '', '#rules')
    else history.pushState(null, '', '#rules')
    flushSync(() => {
      if (fromEditor) dispatch({ type: 'close' })
      dispatch({ type: 'view', view: 'rules' })
    })
    const row = document.getElementById('rule-' + ruleId)
    row?.scrollIntoView({ block: 'center' })
    row?.focus({ preventScroll: true })
  }

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
      document.title = `Themis - ${names} - ${localDate(new Date())}`
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
          <ViewTabs view={view} hasAnalysis={!!analysis} uploadHref={location.pathname + location.search} onUpload={goToUpload} />
        </div>

        {analysis && (
          <div className="header-zone header-right">
            <ScoreBadge score={analysis.projectScore} />
            {/* at 480px and below these show a short label: 'PDF', 'New' */}
            <div className="header-tools">
              {/* one click from every view; the name says which severities the PDF includes */}
              <button className="btn primary" aria-label={t('header.exportScope', { list: includedList(sevOn, lang) })} title={t('header.exportScope', { list: includedList(sevOn, lang) })} onClick={() => window.print()}>
                <Icon name="download" /><span className="btn-label">{t('header.export')}</span><span className="btn-short">{t('header.export.short')}</span>
              </button>
              <button
                ref={newButton}
                className="btn"
                aria-label={t('header.reset')}
                title={t('header.reset')}
                aria-disabled={upload.busy > 0}
                onClick={pick}
              ><Icon name="plus" /><span className="btn-label">{t('header.reset')}</span><span className="btn-short">{t('header.reset.short')}</span></button>
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

      {/* aria-busy is on the view content, not on main: the drop zone status inside main must be announced */}
      <main id="main" className="app-main" tabIndex={-1}>
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
        <div className="canvas-wrap no-print" hidden={view !== 'map'} aria-busy={upload.busy > 0}>
          <h1 className="sr-only">{t('tab.map')}</h1>
          <Canvas
            analysis={analysis}
            focus={mapFocus}
            hint={!editorOpened}
            onSelect={(path, rule) => open({ path, from: 'map', rule })}
          />
        </div>
      )}
      {analysis && view === 'report' && (
        <Report
          analysis={analysis}
          onOpen={(path, line, variable) => open({ path, from: 'report', line, variable })}
          sevOn={sevOn}
          onToggleSeverity={(severity) => dispatchSeverity({ type: 'severity', severity })}
          onRule={(ruleId) => showRule(ruleId, false)}
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
          key={selection.path + ':' + (selection.line ?? '') + ':' + (selection.variable ?? '') + ':' + (selection.rule ?? '')}
          analysis={analysis}
          botPath={selection.path}
          line={selection.line}
          variable={selection.variable}
          rule={selection.rule}
          onClose={() => closeEditor(history, closeNow)}
          onShowOnMap={() => {
            // the map centers and selects the node from nav.mapFocus; focus goes to the node
            setReturnTo({ path: selection.path, from: 'map' })
            // the editor entry becomes the map entry, so Back returns to the view before it
            history.replaceState(null, '', '#map')
            dispatch({ type: 'showOnMap', path: selection.path })
          }}
          onRule={(ruleId) => showRule(ruleId, true)}
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
