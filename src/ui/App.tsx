import { useEffect, useState } from 'react'
import type { ProjectAnalysis } from '../core/model'
import { LangContext, useT, useNumber, type Lang } from './i18n'
import { ThemeToggles } from './ThemeToggles'
import DropZone from './DropZone'
import Canvas from './canvas/Canvas'
import EditorDrawer from './editor/EditorDrawer'
import Report from './report/Report'
import Rules from './rules/Rules'

type View = 'map' | 'report' | 'rules'

function Shell() {
  const t = useT()
  const number = useNumber()
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null)
  const [view, setView] = useState<View>('map')
  const [selected, setSelected] = useState<string | null>(null)
  // bumped on every jump so clicking the same row twice re-centers the node
  const [focus, setFocus] = useState<{ path: string; nonce: number } | null>(null)

  const openOnMap = (path: string) => {
    setSelected(path)
    setFocus((f) => ({ path, nonce: (f?.nonce ?? 0) + 1 }))
    setView('map')
  }

  const exportPdf = () => {
    setView('report')
    setTimeout(() => window.print(), 100)
  }

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
            <button className="btn primary" onClick={exportPdf}>{t('header.export')}</button>
            <button className="btn" onClick={() => {
              setAnalysis(null)
              setSelected(null)
              setView('map')
            }}>{t('header.reset')}</button>
          </div>
        )}
        <ThemeToggles />
      </header>

      {!analysis && view !== 'rules' && <DropZone onAnalyzed={setAnalysis} />}
      {view === 'rules' && <Rules analysis={analysis} />}
      {analysis && (
        <div className="canvas-wrap no-print" hidden={view !== 'map'}>
          <Canvas analysis={analysis} onSelect={setSelected} focus={focus} />
          {view === 'map' && selected && (
            <EditorDrawer analysis={analysis} botPath={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
      {analysis && view === 'report' && <Report analysis={analysis} onSelectBot={openOnMap} />}
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
