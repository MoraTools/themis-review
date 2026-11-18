import { describe, expect, it } from 'vitest'
import type { Finding, Severity } from '../src/core/model'
import { DEDUCTION, GRADE_BANDS, RULE_CAP, scoreFindings } from '../src/core/score'
import {
  compareByFamily,
  compareFindings,
  entryPoints,
  entrySize,
  findingLine,
  gradeDistribution,
  groupFindings,
  hiddenList,
  lostPoints,
  scoringLines,
  severityCounts,
} from '../src/ui/findings/findings'
import { initialNav, navReducer } from '../src/ui/shared/selection'
import { translate } from '../src/ui/i18n'

const f = (ruleId: string, severity: Severity, line?: number, varName?: string): Finding => ({
  ruleId,
  severity,
  botPath: 'bot',
  line,
  varName,
  params: { name: varName ?? 'x', suggestion: 'pStrX' },
})

describe('finding order and lines', () => {
  it('sorts by severity, then line', () => {
    const list = [f('A', 'info', 1), f('B', 'warn', 9), f('C', 'error', 5), f('D', 'warn', 2)].sort(compareFindings)
    expect(list.map((x) => x.ruleId)).toEqual(['C', 'D', 'B', 'A'])
  })

  it('uses the first reference of a variable when a finding has no line', () => {
    const bot = { varRefs: { pStrX: [7, 12] } }
    expect(findingLine(f('VAR_NAME_FORMAT', 'warn', undefined, 'pStrX'), bot)).toBe(7)
    expect(findingLine(f('VAR_NAME_FORMAT', 'warn', 3, 'pStrX'), bot)).toBe(3)
    expect(findingLine(f('NO_LOGS', 'warn'), bot)).toBeUndefined()
  })
})

describe('grouped findings in one taskbot with a severity filter', () => {
  const all = [
    f('VAR_NAME_FORMAT', 'warn', 5, 'x'),
    f('VAR_NAME_FORMAT', 'warn', 2, 'temp'),
    f('VAR_NAME_FORMAT', 'warn', 12, 'dato1'),
    f('VAR_NAME_FORMAT', 'warn', 22, 'dato2'),
    f('MSGBOX_BLOCKING', 'error', 30),
    f('UNUSED_VAR', 'info', undefined, 'a'),
    f('UNUSED_VAR', 'info', undefined, 'b'),
    f('UNUSED_VAR', 'info', undefined, 'c'),
  ].sort(compareFindings)
  const sevOn: Record<Severity, boolean> = { error: true, warn: true, info: false }
  const shown = all.filter((x) => sevOn[x.severity])
  const entries = groupFindings(shown)

  it('puts 2 or more findings of one rule in one card and keeps the others single', () => {
    expect(entries.map((e) => e.kind)).toEqual(['single', 'group'])
    const group = entries[1]
    expect(group.kind === 'group' && group.ruleId).toBe('VAR_NAME_FORMAT')
    expect(group.kind === 'group' && group.findings.map((x) => x.line)).toEqual([2, 5, 12, 22])
  })

  it('counts findings, not cards', () => {
    expect(entries.length).toBe(2)
    expect(entries.reduce((n, e) => n + entrySize(e), 0)).toBe(shown.length)
    expect(shown.length).toBe(5)
    expect(severityCounts(all)).toEqual({ error: 1, warn: 4, info: 3 })
    expect(hiddenList(severityCounts(all), sevOn, 'en')).toBe('3 Info')
  })

  it('keeps a lone finding of a rule as a single card and groups from 2', () => {
    expect(groupFindings(shown.slice(0, 2)).every((e) => e.kind === 'single')).toBe(true)
    expect(groupFindings(shown.slice(0, 3)).map((e) => e.kind)).toEqual(['single', 'group'])
  })
})

