import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeZips } from '../src/core/analyze'
import { parseTaskbot } from '../src/core/parse'
import { describeAction, glyphFor } from '../src/ui/editor/describe'

const DATA = join(__dirname, '..', '.data')

function bots(zip: string) {
  return analyzeZips([{ name: zip, data: new Uint8Array(readFileSync(join(DATA, zip))) }]).taskbots
}

describe('Control Room style labels', () => {
  const all = bots('Framework.zip')
  const labels = all.flatMap((b) => b.actions.map(describeAction))

  it('never leaks raw JSON or empty labels', () => {
    for (const l of labels) {
      expect(l.length).toBeGreaterThan(0)
      expect(l).not.toContain('{"')
      expect(l).not.toContain('[object')
      expect(l).not.toContain('undefined')
    }
  })

  it('labels control-flow actions the way the Control Room does', () => {
    expect(labels).toContain('Error handler: Try')
    expect(labels.some((l) => l.startsWith('Error handler: Catch'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Task Bot: Run utilidad_mensajeria'))).toBe(true)
  })

  it('prefixes with the package display name, not the raw package id', () => {
    expect(labels.some((l) => l.startsWith('Bot Framework:'))).toBe(true)
    expect(labels.every((l) => !l.startsWith('A360BotFramework'))).toBe(true)
    expect(labels.every((l) => !l.startsWith('ErrorHandler'))).toBe(true)
  })

  it('renders comments and message boxes without a package prefix', () => {
    expect(labels.some((l) => l.startsWith('BetterComment '))).toBe(true)
    const master = all.find((b) => b.name === '000_MasterFrameworkTemplate')!
    const dict = master.actions.find((a) => a.commandName === 'assign' && a.packageName === 'Dictionary')!
    expect(describeAction(dict)).toMatch(/^Dictionary: Assign .+ to \$\w+\$$/)
  })

  it('summarises a literal dictionary by size, like the Control Room', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', JSON.stringify({
      nodes: [{
        uid: 'a', commandName: 'assign', packageName: 'Dictionary',
        attributes: [{ name: 'sourceDictionary', value: { type: 'DICTIONARY', dictionary: [
          { key: 'a', value: { type: 'STRING', string: '1' } },
          { key: 'b', value: { type: 'STRING', string: '2' } },
        ] } }],
        returnTo: { type: 'VARIABLE', variableName: 'iDictConfig' },
      }],
      variables: [], packages: [],
    }))
    expect(describeAction(bot.actions[0])).toBe('Dictionary: Assign Dictionary (2) to $iDictConfig$')
  })

  it('names the assignment target', () => {
    const master = all.find((b) => b.name === '000_MasterFrameworkTemplate')!
    const withReturn = master.actions.find((a) => a.returnTo?.variableName)!
    expect(describeAction(withReturn)).toMatch(/ to \$[A-Za-z][A-Za-z0-9_]*\$$/)
  })

  it('picks a glyph family for every action', () => {
    for (const b of all) for (const a of b.actions) expect(glyphFor(a)).toBeTruthy()
  })
})

describe('label edge cases', () => {
  const wrap = (nodes: unknown[]) => JSON.stringify({ nodes, variables: [], packages: [] })

  it('strips the html comments are stored as', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', wrap([
      {
        uid: 'a', commandName: 'BetterComments', packageName: 'betterComments',
        attributes: [{ name: 'content', value: { type: 'STRING', string: '<p><span style="font-family: Arial">Valida datos</span></p>' } }],
      },
    ]))
    expect(describeAction(bot.actions[0])).toBe('BetterComment “Valida datos”')
  })

  it('reads the log level and message the way the Control Room does', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', JSON.stringify({
      nodes: [{
        uid: 'a', commandName: 'log_message', packageName: 'A360BotFramework',
        attributes: [
          { name: 'logLevel', value: { type: 'STRING', string: 'WARN' } },
          { name: 'logMessage', value: { type: 'STRING', string: 'sin casos' } },
        ],
      }],
      variables: [], packages: [],
    }))
    expect(describeAction(bot.actions[0])).toBe('Bot Framework: Log Message WARNING: “sin casos”')
  })

  it('spells out an if condition with its operator', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', JSON.stringify({
      nodes: [{
        uid: 'a', commandName: 'if', packageName: 'If',
        attributes: [{
          name: 'condition',
          value: { type: 'CONDITIONAL', conditionalName: 'stringVariable', packageName: 'String' },
          attributes: [
            { name: 'variable', value: { type: 'STRING', expression: '$pStrModo$' } },
            { name: 'operator', value: { type: 'STRING', string: 'EQ' } },
            { name: 'value', value: { type: 'STRING', string: 'SI' } },
          ],
        }],
      }],
      variables: [], packages: [],
    }))
    expect(describeAction(bot.actions[0])).toBe('If string $pStrModo$ Equals to (=) “SI”')
  })

  it('survives a recorder action whose captured-object blob is unreadable', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', JSON.stringify({
      nodes: [{
        uid: 'a', commandName: 'capture', packageName: 'Recorder',
        attributes: [
          { name: 'uiObject', value: { type: 'UIOBJECT', uiObject: { blob: 'not-valid-base64!!' } } },
          { name: 'buttonAction', value: { type: 'STRING', string: 'CLICK' } },
        ],
      }],
      variables: [], packages: [],
    }))
    expect(describeAction(bot.actions[0])).toBe('Recorder: Capture Click')
  })

  it('falls back to package and command for anything unmapped', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', wrap([
      { uid: 'a', commandName: 'someNewVerb', packageName: 'SomeNewPackage', attributes: [] },
    ]))
    expect(describeAction(bot.actions[0])).toBe('SomeNewPackage: someNewVerb')
  })
})
