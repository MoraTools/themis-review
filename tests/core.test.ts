import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeZips } from '../src/core/analyze'
import { extractVarRefs, parseTaskbot } from '../src/core/parse'
import { buildGraph, callDepth, callSequence } from '../src/core/graph'
import { messageBoxRules } from '../src/core/rules/messagebox'
import { structureRules } from '../src/core/rules/structure'
import { hygieneRules } from '../src/core/rules/hygiene'
import { namingRules } from '../src/core/rules/naming'
import { computeMetrics } from '../src/core/metrics'
import { isComment } from '../src/core/model'

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

  it('flags util* taskbots for call depth only at level 4 or deeper', () => {
    const utilFindings = a.findings.filter((f) => f.ruleId === 'CALL_DEPTH' && /^util/i.test(f.params.callee))
    expect(utilFindings.every((f) => Number(f.params.depth) >= 4)).toBe(true)
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
  const bot = (name: string, ...targets: string[]) =>
    parseTaskbot(p(name), 'z', wrap(targets.map((t, i) => call(name + i, p(t)))))

  it('recognizes Automation Anywhere variable reference forms', () => {
    expect(extractVarRefs('$direct$')).toEqual(['direct'])
    expect(extractVarRefs('$pRecDelTXT[0].String:trim.String:uppercase$')).toEqual(['pRecDelTXT'])
    expect(extractVarRefs('$dict{key}$')).toEqual(['dict'])
    expect(extractVarRefs('$value.String:trim$')).toEqual(['value'])
    expect(extractVarRefs('$list[$index$]$')).toEqual(['list', 'index'])
    expect(extractVarRefs('$System:AATaskName$')).toEqual([])

    const structured = parseTaskbot('Bots/x/tasks/Windows', 'z', wrap([
      {
        uid: 'window-vars', commandName: 'activate', packageName: 'Window', attributes: [
          { name: 'source', value: { objectTypeName: 'VARIABLE', string: 'pWinListaAcreedoresSAP' } },
          { name: 'targets', value: { type: 'VARIABLE_MAP', variableMapNames: ['pWinExportarReporteSAP'] } },
        ],
      },
    ], [
      { name: 'pWinListaAcreedoresSAP' },
      { name: 'pWinExportarReporteSAP' },
    ]))
    expect(structured.varRefs.pWinListaAcreedoresSAP).toEqual([1])
    expect(structured.varRefs.pWinExportarReporteSAP).toEqual([1])
  })

  it('finds Window references inside nested condition attributes on the correct action lines', () => {
    const condition = (name: string, value: unknown) => ({
      name: 'condition',
      value: { type: 'CONDITIONAL', conditionalName: 'windowNotExists', packageName: 'Window' },
      attributes: [{ name, value }],
    })
    const bot = parseTaskbot('Bots/x/tasks/Windows', 'z', wrap([
      { uid: 'parent', commandName: 'try', packageName: 'ErrorHandler', children: [
        { uid: 'window', commandName: 'if', packageName: 'If', attributes: [
          condition('window', { type: 'WINDOW', expression: '$cWinList$' }),
          condition('window', { type: 'WINDOW', expression: '$cWinList$' }),
        ] },
        { uid: 'object', commandName: 'if', packageName: 'If', attributes: [
          condition('uiObject', { type: 'UIOBJECT', uiObjectWindow: { type: 'WINDOW', expression: '$cWinList$' } }),
        ] },
      ], branches: [
        { uid: 'export', commandName: 'if', packageName: 'If', attributes: [
          condition('window', { type: 'WINDOW', expression: '$cWinExport$' }),
        ] },
      ] },
    ], [{ name: 'cWinList' }, { name: 'cWinExport' }, { name: 'pStrUnused', defaultValue: '$pStrUnused$' }]))
    expect(bot.varRefs.cWinList).toEqual([2, 3])
    expect(bot.varRefs.cWinExport).toEqual([4])
    expect(bot.varRefs.pStrUnused).toBeUndefined()
  })

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

  it('measures call depth: any taskbot at 1-2, only util* at 3, none at 4+', () => {
    const bots = [
      bot('000_Master', '001_Step', 'util_atLevel2'),
      bot('001_Step', 'util_mensajeria', 'Utilidad_Config', '002_Deep'),
      bot('002_Deep', 'util_atLevel4', '003_Deeper'),
      bot('util_atLevel2'),
      bot('util_mensajeria'),
      bot('Utilidad_Config'),
      bot('util_atLevel4'),
      bot('003_Deeper'),
    ]
    const g = buildGraph(bots)
    const depth = callDepth(g.edges)
    expect(depth.get(p('000_Master'))).toBe(1)
    expect(depth.get(p('001_Step'))).toBe(2)
    expect(depth.get(p('util_atLevel2'))).toBe(2)
    expect(depth.get(p('util_mensajeria'))).toBe(3)
    expect(depth.get(p('Utilidad_Config'))).toBe(3)
    expect(depth.get(p('002_Deep'))).toBe(3)
    expect(depth.get(p('util_atLevel4'))).toBe(4)
    expect(depth.get(p('003_Deeper'))).toBe(4)

    const flagged = g.findings
      .filter((f) => f.ruleId === 'CALL_DEPTH')
      .map((f) => [f.botPath, f.params?.callee, f.params?.depth, f.severity])
    expect(flagged).toEqual([
      [p('001_Step'), '002_Deep', '3', 'error'],
      [p('002_Deep'), 'util_atLevel4', '4', 'error'],
      [p('002_Deep'), '003_Deeper', '4', 'error'],
    ])
  })

  it('judges call depth by the level of each call, not the callee minimum depth', () => {
    const levelOf = (bots: ReturnType<typeof bot>[]) =>
      buildGraph(bots).findings
        .filter((f) => f.ruleId === 'CALL_DEPTH')
        .map((f) => [f.botPath, f.params?.callee, f.params?.depth])

    // 200 is also called from the master, but 100 -> 200 is a level-3 call
    expect(levelOf([bot('000', '100', '200'), bot('100', '200'), bot('200')])).toEqual([[p('100'), '200', '3']])
    // util* at level 3 is allowed, also when the master calls it at level 2
    expect(levelOf([bot('000', '100'), bot('100', 'utilidad_x'), bot('utilidad_x')])).toEqual([])
    expect(levelOf([bot('000', '100', 'utilidad_x'), bot('100', 'utilidad_x'), bot('utilidad_x')])).toEqual([])
    expect(levelOf([bot('000', '100'), bot('100', 'utilidad_x'), bot('utilidad_x', 'utilidad_y'), bot('utilidad_y')]))
      .toEqual([[p('utilidad_x'), 'utilidad_y', '4']])
  })

  it('reads catch returns as variable references', () => {
    const errVar = (name: string) => ({ type: 'VARIABLE', variableName: name })
    const tb = parseTaskbot('Bots/x/tasks/Catch', 'z', wrap([
      { uid: 'try', commandName: 'try', packageName: 'ErrorHandler', children: [log('l')], branches: [
        { uid: 'catch', commandName: 'catch', packageName: 'ErrorHandler', children: [log('l2')],
          returns: { errorMessage: errVar('pStrErr'), errorLineNumber: errVar('pNumLine') } },
      ] },
    ], [{ name: 'pStrErr', type: 'STRING' }, { name: 'pNumLine', type: 'NUMBER' }]))
    const catchLine = tb.actions.find((x) => x.commandName === 'catch')!.line
    expect(tb.varRefs.pStrErr).toEqual([catchLine])
    expect(tb.varRefs.pNumLine).toEqual([catchLine])
    const unused = hygieneRules(tb, computeMetrics(tb)).filter((f) => f.ruleId === 'UNUSED_VAR')
    expect(unused).toEqual([])
  })

  it('counts Log to file as a log', () => {
    const logFile = (uid: string) => ({ uid, commandName: 'logToFile', packageName: 'LogToFile', attributes: [] })
    const quiet = parseTaskbot('Bots/x/tasks/Quiet', 'z', wrap([msgBox('a', true), logFile('b')]))
    expect(messageBoxRules(quiet).some((f) => f.ruleId === 'MSGBOX_OVER_LOGS')).toBe(false)
    const logged = parseTaskbot('Bots/x/tasks/Logged', 'z', wrap(Array.from({ length: 10 }, (_, i) => logFile('n' + i))))
    expect(hygieneRules(logged, computeMetrics(logged)).some((f) => f.ruleId === 'NO_LOGS')).toBe(false)
  })

  it('finds drive, URL-file and UNC paths, not web URLs or variable paths', () => {
    const pathOf = (text: string) => {
      const tb = parseTaskbot('Bots/x/tasks/P', 'z', wrap([
        { uid: 'a', commandName: 'assign', packageName: 'String', attributes: [{ name: 'source', value: { type: 'STRING', string: text } }] },
      ]))
      return structureRules(tb).find((f) => f.ruleId === 'HARDCODED_PATH')?.params.path
    }
    expect(pathOf('C:\\RPA\\x')).toBe('C:\\RPA\\x')
    expect(pathOf('D:\\data')).toBe('D:\\data')
    expect(pathOf('C:/RPA/x')).toBe('C:/RPA/x')
    expect(pathOf('file:///C:/RPA/x')).toBe('file:///C:/RPA/x')
    expect(pathOf('\\\\server\\share\\x')).toBe('\\\\server\\share\\x')
    for (const text of ['https://x.com/a:\\b', 'https://x.com/page', '$pStrBase$\\sub\\file.txt', '$pDictConfig{BaseLocal}$\\Logs', '$pStrBase$\\\\x']) {
      expect(pathOf(text)).toBeUndefined()
    }
  })

  it('counts Bot Framework caution steps as comments', () => {
    expect(isComment({ commandName: 'documentation_caution_sequence' })).toBe(true)
  })

  it('suggests names without eating a first letter or doubling the type', () => {
    const cases: [string, string, string][] = [
      ['contador', 'STRING', 'pStrContador'],
      ['viejo1', 'STRING', 'pStrViejo1'],
      ['copia', 'STRING', 'pStrCopia'],
      ['information', 'STRING', 'pStrInformation'],
      ['strProveedor', 'STRING', 'pStrProveedor'],
      ['numTotal', 'NUMBER', 'pNumTotal'],
      ['vStrNombre', 'STRING', 'pStrNombre'],
      ['vTotal', 'NUMBER', 'pNumTotal'],
      ['pNumTotal', 'STRING', 'pStrTotal'],
      ['x', 'STRING', 'pStrX'],
    ]
    const tb = parseTaskbot('Bots/x/tasks/N', 'z', wrap([], cases.map(([name, type]) => ({ name, type, description: 'd' }))))
    const suggested = Object.fromEntries(
      namingRules(tb).filter((f) => f.params?.suggestion).map((f) => [f.varName ?? f.params!.name, f.params!.suggestion]),
    )
    for (const [name, , expected] of cases) expect([name, suggested[name]]).toEqual([name, expected])
  })
})
