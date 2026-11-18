import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Finding, ProjectAnalysis, Severity } from '../src/core/model'
import { RULES } from '../src/core/rulesInfo'
import { LangContext, plural, translate, type Lang } from '../src/ui/i18n'
import { groupTexts, gradeBands, lostPoints, scoringLines } from '../src/ui/findings/findings'
import { FindingGroupCard, PointsLost } from '../src/ui/findings/FindingCard'
import { DEFAULT_SEVERITY_ON, severityFilterReducer, type SeverityFilterAction, type SeverityOn } from '../src/ui/findings/SeverityFilter'

const LANGS: Lang[] = ['en', 'es']
/** rules the engine emits at most once per taskbot, so they never form a group */
const ONCE_PER_BOT = new Set(['NO_ERROR_HANDLING', 'TOO_LONG', 'MSGBOX_OVER_LOGS', 'NO_LOGS', 'LOW_COMMENTS', 'DEEP_NESTING'])
const GROUPABLE = RULES.map((r) => r.id).filter((id) => !ONCE_PER_BOT.has(id))

const render = (lang: Lang, el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el))

const f = (ruleId: string, severity: Severity, line: number, params: Record<string, string>): Finding => ({
  ruleId, severity, botPath: 'bot', line, params,
})

describe('plurals', () => {
  it('picks one and other in English', () => {
    expect(plural('en', 'node.comments', 1)).toBe('1 comment')
    expect(plural('en', 'node.comments', 2)).toBe('2 comments')
    expect(plural('en', 'node.lines', 1)).toBe('1 line')
    expect(plural('en', 'node.packages', 10)).toBe('10 packages')
    expect(plural('en', 'report.clean', 3)).toBe('No findings in 3 taskbots.')
  })

  it('picks one and other in Spanish, with agreement', () => {
    expect(plural('es', 'report.silent.hidden', 1, { list: '1 Info' })).toBe('1 Info oculto')
    expect(plural('es', 'report.silent.hidden', 16, { list: '16 Info' })).toBe('16 Info ocultos')
    expect(plural('es', 'node.vars', 1)).toBe('1 variable')
    expect(plural('es', 'node.vars', 0)).toBe('0 variables')
    expect(plural('es', 'report.group.count', 1)).toBe('1 hallazgo')
  })

  it('has both forms of every count key in both languages', () => {
    const keys = ['node.lines', 'node.comments', 'node.logs', 'node.vars', 'node.packages', 'report.silent.hidden',
      'report.scope.hidden', 'report.clean', 'report.group.count', 'rules.count']
    for (const lang of LANGS) for (const k of keys) for (const form of ['one', 'other']) {
      expect(translate(lang, `${k}.${form}`), `${lang} ${k}.${form}`).not.toBe(`${k}.${form}`)
    }
  })
})

describe('grouped cards', () => {
  it('has a group sentence for every rule that can group, in both languages, with no blanked slot', () => {
    for (const id of GROUPABLE) {
      expect(translate('es', `rule.${id}.group`), id).not.toBe(translate('en', `rule.${id}.group`))
      for (const lang of LANGS) {
        const { msg, fix } = groupTexts(lang, id, 4)
        expect(msg, `${lang} ${id}`).not.toBe('report.group.msg')
        expect(msg, `${lang} ${id}`).toContain('4')
        for (const text of [msg, fix]) {
          expect(text, `${lang} ${id}`).not.toMatch(/…|\.\.\.|\{\w+\}/)
        }
      }
    }
  })

  it('renders no "..." on a grouped card', () => {
    const findings = [3, 9, 14].map((line) => f('MSGBOX_BLOCKING', 'error', line, { line: String(line), command: 'messageBox' }))
    for (const lang of LANGS) {
      const html = render(lang, createElement(FindingGroupCard, { findings, lineOf: (x: Finding) => x.line }))
      expect(html).not.toMatch(/…|\.\.\./)
      expect(html).toContain(translate(lang, 'rule.MSGBOX_BLOCKING.group', { n: '3' }))
    }
  })
})

