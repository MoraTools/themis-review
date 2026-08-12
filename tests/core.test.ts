import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeZips } from '../src/core/analyze'
import { parseTaskbot } from '../src/core/parse'
import { buildGraph, CALL_DEPTH_EXEMPT_TASKBOTS, callDepth, callSequence } from '../src/core/graph'
import { messageBoxRules } from '../src/core/rules/messagebox'
import { structureRules } from '../src/core/rules/structure'

const DATA = join(__dirname, '..', '.data')

function loadAll() {
  return readdirSync(DATA)
    .filter((f) => f.endsWith('.zip'))
    .map((name) => ({ name, data: new Uint8Array(readFileSync(join(DATA, name))) }))
}

function load(name: string) {
  return [{ name, data: new Uint8Array(readFileSync(join(DATA, name))) }]
}

describe('framework zip', () => {
  const a = analyzeZips(load('Framework.zip'))

  it('finds 4 taskbots', () => {
    expect(a.taskbots.map((t) => t.name).sort()).toEqual([
      '000_MasterFrameworkTemplate',
      '001_TareaEjemplo',
      'utilidad_limpiezaGrabaciones',
      'utilidad_mensajeria',
    ])
  })

  it('master calls utilities', () => {
    const master = a.taskbots.find((t) => t.name === '000_MasterFrameworkTemplate')!
    expect(master.calls.length).toBe(6)
    const targets = new Set(master.calls.map((c) => c.targetPath.split('/').pop()))
    expect(targets).toContain('utilidad_mensajeria')
  })

  it('counts comments and metrics on master', () => {
    const m = a.metrics[a.taskbots.find((t) => t.name === '000_MasterFrameworkTemplate')!.path]
    expect(m.commentsByKind['BetterComments']).toBe(19)
    expect(m.totalLines).toBeGreaterThan(50)
  })

  it('does not flag message boxes that close themselves', () => {
    // every box in the sample bots sets closeMsgBox + a timeOut
    expect(a.findings.filter((f) => f.ruleId === 'MSGBOX_BLOCKING')).toEqual([])
    expect(Object.values(a.metrics).some((m) => m.messageBoxes > 0)).toBe(true)
  })

  it('runTask input wires captured', () => {
    const master = a.taskbots.find((t) => t.name === '000_MasterFrameworkTemplate')!
    const call = master.calls.find((c) => c.targetPath.endsWith('utilidad_mensajeria'))!
    const wire = call.inputs.find((i) => i.calleeVar === 'iDictConfig')!
    expect(wire.callerVars).toContain('pDictConfig')
  })

  it('scores between 0 and 100', () => {
    for (const s of Object.values(a.scores)) {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
    }
  })
})

