import { describe, expect, it } from 'vitest'
import type { ProjectAnalysis } from '../src/core/model'
import { translate } from '../src/ui/i18n'
import {
  cleanStart, closeEditor, editorEntry, pageTitle, pushEditor, startShell, tabHref, uploaded, viewFromHash,
  type HistoryLike, type ShellAction,
} from '../src/ui/shared/selection'

/** a small session history: entries of [state, url]; back moves the index like the browser */
function fakeHistory(url: string) {
  const entries: { state: unknown; url: string }[] = [{ state: null, url }]
  let index = 0
  const popped: unknown[] = []
  const h: HistoryLike & { readonly length: number; url: string; popped: unknown[] } = {
    get state() { return entries[index].state },
    get length() { return entries.length },
    get url() { return entries[index].url },
    popped,
    pushState(state: unknown, _unused: string, next?: string | URL | null) {
      entries.splice(index + 1, entries.length, { state, url: next ? String(next) : entries[index].url })
      index++
    },
    replaceState(state: unknown, _unused: string, next?: string | URL | null) {
      entries[index] = { state, url: next ? String(next) : entries[index].url }
    },
    back() {
      if (index === 0) return
      index--
      popped.push(entries[index].state)
    },
  }
  return h
}

describe('hash to view', () => {
  it('reads the view names with an analysis', () => {
    expect(viewFromHash('#map', true)).toBe('map')
    expect(viewFromHash('#report', true)).toBe('report')
    expect(viewFromHash('#rules', true)).toBe('rules')
    expect(viewFromHash('', true)).toBe('map')
    expect(viewFromHash('#Bot%20name', true)).toBe('map')
  })

  it('without an analysis shows the upload view, except for the rules', () => {
    expect(viewFromHash('#report', false)).toBe('map')
    expect(viewFromHash('#map', false)).toBe('map')
    expect(viewFromHash('#rules', false)).toBe('rules')
  })
})

describe('reload with no analysis', () => {
  for (const hash of ['#map', '#report', '#Bot%20name']) {
    it(`rewrites ${hash} away with replaceState`, () => {
      const h = fakeHistory('/themis/' + hash)
      cleanStart(h, { pathname: '/themis/', search: '?x=1', hash })
      expect(h.url).toBe('/themis/?x=1')
      expect(h.length).toBe(1)
    })
  }

  it('keeps a direct #rules link and starts on the Rules view', () => {
    const h = fakeHistory('/themis/?x=1#rules')
    cleanStart(h, { pathname: '/themis/', search: '?x=1', hash: '#rules' })
    expect(h.url).toBe('/themis/?x=1#rules')
    expect(startShell('#rules').nav.view).toBe('rules')
    expect(startShell('#rules').analysis).toBeNull()
    for (const hash of ['', '#map', '#report']) expect(startShell(hash).nav.view).toBe('map')
  })

  it('drops a stale editor entry state on #rules, and keeps the hash', () => {
    const h = fakeHistory('/#rules')
    h.replaceState({ editor: { path: 'a', from: 'map' } }, '')
    cleanStart(h, { pathname: '/', search: '', hash: '#rules' })
    expect(h.state).toBeNull()
    expect(h.url).toBe('/#rules')
  })

  it('drops a stale editor entry state', () => {
    const h = fakeHistory('/')
    h.replaceState({ editor: { path: 'a', from: 'map' } }, '')
    cleanStart(h, { pathname: '/', search: '', hash: '' })
    expect(h.state).toBeNull()
  })
})

describe('editor history entry', () => {
  const selection = { path: 'Automation Anywhere/Bots/tasks/A', from: 'map' as const }

  it('open pushes one entry with the selection in its state and the same URL', () => {
    const h = fakeHistory('/#map')
    pushEditor(h, selection)
    expect(h.length).toBe(2)
    expect(h.url).toBe('/#map')
    expect(editorEntry(h.state)).toEqual(selection)
  })

  it('Back leaves the entry; its popstate state has no editor, so the editor closes', () => {
    const h = fakeHistory('/#map')
    pushEditor(h, selection)
    h.back()
    expect(editorEntry(h.popped.at(-1))).toBeNull()
  })

  it('Escape and Close go back on our entry, so open and close do not grow history', () => {
    const h = fakeHistory('/#map')
    let closed = 0
    for (let i = 0; i < 3; i++) {
      pushEditor(h, selection)
      closeEditor(h, () => closed++)
    }
    // one forward entry stays from the first open; repeated opens reuse it
    expect(h.length).toBe(2)
    expect(h.url).toBe('/#map')
    expect(h.state).toBeNull()
    expect(closed).toBe(0)
  })

  it('closes directly when the current entry is not an editor entry', () => {
    const h = fakeHistory('/#map')
    let closed = 0
    closeEditor(h, () => closed++)
    expect(closed).toBe(1)
    expect(h.popped).toEqual([])
  })

  it('ignores states that are not editor entries', () => {
    expect(editorEntry(null)).toBeNull()
    expect(editorEntry({})).toBeNull()
    expect(editorEntry({ editor: { from: 'map' } })).toBeNull()
  })
})

describe('page title', () => {
  const en = (key: string) => translate('en', key)
  const es = (key: string) => translate('es', key)

  it('names the view, and the upload view is the plain app name', () => {
    expect(pageTitle('map', true, en)).toBe('Map · Themis Review')
    expect(pageTitle('report', true, en)).toBe('Report · Themis Review')
    expect(pageTitle('rules', true, en)).toBe('Rules · Themis Review')
    expect(pageTitle('rules', false, en)).toBe('Rules · Themis Review')
    expect(pageTitle('map', false, en)).toBe('Themis Review')
  })

  it('uses the Spanish view names', () => {
    expect(pageTitle('map', true, es)).toBe('Mapa · Themis Review')
    expect(pageTitle('report', true, es)).toBe('Reporte · Themis Review')
    expect(pageTitle('rules', false, es)).toBe('Reglas · Themis Review')
  })

  it('names no taskbot while the editor is open (history keeps titles): only the view', () => {
    // pageTitle takes no taskbot; the shell calls it with the view only
    expect(pageTitle.length).toBe(3)
    expect(pageTitle('report', true, en)).not.toContain('Main_Facturas')
  })
})

describe('view tab addresses', () => {
  it('links every view to its hash with an analysis, and the rules always', () => {
    expect(tabHref('map', true)).toBe('#map')
    expect(tabHref('report', true)).toBe('#report')
    expect(tabHref('rules', true)).toBe('#rules')
    expect(tabHref('rules', false)).toBe('#rules')
    // the upload view has no hash
    expect(tabHref('map', false)).toBeNull()
  })
})

describe('first upload', () => {
  it('replaces the entry with #map, loads, and asks for the view heading focus', () => {
    const h = fakeHistory('/')
    const focusHeading = { current: false }
    const actions: ShellAction[] = []
    const analysis = { zipNames: ['A.zip'] } as unknown as ProjectAnalysis
    uploaded(h, analysis, (a) => actions.push(a), focusHeading)
    expect(h.url).toBe('#map')
    expect(h.length).toBe(1)
    expect(focusHeading.current).toBe(true)
    expect(actions).toEqual([{ type: 'loaded', analysis }])
  })
})