describe('report severity filter in the shell', () => {
  const analysis = { zipNames: ['New.zip'] } as unknown as ProjectAnalysis
  const run = (state: SeverityOn, actions: SeverityFilterAction[]) => actions.reduce(severityFilterReducer, state)

  it('keeps the filter across view switches and the editor', () => {
    const on = run(DEFAULT_SEVERITY_ON, [{ type: 'severity', severity: 'info' }, { type: 'severity', severity: 'warn' }])
    expect(on).toEqual({ error: true, warn: false, info: true })
    const after = run(on, [
      { type: 'view', view: 'map' },
      { type: 'view', view: 'rules' },
      { type: 'open', path: 'bot', from: 'map' },
      { type: 'close' },
      { type: 'view', view: 'report' },
      { type: 'failed' },
    ])
    expect(after).toBe(on)
  })

  it('starts again on a new analysis', () => {
    const on = run(DEFAULT_SEVERITY_ON, [{ type: 'severity', severity: 'error' }])
    expect(severityFilterReducer(on, { type: 'loaded', analysis })).toEqual(DEFAULT_SEVERITY_ON)
  })
})

describe('points lost', () => {
  const findings = [
    ...[1, 2, 3, 4, 5].map((l) => f('MSGBOX_BLOCKING', 'error', l, {})), // 20, capped at 15
    f('VAR_NO_DESCRIPTION', 'warn', 6, {}),
    f('VAR_NO_DESCRIPTION_LOCAL', 'info', 7, {}),
    f('DISABLED_CODE', 'info', 8, {}),
    f('EMPTY_CATCH', 'error', 9, {}),
    f('UNUSED_VAR', 'info', 10, {}),
  ]

  it('lists titles in point order, without the id, and links the shown ones', () => {
    const lost = lostPoints(findings)
    const targets: Record<string, string> = { MSGBOX_BLOCKING: 'bot-0-MSGBOX_BLOCKING', VAR_NO_DESCRIPTION: 'bot-0-VAR_NO_DESCRIPTION' }
    const html = render('en', createElement(PointsLost, { lost, targetOf: (g: string) => targets[g] }))
    // the screen copy of each link; the print anchor repeats it
    const screen = html.replace(/<a class="print-only card-anchor"[^]*?<\/a>/g, '')
    const titles = [...screen.matchAll(/report-lost-title">([^<]+)</g)].map((m) => m[1])
    expect(titles).toEqual([
      translate('en', 'rule.MSGBOX_BLOCKING.title'),
      translate('en', 'rule.EMPTY_CATCH.title'),
      translate('en', 'rule.VAR_NO_DESCRIPTION.family'),
      translate('en', 'rule.DISABLED_CODE.title'),
      translate('en', 'rule.UNUSED_VAR.title'),
    ])
    // the title is the link text; the id stays on the card head only
    expect(html).not.toContain('report-lost-id')
    expect((html.match(/<button/g) ?? []).length).toBe(2)
    expect(html).toContain('(<abbr title="The most one rule family can take off one taskbot.">cap</abbr>)')
    // one stacked layout at every length, the print anchors to the same cards, the total last
    expect(html).not.toContain('stacked')
    expect(html).toContain('<a class="print-only card-anchor" href="#bot-0-MSGBOX_BLOCKING">')
    expect(html).toMatch(/<li class="report-lost-total">.*<\/li><\/ul>/)
  })
})

describe('grade bands', () => {
  it('reads the last band as below the one before, on the report line and the Rules page', () => {
    for (const lang of LANGS) {
      const bands = gradeBands(lang)
      expect(bands[bands.length - 1].text.startsWith('<')).toBe(true)
      for (const b of bands) expect(scoringLines(lang).bands).toContain(`${b.grade} ${b.text}`)
    }
  })
})
