import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { analyzeZips } from '../src/core/analyze'
import EditorDrawer, { initialTab } from '../src/ui/editor/EditorDrawer'
import { LangContext, type Lang } from '../src/ui/i18n'
import { initialNav, navReducer } from '../src/ui/shared/selection'

const variable = (name: string) => ({ name, type: 'STRING', description: 'Test' })
const node = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, commandName: 'test', packageName: 'Test', attributes: [], ...extra,
})
const box = (uid: string) => node(uid, { packageName: 'MessageBox', attributes: [{ name: 'closeMsgBox', value: { boolean: false } }] })
const raw = {
  packages: [],
  variables: [variable('badName')],
  nodes: [node('n1'), box('b1'), box('b2'), box('b3')],
}
const analysis = analyzeZips([{ name: 'synthetic.zip', data: zipSync({ taskbot: strToU8(JSON.stringify(raw)) }) }])

// ThemeToggles reads the theme from <html>; server rendering has no document
globalThis.document ??= { documentElement: { dataset: {} } } as unknown as Document

const render = (lang: Lang, line?: number) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } },
    createElement(EditorDrawer, { analysis, botPath: 'taskbot', line, onClose: () => {}, onShowOnMap: () => {} })))

describe('editor open state', () => {
  it('opens on Findings without a line, on Code with a line or with no findings', () => {
    expect(initialTab(undefined, 3)).toBe('findings')
    expect(initialTab(7, 3)).toBe('code')
    expect(initialTab(undefined, 0)).toBe('code')
  })

  it('renders all three panels and hides the ones not selected', () => {
    const html = render('en')
    for (const id of ['code', 'vars', 'findings']) expect(html).toContain(`id="editor-panel-${id}"`)
    expect(html).toMatch(/id="editor-panel-findings" role="tabpanel" tabindex="0" aria-labelledby/)
    expect(html).toMatch(/id="editor-panel-code" role="tabpanel" tabindex="0" hidden=""/)
    expect(render('en', 2)).toMatch(/id="editor-panel-findings" role="tabpanel" tabindex="0" hidden=""/)
  })
})

describe('editor content', () => {
  it('groups three findings of one rule into one card, as the report does', () => {
    const html = render('en')
    expect(analysis.findings.filter((f) => f.ruleId === 'MSGBOX_BLOCKING')).toHaveLength(3)
    expect(html.match(/finding-group/g)).toHaveLength(1)
    // one data-finding hook lists every finding of the group
    expect(html).toMatch(/data-finding="\d+ \d+ \d+"/)
  })

  it('makes the Variables finding icons buttons under a Findings header', () => {
    const html = render('en')
    expect(html).toContain('<th>Findings</th>')
    expect(render('es')).toContain('<th>Hallazgos</th>')
    const vars = html.slice(html.indexOf('id="editor-panel-vars"'), html.indexOf('id="editor-panel-findings"'))
    expect(vars).toMatch(/<button type="button" class="code-flag" aria-label="[^"]+" title="[^"]+">/)
  })

  it('reserves the flag cell on every code row and draws one rail tick per flagged line', () => {
    const html = render('en', 2)
    expect(html.match(/class="code-flag-cell"/g)).toHaveLength(4)
    expect(html.match(/class="code-tick/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).toContain('aria-expanded="false"')
  })

  it('writes the stats with singular and plural forms', () => {
    const html = render('en')
    expect(html).toContain('<span>1 variable</span>')
    expect(html).toContain('<span>4 lines</span>')
    expect(html).toContain('<span>0 comments</span>')
    expect(html).toContain('<span>0 packages</span>')
    expect(render('es')).toContain('<span>0 comentarios</span>')
    expect(html).toContain('Show on map')
    expect(html).toContain('Points lost:')
  })
})

describe('show on map', () => {
  it('closes the editor, shows the map and asks again with a new nonce', () => {
    let s = navReducer(initialNav, { type: 'open', path: 'bot', from: 'report' })
    s = navReducer(s, { type: 'showOnMap', path: 'bot' })
    expect(s).toEqual({ view: 'map', selection: null, mapFocus: { path: 'bot', nonce: 1 } })
    s = navReducer(navReducer(s, { type: 'open', path: 'bot', from: 'map' }), { type: 'showOnMap', path: 'bot' })
    expect(s.mapFocus).toEqual({ path: 'bot', nonce: 2 })
  })
})
