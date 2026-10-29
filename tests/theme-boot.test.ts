import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../public/boot.js', import.meta.url), 'utf8')
function boot(initial: Record<string, string> = {}, languages = ['en-US'], dark = false, blocked = false) {
  const storage = new Map(Object.entries(initial))
  const html = { dataset: {} as Record<string, string>, lang: '', classList: { add() {}, remove() {} } }
  const events: Record<string, () => void> = {}
  const media = { matches: dark, addEventListener: (_: string, fn: () => void) => { events.theme = fn } }
  const navigator = { languages }
  const window = { addEventListener: (name: string, fn: () => void) => { events[name] = fn } } as {
    addEventListener: (name: string, fn: () => void) => void
    SuitePreferences: { setLang: (lang: string) => void; toggleTheme: () => void }
  }
  const document = { documentElement: html, querySelectorAll: () => [], dispatchEvent() {} }
  runInNewContext(source, { window, document, navigator, matchMedia: () => media,
    localStorage: {
      getItem: (key: string) => { if (blocked) throw new Error('blocked'); return storage.get(key) ?? null },
      setItem: (key: string, value: string) => { if (blocked) throw new Error('blocked'); storage.set(key, value) },
      removeItem: (key: string) => { if (blocked) throw new Error('blocked'); storage.delete(key) },
    }, CustomEvent: class {}, setTimeout: () => 1, clearTimeout() {} })
  return { html, storage, events, media, navigator, api: window.SuitePreferences }
}

describe('blocking preference boot', () => {
  it('uses the first supported browser language and theme, with English fallback', () => {
    expect(boot({}, ['fr', 'es-MX', 'en'], true).html).toMatchObject({ lang: 'es', dataset: { theme: 'dark' } })
    expect(boot({}, ['fr']).html.lang).toBe('en')
  })
  it('migrates an old override once, but discards an old browser default', () => {
    const migrated = boot({ 'themis-lang': 'es' })
    expect(migrated.storage.get('suite.themis.lang')).toBe('es')
    expect(migrated.storage.has('themis-lang')).toBe(false)
    expect(boot({ 'themis-lang': 'en' }).storage.size).toBe(0)
    expect(boot({ 'themis-lang': 'en', 'suite.themis.lang': 'es' }).html.lang).toBe('es')
  })
  it('stores an override, reloads it, and clears it on return to the browser value', () => {
    const state = boot()
    state.api.toggleTheme()
    state.api.setLang('es')
    expect(state.storage.get('suite.themis.theme')).toBe('dark')
    expect(boot(Object.fromEntries(state.storage)).html).toMatchObject({ lang: 'es', dataset: { theme: 'dark' } })
    state.api.toggleTheme()
    state.api.setLang('en')
    expect(state.storage.size).toBe(0)
  })
  it('follows live browser changes only without an override', () => {
    const state = boot()
    state.media.matches = true
    state.events.theme()
    state.navigator.languages = ['es']
    state.events.languagechange()
    expect(state.html).toMatchObject({ lang: 'es', dataset: { theme: 'dark' } })
    state.api.setLang('en')
    state.api.toggleTheme()
    state.events.theme()
    state.events.languagechange()
    expect(state.html).toMatchObject({ lang: 'en', dataset: { theme: 'light' } })
  })
  it('continues to work when storage is blocked', () => {
    const state = boot({}, ['en'], false, true)
    state.api.setLang('es')
    state.api.toggleTheme()
    expect(state.html).toMatchObject({ lang: 'es', dataset: { theme: 'dark' } })
  })
  it('ignores preview parameters and invalid stored preferences', () => {
    expect(source).not.toMatch(/URLSearchParams|data-variant|dataset\.variant/)
    const state = boot({ 'suite.themis.lang': 'fr', 'suite.themis.theme': 'invalid' })
    state.media.matches = true
    state.events.theme()
    expect(state.html.dataset.theme).toBe('dark')
  })
})
