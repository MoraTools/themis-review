import { useEffect, useReducer, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ProjectAnalysis } from '../core/model'
import { LangContext, useT, useNumber, type Lang } from './i18n'
import { ThemeToggles } from './ThemeToggles'
import DropZone from './DropZone'
import Canvas from './canvas/Canvas'
import EditorDrawer from './editor/EditorDrawer'
import Report from './report/Report'
import Rules from './rules/Rules'
import { initialNav, navReducer } from './shared/selection'

function Shell() {
  const t = useT()
  const number = useNumber()
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null)
  const [{ view, selection }, dispatch] = useReducer(navReducer, initialNav)
  const setView = (next: typeof view) => dispatch({ type: 'view', view: next })
  // where focus goes back after the editor closes: the opener in the view it came from
  const [returnTo, setReturnTo] = useState<{ path: string; from: 'map' | 'report' } | null>(null)

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
      <header className="header no-print">
        <div className="brand">
          <span className="brand-name">Themis</span>
          <span className="brand-sub">Review</span>
        </div>
        <div className="header-zone header-left">
          <nav className="tabs">
            {/* without an upload the map tab is the way back to the drop zone */}
            <button className={view === 'map' ? 'tab active' : 'tab'} onClick={() => setView('map')}>
              {analysis ? t('tab.map') : t('tab.upload')}
            </button>
            {analysis && (
              <button
                className={view === 'report' ? 'tab active' : 'tab'}
                onClick={() => setView('report')}
              >
                {t('tab.report')}
              </button>
            )}
            {/* the rule reference stands on its own, with or without an upload */}
            <button
              className={view === 'rules' ? 'tab active' : 'tab'}
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
              <span className={'score-badge-value grade-' + analysis.projectScore.grade}>
                {number(analysis.projectScore.score)} · {analysis.projectScore.grade}
              </span>
            </span>
            <button className="btn primary" onClick={() => window.print()}>{t('header.export')}</button>
            <button className="btn" onClick={() => {
              setAnalysis(null)
              dispatch({ type: 'reset' })
            }}>{t('header.reset')}</button>
          </div>
        )}
        <ThemeToggles />
      </header>

      {!analysis && view !== 'rules' && <DropZone onAnalyzed={setAnalysis} />}
      {view === 'rules' && <Rules analysis={analysis} />}
      {analysis && (
        <div className="canvas-wrap no-print" hidden={view !== 'map'}>
          <Canvas analysis={analysis} onSelect={(path) => dispatch({ type: 'open', path, from: 'map' })} />
        </div>
      )}
      {analysis && view === 'report' && (
        <Report analysis={analysis} onOpen={(path, line) => dispatch({ type: 'open', path, from: 'report', line })} />
      )}
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