describe('card order and family points', () => {
  const list = [
    f('UNUSED_VAR', 'info', 1, 'a'),
    f('TOO_LONG', 'warn', 3),
    ...[9, 4, 6, 8].map((l) => f('MSGBOX_BLOCKING', 'error', l)), // 16, capped at 15
    f('VAR_NO_DESCRIPTION', 'warn', 2, 'b'),
    f('VAR_NO_DESCRIPTION_LOCAL', 'info', 5, 'c'), // same cap family
  ]
  const lost = lostPoints(list)
  const sorted = [...list].sort(compareByFamily(lost))

  it('orders cards by family points, then severity, then line', () => {
    expect(sorted.map((x) => x.ruleId + ':' + x.line)).toEqual([
      'MSGBOX_BLOCKING:4', 'MSGBOX_BLOCKING:6', 'MSGBOX_BLOCKING:8', 'MSGBOX_BLOCKING:9',
      'VAR_NO_DESCRIPTION:2', 'VAR_NO_DESCRIPTION_LOCAL:5', 'TOO_LONG:3', 'UNUSED_VAR:1',
    ])
  })

  it('puts the family points on every card, marking the later cards of a shared family', () => {
    const entries = groupFindings(sorted)
    const points = entryPoints(entries, lost)
    expect(entries.map((e) => (e.kind === 'group' ? 'group:' + e.ruleId : e.finding.ruleId))).toEqual([
      'group:MSGBOX_BLOCKING', 'VAR_NO_DESCRIPTION', 'VAR_NO_DESCRIPTION_LOCAL', 'TOO_LONG', 'UNUSED_VAR',
    ])
    expect(points.get(0)).toEqual({ group: 'MSGBOX_BLOCKING', points: RULE_CAP, capped: true })
    expect(points.get(1)?.inFamily).toBeUndefined()
    expect(points.get(2)).toEqual({ group: 'VAR_NO_DESCRIPTION', points: DEDUCTION.warn + DEDUCTION.info, capped: false, inFamily: true })
    expect(entries.every((_, i) => points.has(i))).toBe(true)
  })
})

describe('lost points and the scoring text', () => {
  it('adds up per rule family with the same cap as scoreFindings', () => {
    const findings = [
      ...Array.from({ length: 6 }, (_, i) => f('MSGBOX_BLOCKING', 'error', i)), // 24, capped at 15
      f('VAR_NO_DESCRIPTION', 'warn'),
      f('VAR_NO_DESCRIPTION_LOCAL', 'info'), // same family as VAR_NO_DESCRIPTION
      f('DISABLED_CODE', 'info'),
    ]
    const lost = lostPoints(findings)
    expect(lost[0]).toEqual({ group: 'MSGBOX_BLOCKING', points: RULE_CAP, capped: true })
    expect(lost.find((l) => l.group === 'VAR_NO_DESCRIPTION')).toEqual({
      group: 'VAR_NO_DESCRIPTION',
      points: DEDUCTION.warn + DEDUCTION.info,
      capped: false,
    })
    const total = lost.reduce((n, l) => n + l.points, 0)
    expect(Math.round((100 - total) * 10) / 10).toBe(scoreFindings(findings))
  })

  it('shows the numbers of the scoring constants', () => {
    const n = new Intl.NumberFormat('en').format
    const { rule, bands } = scoringLines('en')
    expect(rule).toBe(
      translate('en', 'report.scoring.rule', {
        error: n(DEDUCTION.error),
        warn: n(DEDUCTION.warn),
        info: n(DEDUCTION.info),
        cap: n(RULE_CAP),
      }),
    )
    for (const v of [DEDUCTION.error, DEDUCTION.warn, DEDUCTION.info, RULE_CAP]) expect(rule).toContain(n(v))
    for (const b of GRADE_BANDS.slice(0, -1)) expect(bands).toContain(`${b.grade} ≥ ${b.min}`)
    expect(bands).toContain(`F < ${GRADE_BANDS[GRADE_BANDS.length - 2].min}`)
    expect(scoringLines('es').rule).toContain(new Intl.NumberFormat('es').format(DEDUCTION.warn))
  })

  it('counts taskbots per grade', () => {
    expect(gradeDistribution([{ score: 95, grade: 'A' }, { score: 50, grade: 'D' }, { score: 99, grade: 'A' }])).toEqual({
      A: 2, B: 0, C: 0, D: 1, F: 0,
    })
  })
})

describe('editor selection origin', () => {
  it('returns to the report after an open from the report', () => {
    let s = navReducer(initialNav, { type: 'view', view: 'report' })
    s = navReducer(s, { type: 'open', path: 'bot', from: 'report', line: 12 })
    expect(s).toEqual({ view: 'report', selection: { path: 'bot', from: 'report', line: 12 } })
    expect(navReducer(s, { type: 'close' })).toEqual({ view: 'report', selection: null })
  })

  it('returns to the map after an open from the map, even when print switched to the report', () => {
    let s = navReducer(initialNav, { type: 'open', path: 'bot', from: 'map' })
    s = navReducer(s, { type: 'view', view: 'report' })
    expect(navReducer(s, { type: 'close' })).toEqual({ view: 'map', selection: null })
  })

  it('clears the origin on a new analysis', () => {
    const s = navReducer(initialNav, { type: 'open', path: 'bot', from: 'report' })
    expect(navReducer(s, { type: 'reset' })).toEqual({ view: 'map', selection: null })
  })
})
