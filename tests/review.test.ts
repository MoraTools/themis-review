import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { analyzeZips } from '../src/core/analyze'
import { parseTaskbot } from '../src/core/parse'
import { reviewBot } from '../src/core/review'

const variable = (name: string) => ({ name, type: 'STRING', description: 'Test' })
const node = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, commandName: 'test', packageName: 'Test', attributes: [], ...extra,
})
const parse = (nodes: unknown[], variables: unknown[]) => parseTaskbot(
  'taskbot', 'synthetic.zip', JSON.stringify({ nodes, variables, packages: [] }),
)
const unused = (bot: ReturnType<typeof parseTaskbot>) => reviewBot(bot).findings
  .filter((f) => f.ruleId === 'UNUSED_VAR').map((f) => f.varName)

describe('normalized native variable references', () => {
  it('resolves lowercase dictionary values to the four declared names without counting keys', () => {
    const names = ['pStrCarpetaPantallazos', 'pStrPathScreenShotJpeg', 'pStrAdjuntosAdm', 'pStrLog']
    const bot = parse([node('log', {
      commandName: 'log_message', packageName: 'A360BotFramework',
      attributes: [{ name: 'sourceMap', value: { type: 'DICTIONARY', dictionary: [
        ...names.map((name) => ({ key: name.toLowerCase(), value: { type: 'VARIABLE', variableName: name.toLowerCase() } })),
        { key: 'pStrKeyOnly', value: { type: 'STRING', string: 'literal' } },
      ] } }],
    })], [...names, 'pStrKeyOnly', 'pStrUnused'].map(variable))

    for (const name of names) expect(bot.varRefs[name]).toEqual([1])
    expect(unused(bot)).toEqual(['pStrKeyOnly', 'pStrUnused'])
    expect(reviewBot(bot).findings.filter((f) => f.ruleId.startsWith('VAR_'))).toEqual([])
  })

  it('keeps nested and return targets on their action lines and deduplicates native aliases', () => {
    const bot = parse([node('parent', {
      children: [node('child', {
        attributes: [{ name: 'condition', value: { type: 'CONDITIONAL' }, attributes: [
          { name: 'native', value: { type: 'VARIABLE', variableName: 'pstrnested' } },
          { name: 'same', value: { type: 'VARIABLE', variableName: 'PSTRNESTED' } },
          { name: 'object', value: { objectTypeName: 'VARIABLE', string: 'pstroBJECT' } },
          { name: 'map', value: { type: 'VARIABLE_MAP', variableMapNames: ['pstrmap'] } },
        ] }],
        returnTo: { type: 'VARIABLE', variableName: 'pstrreturn' },
      })],
      branches: [node('branch', { returnTo: { type: 'VARIABLE', variableName: 'PSTRNESTED' } })],
    })], ['pStrNested', 'pStrObject', 'pStrMap', 'pStrReturn', 'pStrUnused'].map(variable))

    expect(bot.varRefs.pStrNested).toEqual([2, 3])
    for (const name of ['pStrObject', 'pStrMap', 'pStrReturn']) expect(bot.varRefs[name]).toEqual([2])
    expect(unused(bot)).toEqual(['pStrUnused'])
    expect(Object.keys(bot.varRefs).every((name) => bot.variables.some((v) => v.name === name))).toBe(true)
  })

  it('keeps expressions case-sensitive and rejects ambiguous aliases while preferring exact names', () => {
    const bot = parse([node('ambiguous', { attributes: [
      { name: 'native', value: { type: 'VARIABLE', variableName: 'PstrFoo' } },
      { name: 'expression', value: { expression: '$pstrexpression$ $System:AATaskName$ $pStrExact$' } },
    ] }), node('exact', { returnTo: { type: 'VARIABLE', variableName: 'pStrFoo' } })], [
      ...['pStrFoo', 'PSTRFOO', 'pStrExpression', 'pStrExact'].map(variable),
      { ...variable('pStrDefault'), defaultValue: { expression: '$pStrDefault$' } },
    ])

    expect(bot.varRefs).toEqual({ pStrExact: [1], pStrFoo: [2] })
    expect(unused(bot)).toEqual(['PSTRFOO', 'pStrExpression', 'pStrDefault'])
    const format = reviewBot(bot).findings.filter((f) => f.ruleId === 'VAR_NAME_FORMAT')
    expect(format.map((f) => f.varName)).toEqual(['PSTRFOO'])
    expect(bot.variables.map((v) => v.name)).toEqual(['pStrFoo', 'PSTRFOO', 'pStrExpression', 'pStrExact', 'pStrDefault'])
  })
})

describe('shared single-bot review', () => {
  it('matches the project analyzer for an identical taskbot', () => {
    const raw = { packages: [], variables: ['pStrUsed', 'pStrUnused', 'badName'].map(variable), nodes: [
      node('log', { commandName: 'log_message', packageName: 'A360BotFramework',
        attributes: [{ name: 'source', value: { type: 'VARIABLE', variableName: 'pstrused' } }],
      }),
      node('disabled', { disabled: true }),
      node('box', { packageName: 'MessageBox', attributes: [{ name: 'closeMsgBox', value: { boolean: false } }] }),
      node('try', { commandName: 'try', packageName: 'ErrorHandler', children: [
        node('catch', { commandName: 'catch', packageName: 'ErrorHandler' }),
      ] }),
    ] }
    const analysis = analyzeZips([{ name: 'synthetic.zip', data: zipSync({ taskbot: strToU8(JSON.stringify(raw)) }) }])
    const review = reviewBot(parseTaskbot('taskbot', 'synthetic.zip', JSON.stringify(raw)))
    for (const rule of ['VAR_NAME_FORMAT', 'MSGBOX_BLOCKING', 'EMPTY_CATCH', 'UNUSED_VAR', 'DISABLED_CODE']) {
      expect(review.findings.some((f) => f.ruleId === rule)).toBe(true)
    }
    expect(analysis.findings).toEqual(review.findings)
    expect(analysis.metrics.taskbot).toEqual(review.metrics)
    expect(analysis.scores.taskbot).toEqual(review.score)
    expect(analysis.projectScore).toEqual(review.score)
  })

  it('keeps project graph findings in addition to the shared single-bot review', () => {
    const raw = { packages: [], variables: [], nodes: [node('call', {
      commandName: 'runTask', packageName: 'TaskBot', attributes: [{ name: 'taskbot', value: {
        type: 'TASKBOT', taskbotFile: { string: 'repository:///missing' },
      } }],
    })] }
    const analysis = analyzeZips([{ name: 'synthetic.zip', data: zipSync({ taskbot: strToU8(JSON.stringify(raw)) }) }])
    const review = reviewBot(analysis.taskbots[0])
    expect(analysis.findings).toEqual([...review.findings, {
      ruleId: 'MISSING_DEPENDENCY', severity: 'info', botPath: 'taskbot', line: 1,
      params: { target: 'missing', line: '1' },
    }])
    expect(analysis.scores.taskbot).toEqual({ score: review.score.score - 0.5, grade: 'A' })
  })
})
