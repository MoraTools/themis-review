import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')
const printBlock = css.slice(css.indexOf('@media print {'))

describe('shared style rules', () => {
  it('sets the 44px controls and targets on screen only, so print keeps 24px', () => {
    const query = css.match(/@media ([^{]*)\{ :root \{ --control-h:44px; --target-min:44px; \} \}/)
    expect(query?.[1].trim()).toBe('screen and (pointer:coarse), screen and (max-width:760px)')
  })

  it('resets every inline target to plain inline text in print', () => {
    const shared = css.match(/\n([^\n{]*) \{ display:inline-flex; align-items:center; min-width:var\(--target-min\)/)![1]
    const reset = printBlock.match(/\n\s*([^\n{]*) \{ display:inline; min-width:0; min-height:0; padding:0; margin:0; \}/)
    expect(reset?.[1]).toBe(shared)
    expect(shared).toContain('.report-lost-link')
  })

  it('aligns group items on the baseline, so the line label shares its text baseline', () => {
    expect(css).toMatch(/\.finding-items li \{[^}]*align-items: baseline/)
  })

  it('keeps layout out of .grade: the baseline pair is an inner span', () => {
    expect(css.match(/\n\.grade \{([^}]*)\}/)![1]).not.toMatch(/display|align-items/)
    expect(css).toMatch(/\.grade-pair \{ display: inline-flex; align-items: baseline;/)
  })

  it('never starts a list line with a separator', () => {
    expect(css).not.toMatch(/li \+ li::before/)
  })

  it('has no alias tokens', () => {
    for (const token of ['--surface-1', '--surface-2', '--radius-small', '--error', '--text-on-accent', '--text-disabled'])
      expect(css, token).not.toMatch(new RegExp(token + '(?![\\w-])'))
  })

  it('names the report on PDF pages 2 and later', () => {
    expect(printBlock).toMatch(/@bottom-left \{ content:var\(--print-id, ""\);/)
    expect(printBlock).toMatch(/@page :first \{ @bottom-left \{ content:none; \} \}/)
  })
})
