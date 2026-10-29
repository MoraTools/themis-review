import { useContext, useEffect, useState } from 'react'
import { LangContext, useT } from './i18n'
import { Icon } from './Icons'

export function ThemeToggles() {
  const t = useT()
  const { lang, setLang } = useContext(LangContext)
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === 'dark')
    document.addEventListener('suite:theme', sync)
    return () => document.removeEventListener('suite:theme', sync)
  }, [])
  const themeLabel = t(dark ? 'toggle.light' : 'toggle.dark')
  return (
    <div className="header-toggles">
      <button className="icon-btn" title={t('toggle.lang.title')} aria-label={t('toggle.lang.label')} onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>
        <Icon name="languages" />
      </button>
      <button className="icon-btn theme-toggle" title={themeLabel} aria-label={themeLabel} onClick={() => window.SuitePreferences.toggleTheme()}>
        <Icon name="sun" className="sun" /><Icon name="moon" className="moon" />
      </button>
    </div>
  )
}