describe('all zips combined', () => {
  const a = analyzeZips(loadAll())

  it('parses every taskbot without error', () => {
    expect(a.taskbots.length).toBeGreaterThanOrEqual(20)
  })

  it('builds edges and detects any ghost dependencies consistently', () => {
    for (const e of a.edges) {
      const known = a.taskbots.some((t) => t.path === e.to) || a.ghostPaths.includes(e.to)
      expect(known).toBe(true)
    }
  })

  it('naming rules fire on real data', () => {
    // vStatus-style names exist in legacy bots; at least format or description findings expected
    expect(a.findings.some((f) => f.ruleId.startsWith('VAR_'))).toBe(true)
  })

  it('line numbers are sequential per bot', () => {
    for (const t of a.taskbots) {
      t.actions.forEach((act, i) => expect(act.line).toBe(i + 1))
    }
  })

  it('rates a missing description on an input/output above a local one', () => {
    const contract = a.findings.filter((f) => f.ruleId === 'VAR_NO_DESCRIPTION')
    const local = a.findings.filter((f) => f.ruleId === 'VAR_NO_DESCRIPTION_LOCAL')
    expect(contract.length).toBeGreaterThan(0)
    expect(local.length).toBeGreaterThan(0)
    expect(contract.every((f) => f.severity === 'warn')).toBe(true)
    expect(local.every((f) => f.severity === 'info')).toBe(true)
    for (const f of contract) {
      const bot = a.taskbots.find((t) => t.path === f.botPath)!
      const v = bot.variables.find((x) => x.name === f.varName)!
      expect(v.input || v.output).toBe(true)
    }
  })

  it('lists every taskbot and file once, even when zips overlap', () => {
    const botPaths = a.taskbots.map((t) => t.path)
    expect(new Set(botPaths).size).toBe(botPaths.length)
    const filePaths = a.otherFiles.map((f) => f.path)
    expect(new Set(filePaths).size).toBe(filePaths.length)
    const edgeKeys = a.fileEdges.map((fe) => fe.from + '|' + fe.to)
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length)
  })

  it('links referenced static files to their taskbots', () => {
    expect(a.fileEdges.length).toBeGreaterThan(0)
    for (const fe of a.fileEdges) {
      expect(a.taskbots.some((t) => t.path === fe.from)).toBe(true)
      expect(a.otherFiles.some((f) => f.path === fe.to)).toBe(true)
    }
    // config XMLs are read via config_read_xml, so at least one must be linked
    expect(a.fileEdges.some((fe) => fe.to.endsWith('.xml'))).toBe(true)
  })

  it('never flags utilidad_mensajeria for call depth', () => {
    const depthFindings = a.findings.filter((f) => f.ruleId === 'CALL_DEPTH')
    expect(depthFindings.every((f) => !f.params.callee.startsWith('utilidad_mensajeria'))).toBe(true)
  })
})

