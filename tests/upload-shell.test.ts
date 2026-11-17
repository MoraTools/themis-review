import { describe, expect, it } from 'vitest'
import type { ProjectAnalysis } from '../src/core/model'
import { RULES } from '../src/core/rulesInfo'
import { analyzeFiles } from '../src/ui/DropZone'
import { translate, type Lang } from '../src/ui/i18n'
import { initialShell, shellReducer, type ShellState } from '../src/ui/shared/selection'

const old = { zipNames: ['Old.zip'] } as unknown as ProjectAnalysis
const fresh = { zipNames: ['New.zip'] } as unknown as ProjectAnalysis

function withSelection(): ShellState {
  let s = shellReducer(initialShell, { type: 'loaded', analysis: old })
  s = shellReducer(s, { type: 'open', path: 'bot', from: 'report', line: 4 })
  return s
}

describe('New analysis', () => {
  it('keeps the analysis, view and selection after a failed upload', () => {
    const s = withSelection()
    expect(shellReducer(s, { type: 'failed' })).toBe(s)
    expect(s.analysis).toBe(old)
    expect(s.nav).toEqual({ view: 'report', selection: { path: 'bot', from: 'report', line: 4 } })
  })

  it('replaces the analysis and clears the selection origin after a good upload', () => {
    const s = shellReducer(withSelection(), { type: 'loaded', analysis: fresh })
    expect(s).toEqual({ analysis: fresh, nav: { view: 'map', selection: null } })
  })

  it('passes navigation actions through to the selection reducer', () => {
    const s = shellReducer(withSelection(), { type: 'close' })
    expect(s.analysis).toBe(old)
    expect(s.nav).toEqual({ view: 'report', selection: null })
  })
})

describe('upload errors', () => {
  it('names a file that is not a ZIP, before any analysis', async () => {
    const file = new File(['just text'], 'Documento.zip')
    expect(await analyzeFiles([file])).toEqual({ error: { kind: 'notZip', name: 'Documento.zip' } })
  })

  it('has a text for every error kind and the progress, in both languages, with the file name', () => {
    for (const lang of ['en', 'es'] as Lang[]) {
      for (const kind of ['notZip', 'damaged', 'noTaskbot', 'failed']) {
        const text = translate(lang, `drop.error.${kind}`, { name: 'Danado.zip' })
        expect(text, `${lang} ${kind}`).toContain('Danado.zip')
      }
      expect(translate(lang, 'drop.busy', { n: '3' })).toContain('3')
      expect(translate(lang, 'drop.busy.one')).not.toBe('drop.busy.one')
    }
    expect(translate('en', 'drop.error.notZip', { name: 'Documento.zip' })).toBe('Documento.zip is not a ZIP file.')
  })
})

describe('rule titles', () => {
  it('has a short title for every rule, in both languages', () => {
    for (const r of RULES) {
      for (const lang of ['en', 'es'] as Lang[]) {
        const key = `rule.${r.id}.title`
        const text = translate(lang, key)
        expect(text, `${lang}:${key}`).not.toBe(key)
        expect(text.length, `${lang}:${key}`).toBeLessThanOrEqual(48)
      }
    }
  })
})