describe('export with localized folder names', () => {
  // this Control Room export uses Tareas/ and Documentos/ instead of tasks/ and docs/
  const a = analyzeZips(load('00_Master_Extractos_IBK.zip'))

  it('finds the taskbots despite the Spanish folders', () => {
    expect(a.taskbots.length).toBe(14)
    expect(a.taskbots.map((t) => t.name)).toContain('00_Master_Extractos_IBK')
    expect(a.taskbots.every((t) => t.path.includes('/Tareas/'))).toBe(true)
  })

  it('resolves the call graph and folder of each bot', () => {
    const master = a.taskbots.find((t) => t.name === '00_Master_Extractos_IBK')!
    expect(master.calls.length).toBeGreaterThan(0)
    expect(master.folder).toBe('Automation Anywhere/Bots/TESORERIA/002_DescargaExtractosIBK')
    expect(a.edges.length).toBeGreaterThan(0)
  })

  it('classifies localized config/asset folders and links them', () => {
    expect(a.otherFiles.some((f) => f.kind === 'config' && f.path.includes('/Documentos/config/'))).toBe(true)
    expect(a.otherFiles.some((f) => f.kind === 'asset' && f.path.includes('/Documentos/assets/'))).toBe(true)
    expect(a.fileEdges.some((fe) => fe.to.endsWith('.xml'))).toBe(true)
  })

  it('leaves recorder screenshots out of the file list', () => {
    expect(a.otherFiles.some((f) => /Metadata\//.test(f.path))).toBe(false)
  })

  it('numbers the master call sequence from top to bottom', () => {
    const master = a.taskbots.find((t) => t.name === '00_Master_Extractos_IBK')!
    const seq = callSequence(a.taskbots)
    const lines = [...master.calls].sort((x, y) => x.line - y.line).map((c) => c.line)
    expect(lines.map((l) => seq.get(master.path + '|' + l))).toEqual(lines.map((_, i) => i + 1))
    // first executed call is the one on the earliest line
    expect(seq.get(master.path + '|' + Math.min(...lines))).toBe(1)
  })
})

describe('synthetic taskbots', () => {
  const wrap = (nodes: unknown[], variables: unknown[] = []) =>
    JSON.stringify({ nodes, variables, packages: [] })

  const msgBox = (uid: string, closes: boolean) => ({
    uid,
    commandName: 'messageBox',
    packageName: 'MessageBox',
    attributes: [
      { name: 'content', value: { type: 'STRING', string: 'test' } },
      { name: 'closeMsgBox', value: { type: 'BOOLEAN', boolean: closes } },
    ],
  })
  const msgBoxPlus = (uid: string, closes: boolean) => ({
    uid,
    commandName: 'ShowDictionary',
    packageName: 'MessageBoxPlus',
    attributes: [{ name: 'isChecked', value: { type: 'BOOLEAN', boolean: closes } }],
  })
  const log = (uid: string) => ({ uid, commandName: 'log_message', packageName: 'A360BotFramework', attributes: [] })

  it('flags only the boxes that never close', () => {
    const bot = parseTaskbot('Bots/x/tasks/T', 'z', wrap([msgBox('a', false), msgBoxPlus('b', false), msgBox('c', true), msgBoxPlus('d', true)]))
    const blocking = messageBoxRules(bot).filter((f) => f.ruleId === 'MSGBOX_BLOCKING')
    expect(blocking.map((f) => f.line)).toEqual([1, 2])
    expect(blocking.every((f) => f.severity === 'error')).toBe(true)
  })

  it('flags a taskbot with more active boxes than logs', () => {
    const noisy = parseTaskbot('Bots/x/tasks/Noisy', 'z', wrap([msgBox('a', true), msgBox('b', true), log('c')]))
    expect(messageBoxRules(noisy).some((f) => f.ruleId === 'MSGBOX_OVER_LOGS')).toBe(true)

    const quiet = parseTaskbot('Bots/x/tasks/Quiet', 'z', wrap([msgBox('a', true), log('b'), log('c')]))
    expect(messageBoxRules(quiet).some((f) => f.ruleId === 'MSGBOX_OVER_LOGS')).toBe(false)
  })

  it('demands modularization past 250 lines', () => {
    const nodes = Array.from({ length: 251 }, (_, i) => log('n' + i))
    const big = parseTaskbot('Bots/x/tasks/Big', 'z', wrap(nodes))
    const f = structureRules(big).find((x) => x.ruleId === 'TOO_LONG')
    expect(f).toMatchObject({ severity: 'error', params: { lines: '251', max: '250' } })

    const ok = parseTaskbot('Bots/x/tasks/Ok', 'z', wrap(nodes.slice(0, 250)))
    expect(structureRules(ok).some((x) => x.ruleId === 'TOO_LONG')).toBe(false)
  })

  it('measures call depth and exempts allowed utilities', () => {
    const call = (uid: string, target: string) => ({
      uid,
      commandName: 'runTask',
      packageName: 'TaskBot',
      attributes: [
        {
          name: 'taskbot',
          value: { type: 'TASKBOT', taskbotFile: { type: 'FILE', string: 'repository:///' + target } },
        },
      ],
    })
    const p = (n: string) => 'Bots/x/tasks/' + n
    const bots = [
      parseTaskbot(p('000_Master'), 'z', wrap([call('m1', p('001_Step'))])),
      parseTaskbot(p('001_Step'), 'z', wrap([
        call('s1', p('002_Deep')),
        ...CALL_DEPTH_EXEMPT_TASKBOTS.map((name, i) => call('allowed' + i, p(name))),
      ])),
      parseTaskbot(p('002_Deep'), 'z', wrap([])),
      ...CALL_DEPTH_EXEMPT_TASKBOTS.map((name) => parseTaskbot(p(name), 'z', wrap([]))),
    ]
    const g = buildGraph(bots)
    const depth = callDepth(g.edges)
    expect(depth.get(p('000_Master'))).toBe(1)
    expect(depth.get(p('001_Step'))).toBe(2)
    expect(depth.get(p('002_Deep'))).toBe(3)
    for (const name of CALL_DEPTH_EXEMPT_TASKBOTS) expect(depth.get(p(name))).toBe(3)

    const deep = g.findings.filter((f) => f.ruleId === 'CALL_DEPTH')
    expect(deep).toHaveLength(1)
    expect(deep[0]).toMatchObject({ botPath: p('001_Step'), severity: 'error', params: { callee: '002_Deep', depth: '3' } })
  })
})
