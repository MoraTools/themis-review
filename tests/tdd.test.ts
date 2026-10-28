import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { analyzeZips } from '../src/core/analyze'
import { parseTaskbot } from '../src/core/parse'
import { actionDetails, actionSummary, actionText, buildFlow, buildTdd } from '../src/core/tdd'
import { solutionFlows, flowDiagrams, xml } from '../src/core/tddDiagrams'
import { prepareTdd } from '../src/core/tddExport'

const node = (uid: string, commandName = 'assign', children: object[] = [], branches: object[] = [], attributes: object[] = []) => ({ uid, commandName, packageName: 'Test', children, branches, attributes })
const bot = (nodes: object[]) => parseTaskbot('Bots/tasks/Test', 'fixture.zip', JSON.stringify({ nodes, variables: [] }))
function line(flow: ReturnType<typeof buildFlow>, n: number) { return flow.nodes.find(v => v.lines.includes(n))! }
function target(flow: ReturnType<typeof buildFlow>, source: number, label: string) { const id = flow.edges.find(e => e.from === line(flow, source).id && e.label === label)?.to; return flow.nodes.find(n => n.id === id) }
const DATA = join(__dirname, '..', '.data')
const load = (name: string) => analyzeZips([{ name, data: new Uint8Array(readFileSync(join(DATA, name))) }])

describe('deterministic runtime flow', () => {
  it('chains sibling elseif false paths while each true arm joins the same continuation', () => {
    const b = bot([node('if', 'if', [node('yes')], [node('elif1', 'elseIf', [node('yes1')]), node('elif2', 'elseIf', [node('yes2')]), node('else', 'else', [node('other')])]), node('after', 'runTask')])
    const f = buildFlow(b)
    expect(target(f, 1, 'False')?.lines).toContain(3)
    expect(target(f, 3, 'False')?.lines).toContain(5)
    expect(target(f, 5, 'False')?.lines).toContain(8)
    for (const l of [2, 4, 6, 8]) expect(target(f, l, '')?.lines).toContain(9)
  })
  it('routes continue to the nearest loop and break to its next sibling', () => {
    const b = bot([node('outer', 'loop.commands.start', [node('inner', 'loop.commands.start', [node('if', 'if', [node('continue', 'loop.commands.continue')]), node('break', 'loop.commands.break')]), node('afterInner', 'runTask')]), node('afterOuter', 'runTask')])
    const f = buildFlow(b)
    expect(target(f, 4, 'Continue')?.lines).toContain(2)
    expect(target(f, 5, 'Break')?.lines).toContain(6)
    expect(target(f, 1, 'Done / condition false')?.lines).toContain(7)
  })
  it('enters post-test loop bodies before evaluating the condition', () => {
    const attrs = (atEnd: boolean) => [{ name: 'loopType', value: { string: 'WHILE' } }, { name: 'condition', value: { conditionalName: 'booleanVariable' }, attributes: [{ name: 'variable', value: { expression: '$pFlag$' } }, { name: 'operator', value: { string: 'EQ' } }, { name: 'value', value: { boolean: true } }] }, { name: 'checkConditionAtEnd', value: { boolean: atEnd } }]
    for (const atEnd of [false, true]) {
      const b = bot([node('loop', 'loop.commands.start', [node('body', 'runTask')], [], attrs(atEnd)), node('after', 'runTask')])
      const flow = buildFlow(b), start = flow.nodes.find(node => node.label === 'Start')!
      const entry = flow.nodes.find(node => node.id === flow.edges.find(edge => edge.from === start.id)!.to)!
      expect(entry.lines).toContain(atEnd ? 2 : 1)
      expect(target(flow, 1, 'Condition true')?.lines).toContain(2)
      expect(target(flow, 1, 'Condition false')?.lines).toContain(3)
      expect(actionText(b.actions[0])).toContain(`condition ${atEnd ? 'after' : 'before'} body`)
      expect(actionText(b.actions[0])).toContain('$pFlag$')
    }
  })
  it('runs finally on Stop inside Try and skips actions after the finalizer', () => {
    const b = bot([node('try', 'try', [node('stop', 'stopTask'), node('skip', 'runTask')], [node('catch', 'catch', [node('catchCall', 'runTask')]), node('finally', 'finally', [node('cleanup', 'runTask')])]), node('after', 'runTask')])
    const f = buildFlow(b)
    const finalizer = target(f, 2, 'Stop')!
    expect(finalizer.label).toContain('(stop)')
    const cleanupId = f.edges.find(e => e.from === finalizer.id)?.to
    const cleanup = f.nodes.find(n => n.id === cleanupId)!
    expect(cleanup.lines).toContain(7)
    expect(f.nodes.some(n => n.lines.includes(3))).toBe(false)
    expect(f.edges.find(e => e.from === cleanup.id && !e.exception)?.to).toEqual(f.nodes.find(n => n.label === 'Stop task')?.id)
  })
  it('Stop inside Finally skips the rest of Finally', () => {
    const b = bot([node('try', 'try', [node('body', 'runTask')], [node('finally', 'finally', [node('stop', 'stopTask'), node('skip', 'runTask')])]), node('after', 'runTask')])
    const f = buildFlow(b)
    expect(target(f, 4, 'Stop')?.label).toBe('Stop task')
    expect(f.nodes.some(n => n.lines.includes(5))).toBe(false)
    expect(f.nodes.some(n => n.lines.includes(6))).toBe(false)
  })
  it('continues after failed Catch actions when continueOnError is true', () => {
    const b = bot([node('try', 'try', [node('throw', 'throw')], [node('catch', 'catch', [node('failed', 'throw'), node('next', 'runTask')], [], [{ name: 'continueOnError', value: { boolean: true } }])])])
    const f = buildFlow(b)
    expect(target(f, 2, 'Throw')?.lines).toContain(3)
    expect(target(f, 4, 'Error ignored')?.lines).toContain(5)
    expect(f.edges.some(e => e.label === 'Type does not match')).toBe(false)
  })
  it('preserves the pending Stop state in the shared finalizer view', () => {
    const b = bot([node('try', 'try', [node('choice', 'if', [node('stop', 'stopTask')]), node('normal', 'runTask')], [node('finally', 'finally', [node('cleanup', 'runTask')])])])
    const analysis = analyzeZips([{ name: 'fixture.zip', data: zipSync({ 'Bots/tasks/Test': strToU8(JSON.stringify({ nodes: b.nodes, variables: [] })) }) }])
    const flow = solutionFlows(buildTdd(analysis).bots[0])[0].flow
    expect(flow.nodes.some(n => n.label.includes('entry states:') && n.label.includes('stop'))).toBe(true)
    expect(flow.edges.some(e => e.label.includes('Pending stop'))).toBe(true)
    expect(flow.edges.some(e => e.label.includes('Normal completion'))).toBe(true)
  })
  it('does not turn a nested catch inside a finalizer into a phase cycle', () => {
    const b = bot([node('outer', 'try', [node('body', 'runTask')], [node('finally', 'finally', [node('before', 'runTask'), node('inner', 'try', [node('inside', 'runTask')], [node('catch', 'catch', [node('repair', 'runTask')])]), node('after', 'runTask')])])])
    const full = buildFlow(b)
    const projected = solutionFlows({ bot: b, flow: full, images: [], calls: [], imageIssues: [], references: [] })[0].flow
    for (const graph of [full, projected]) {
      const degree = new Map(graph.nodes.map(node => [node.id, graph.edges.filter(edge => edge.to === node.id).length]))
      const queue = graph.nodes.filter(node => degree.get(node.id) === 0).map(node => node.id)
      for (let i = 0; i < queue.length; i++) for (const edge of graph.edges.filter(edge => edge.from === queue[i])) { degree.set(edge.to, degree.get(edge.to)! - 1); if (degree.get(edge.to) === 0) queue.push(edge.to) }
      expect(queue.length).toBe(graph.nodes.length)
    }
  })
  it('keeps a nested Step catch and its later work in one phase without a cycle', () => {
    const b = bot([node('step', 'step', [node('before', 'runTask'), node('before2', 'runTask'), node('inner', 'try', [node('inside', 'runTask')], [node('catch', 'catch', [node('repair', 'runTask')])]), node('after', 'runTask')])])
    const full = buildFlow(b)
    const projected = solutionFlows({ bot: b, flow: full, images: [], calls: [], imageIssues: [], references: [] })[0].flow
    const phase = projected.nodes.find(node => node.lines.includes(5))!
    expect(phase.lines).toContain(6); expect(phase.lines).toContain(7); expect(phase.lines).toContain(8)
    expect(projected.edges.some(edge => edge.from === edge.to)).toBe(false)
    expect(projected.nodes.filter(node => node.lines.length)).toHaveLength(1)
  })
  it('preserves datetime operands, an empty string, loop count and recorder predicate context', () => {
    const condition = (kind: string, attributes: object[]) => [{ name: 'condition', value: { type: 'CONDITIONAL', conditionalName: kind }, attributes }]
    const b = bot([node('date', 'if', [], [], condition('dateVariable', [{ name: 'sourceDateTime', value: { expression: '$pStart$' } }, { name: 'operator', value: { string: 'LT' } }, { name: 'destDateTime', value: { expression: '$pEnd$' } }])), node('empty', 'if', [], [], condition('stringVariable', [{ name: 'variable', value: { expression: '$pText$' } }, { name: 'operator', value: { string: 'EQ' } }, { name: 'value', value: { string: '' } }])), node('loop', 'loop.commands.start', [], [], [{ name: 'iterator', value: { iteratorName: 'loop.iterators.times' }, attributes: [{ name: 'times', value: { number: '10' } }] }]), node('exists', 'if', [], [], condition('capture', [{ name: 'uiObject', value: { uiObject: { controlType: 'LABEL', criteria: { 'HTML InnerText': { enabled: true, value: { string: 'Login failed' } } } }, uiObjectWindow: { expression: '$pWinLogin$' } } }]))])
    expect(actionText(b.actions[0])).toContain('$pStart$ Less than (<) $pEnd$')
    expect(actionText(b.actions[1])).toContain('Equals to (=) ""')
    expect(actionText(b.actions[2])).toContain('times 10')
    expect(actionText(b.actions[3])).toContain('captured object exists on LABEL')
    expect(actionText(b.actions[3])).toContain('$pWinLogin$')
  })
  it('shows source-backed elseif conditions and keeps task calls explicit', () => {
    const a = load('000_MasterCargaMovimientosExactus.zip'), m = buildTdd(a)
    const item = m.bots.find(b => b.bot.name === '002_CargaExactus')!
    for (const n of item.bot.actions.filter(a => a.commandName === 'elseIf')) expect(actionText(n)).not.toBe('If: elseIf')
    for (const call of item.calls.filter(c => !c.disabled)) expect(item.flow.nodes.some(n => n.lines.length === 1 && n.lines[0] === call.line)).toBe(true)
  })
})

describe('TDD source coverage and boundaries', () => {
  it('uses concise source operations for the real Exactus diagram example', () => {
    const item = buildTdd(load('000_MasterCargaMovimientosExactus.zip')).bots.find(bot => bot.bot.name === '001_TomaSaldosYTxtATrabajar')!
    const flow = solutionFlows(item)[0].flow
    const expected = new Map([[11, 'L11-12 Extract ZIP'], [14, 'L14 Log warning'], [16, 'L16-20 Run script'], [23, 'L23-25 Read file / Copy file']])
    for (const [line, label] of expected) {
      const node = flow.nodes.find(node => node.lines.includes(line))!
      expect(node.label).toBe(label)
      expect(node.label).not.toMatch(/file:\/\/|vbscript\.commands|\$/)
    }
    expect(item.bot.actions.find(action => action.line === 11)?.commandName).toBe('unzipFiles')
  })
  it('changes presentation without changing graph IDs edges controls or source actions', () => {
    const conditional = [{ name: 'condition', value: { conditionalName: 'stringVariable' }, attributes: [{ name: 'variable', value: { expression: '$pName$' } }, { name: 'operator', value: { string: 'EQ' } }, { name: 'value', value: { string: 'A' } }] }]
    const b = bot([node('if', 'if', [node('copy', 'copyFiles')], [node('else', 'else', [node('read', 'ReadFile')])], conditional), node('loop', 'loop.commands.start')])
    const full = buildFlow(b), original = JSON.stringify(full), actions = JSON.stringify(b.actions)
    const presented = solutionFlows({ bot: b, flow: full, images: [], calls: [], imageIssues: [], references: [] })[0].flow
    expect(presented.nodes.map(({ id, kind, lines }) => ({ id, kind, lines }))).toEqual(full.nodes.map(({ id, kind, lines }) => ({ id, kind, lines })))
    expect(presented.edges).toEqual(full.edges)
    expect(presented.nodes.find(node => node.kind === 'condition')?.label).toBe(full.nodes.find(node => node.kind === 'condition')?.label)
    expect(JSON.stringify(full)).toBe(original); expect(JSON.stringify(b.actions)).toBe(actions)
    const session = bot([node('session', 'startSession')]).actions[0]
    expect(actionSummary(session)).toBe('Open session')
    expect(actionSummary({ ...session, packageName: 'XML' })).toBe('Open XML')
  })
  it('omits caller and package tables while retaining calls and raw package metadata', async () => {
    const source = (packages: { name: string; version: string }[], nodes: object[] = []) => strToU8(JSON.stringify({ nodes, variables: [], packages }))
    const analysis = analyzeZips([{ name: 'fixture.zip', data: zipSync({
      'Bots/X/tasks/A': source([{ name: 'Excel', version: '1.0.0' }, { name: 'Excel', version: '2.0.0' }], [node('call', 'runTask', [], [], [{ name: 'taskbot', value: { taskbotFile: { string: 'repository:///Bots/Y/tasks/A' }, taskbotInput: { dictionary: [{ key: 'input', value: { string: 'value' } }] } } }])]),
      'Bots/Y/tasks/A': source([{ name: 'Excel', version: '2.0.0' }]),
    }) }])
    const model = buildTdd(analysis)
    const rawPackages = JSON.stringify(analysis.taskbots.map(bot => bot.packages))
    const prepared = await prepareTdd(model, async () => ({ data: new Uint8Array(), width: 1, height: 1 }))
    const tables = prepared.blocks.filter(block => block.kind === 'table')
    expect(tables.some(table => table.headers.includes('Package') || table.headers.includes('Input mapping') || table.headers.includes('Caller and line'))).toBe(false)
    expect(tables.some(table => table.headers.includes('Version'))).toBe(false)
    expect(JSON.stringify(analysis.taskbots.map(bot => bot.packages))).toBe(rawPackages)
    expect(model.bots[0].calls).toHaveLength(1)
    expect(model.bots[0].calls[0].inputs).toContain('input: value')
    const architecture = prepared.blocks.findIndex(block => block.kind === 'heading' && block.text === 'Architecture and dependencies')
    expect(prepared.blocks[architecture]).toMatchObject({ page: true })
    expect(prepared.blocks[architecture + 1]).toMatchObject({ kind: 'heading', page: false })
    expect(prepared.blocks[architecture + 2]).toMatchObject({ kind: 'image' })
  })
  it('finds valid Taskbots whose names contain periods', () => {
    const a = load('00_Master_Registro_Factura.zip')
    expect(a.taskbots.map(b => b.name)).toContain('001.1_Validacion_Redondeo')
    expect(a.taskbots.length).toBe(10)
  })
  it('detects Taskbots by JSON source rather than binary-looking file names', () => {
    const source = strToU8(' '.repeat(100) + JSON.stringify({ nodes: [node('step')], variables: [] }))
    const analysis = analyzeZips([{ name: 'fixture.zip', data: zipSync({ 'Bots/tasks/Report.pdf': source, 'Bots/tasks/Icon.png': source, 'Bots/assets/plain.json': strToU8('{"content":"asset"}') }) }])
    expect(analysis.taskbots.map(b => b.name)).toEqual(['Report.pdf', 'Icon.png'])
    expect(analysis.otherFiles.map(f => f.path)).toContain('Bots/assets/plain.json')
  })
  it('formats the source grouped condition and identifies included Taskbot references', () => {
    const exactus = buildTdd(load('000_MasterCargaMovimientosExactus.zip'))
    const b = exactus.bots.find(b => b.bot.name === '004_DefineYValidaFolderYDiaATrabajar')!
    const label = actionText(b.bot.actions[37])
    expect(label).toContain('AND'); expect(label).toContain('“txt”'); expect(label).toContain('“ism_”')
    const framework = buildTdd(load('Framework.zip'))
    const master = framework.bots.find(b => b.bot.name === '000_MasterFrameworkTemplate')!
    expect(master.references.find(r => r.line === 55)?.files.some(path => path.endsWith('/001_TareaEjemplo'))).toBe(true)
  })
  it('formats an outer group connector without dropping either predicate', () => {
    const predicate = (value: string) => ({ value: { type: 'CONDITIONAL', conditionalName: 'stringVariable' }, attributes: [{ name: 'variable', value: { expression: '$pText$' } }, { name: 'operator', value: { string: 'EQ' } }, { name: 'value', value: { string: value } }] })
    const b = bot([node('if', 'if', [], [], [{ name: 'condition', value: { type: 'CONDITIONALGROUP' }, groupAttribute: predicate('A'), operatorAttribute: { ...predicate('B'), operator: 'OR' } }])])
    const label = actionText(b.actions[0]); expect(label).toContain('“A”'); expect(label).toContain('“B”'); expect(label).toContain('OR')
  })
  it('shows essential effects and keeps finalizer continuation states separate in compact flows', () => {
    const model = buildTdd(load('Framework.zip'))
    const cleanup = model.bots.find(b => b.bot.name === 'utilidad_limpiezaGrabaciones')!
    expect(solutionFlows(cleanup)[0].flow.nodes.map(n => n.label).join('\n')).toContain('Delete')
    const master = solutionFlows(model.bots.find(b => b.bot.name === '000_MasterFrameworkTemplate')!)[0].flow
    const finals = master.nodes.filter(n => n.label.includes('Finally'))
    expect(finals.some(n => n.label.includes('normal return') && n.label.includes('propagate error'))).toBe(true)
    expect(master.edges.some(e => e.label.includes('Normal completion'))).toBe(true)
    expect(master.edges.some(e => e.label.includes('Pending error'))).toBe(true)
    expect(master.edges.some(e => finals.some(finalizer => finalizer.id === e.from) && e.from === e.to)).toBe(false)
    const full = model.bots.find(b => b.bot.name === '000_MasterFrameworkTemplate')!.flow
    expect(full.nodes.filter(n => n.label.includes('Finally (')).length).toBe(2)
  })
  it('assigns each source command to one visible phase in the real Exactus flows', () => {
    const model = buildTdd(load('000_MasterCargaMovimientosExactus.zip'))
    for (const item of model.bots) {
      const owned = new Map<number, string>()
      for (const view of solutionFlows(item)) for (const phase of view.flow.nodes) for (const line of phase.lines) {
        expect(owned.has(line), `${item.bot.name} L${line} appears in ${owned.get(line)} and ${phase.id}`).toBe(false)
        owned.set(line, phase.id)
      }
      for (const line of new Set(item.flow.nodes.flatMap(node => node.lines))) expect(owned.has(line)).toBe(true)
    }
  })
  it('preserves the real XML Excel and conversion catch resume points inside their Steps', () => {
    const cases = [
      ['00_Master_Registro_Factura.zip', '001.1_Validacion_Redondeo', 36, 37, 38],
      ['00_Master_Registro_Factura.zip', '001.1_Validacion_Redondeo', 45, 46, 47],
      ['00_Master_Extractos_IBK.zip', 'utilidad_actualizarHistoricoIBK', 217, 218, 220],
    ] as const
    for (const [zip, name, operation, handler, resume] of cases) {
      const item = buildTdd(load(zip)).bots.find(bot => bot.bot.name === name)!
      const projected = solutionFlows(item)[0].flow
      const owner = projected.nodes.find(node => node.lines.includes(operation))!
      expect(owner.lines).toContain(handler); expect(owner.lines).toContain(resume)
      expect(projected.edges.some(edge => edge.from === owner.id && edge.to === owner.id)).toBe(false)
      const catchNode = item.flow.nodes.find(node => node.lines.includes(handler))!
      const queue = [catchNode.id], seen = new Set<string>()
      for (let i = 0; i < queue.length; i++) { if (seen.has(queue[i])) continue; seen.add(queue[i]); if (item.flow.nodes.find(node => node.id === queue[i])?.lines.includes(resume)) break; item.flow.edges.filter(edge => edge.from === queue[i] && !edge.exception).forEach(edge => queue.push(edge.to)) }
      expect([...seen].some(id => item.flow.nodes.find(node => node.id === id)?.lines.includes(resume))).toBe(true)
    }
  })
  it('leaves introduction and process summary exactly empty', () => {
    const m = buildTdd(load('Framework.zip'))
    expect(m.introduction).toBe(''); expect(m.processSummary).toBe('')
  })
  it('retains both terminal effects and every named WorldCheck call in a compact phase', () => {
    const worldCheck = readdirSync(DATA).find(name => /WorldCheck.*\.zip$/i.test(name))!
    const item = buildTdd(load(worldCheck)).bots.find(bot => bot.bot.name === '000_MasterWorldCheck')!
    const phase = solutionFlows(item)[0].flow.nodes.find(node => node.id === 'scope54')!
    expect(phase.label).toContain('Stop task'); expect(phase.label).toContain('Throw error')
    expect(phase.label).toContain('Run 5 Taskbot calls (L59/63/71/77/92; control details)')
    expect(phase.label).toContain('Delete files')
    const calls = item.bot.actions.filter(action => phase.lines.includes(action.line) && action.commandName === 'runTask')
    expect(calls.map(call => call.line)).toEqual([59, 63, 71, 77, 92])
    expect(actionText(calls[3])).toContain('003_GeneraPDFyCopiaACompartido')
    expect(actionText(calls[4])).toContain('004_RegistroResultadosSheet')
    expect(phase.label.length).toBeLessThan(180)
  })
  it('keeps short safe Recorder control names in real Exactus nodes and screenshot captions', async () => {
    const model = buildTdd(load('000_MasterCargaMovimientosExactus.zip'))
    const item = model.bots.find(bot => bot.bot.name === '002_CargaExactus')!
    for (const [sourceLine, name] of [[72, 'Siguiente >'], [73, 'Finalizar']] as const) {
      const action = item.bot.actions.find(action => action.line === sourceLine)!
      expect(actionSummary(action)).toBe(`Click “${name}”`)
      expect(actionText(action)).toContain('$pWinAsistente$')
    }
    const prepared = await prepareTdd(model, async () => ({ data: new Uint8Array(), width: 1, height: 1 }))
    const headings = prepared.blocks.filter(block => block.kind === 'heading').map(block => block.text)
    const captions = prepared.blocks.filter(block => block.kind === 'image').map(block => block.caption)
    expect(headings).toContain('L72 Click “Siguiente >”'); expect(headings).toContain('L73 Click “Finalizar”')
    expect(captions.some(caption => caption.includes('L72 | Click “Siguiente >”'))).toBe(true)
    expect(captions.some(caption => caption.includes('L73 | Click “Finalizar”'))).toBe(true)
  })
  it('preserves each full screenshot reference, including the three comment images', () => {
    const m = buildTdd(load('Export.cumplimiento_nopkg.mora.creator2.zip'))
    const item = m.bots.find(b => b.bot.name === '002_BusquedaIndividualIdecon')!
    const images = item.images.filter(i => i.actionUid === '941defb1-08ea-42d6-bacc-d11e1452c429')
    expect(images).toHaveLength(3)
    expect(images.every(i => i.role === 'documentation')).toBe(true)
    expect(new Set(images.map(i => i.source)).size).toBe(3)
  })
  it('uses full recorder screenshot at the correct action and reports an absent screenshot', () => {
    const exactus = buildTdd(load('000_MasterCargaMovimientosExactus.zip')).bots.find(b => b.bot.name === '002_CargaExactus')!
    const image = exactus.images.find(i => i.actionUid === '5f9702c2-a76a-40a7-8e47-834508bf145c')!
    expect(image.line).toBe(10)
    expect(image.source).toContain('dc54a3fb-45dc-40ab-a2c4-5ad6a16d3dc2.png')
    const ibk = buildTdd(load('00_Master_Extractos_IBK.zip')).bots.find(b => b.bot.name === '03_Cargar_Extractos IBK')!
    expect(ibk.imageIssues.join()).toContain('93be2d33-f7fb-4c45-b5e5-f1baff35fcb6.png')
  })
  it('keeps missing, dynamic and filesystem calls visible', () => {
    const call = (uid: string, value: object) => node(uid, 'runTask', [], [], [{ name: 'taskbot', value: { type: 'TASKBOT', taskbotFile: value } }])
    const b = bot([call('missing', { string: 'repository:///Bots/tasks/Absent' }), call('dynamic', { expression: '$iStrBot$' }), call('disk', { string: 'C:\\bots\\bot' })])
    const a = analyzeZips([{ name: 'fixture.zip', data: zipSync({ 'Bots/tasks/Test': strToU8(JSON.stringify({ nodes: b.nodes, variables: [] })) }) }])
    expect(buildTdd(a).bots[0].calls.map(c => c.status)).toEqual(['missing', 'dynamic', 'filesystem'])
  })
  it('masks named secrets and recorder password literals and escapes diagram text', () => {
    const b = bot([node('secret', 'assign', [], [], [{ name: 'password', value: { string: 'must-never-export' } }]), node('capture', 'capture', [], [], [{ name: 'passwordtextAction', value: { string: 'SET_TEXT' } }, { name: 'valueCV', value: { string: 'another-secret' } }])])
    for (const a of b.actions) expect(actionDetails(a) + actionText(a)).not.toMatch(/must-never-export|another-secret/)
    expect(xml('<a&"')).toBe('&lt;a&amp;&quot;')
  })
  it('masks literal authentication headers but retains source variable references', () => {
    const b = bot([node('rest', 'restPost', [], [], [{ name: 'headers', value: { dictionary: [{ key: 'Authorization', value: { string: 'Bearer TEST_SECRET_SENTINEL' } }, { key: 'Proxy-Authorization', value: { expression: '$pStrHeader$' } }, { key: 'Cookie', value: { string: 'session=COOKIE_SECRET' } }] } }])])
    expect(actionDetails(b.actions[0])).not.toMatch(/TEST_SECRET_SENTINEL|COOKIE_SECRET/)
    expect(actionDetails(b.actions[0])).toContain('$pStrHeader$')
    expect(actionDetails(b.actions[0])).toContain('[REDACTED]')
  })
  it('keeps all archives separate and each included Taskbot has an overview', () => {
    for (const name of readdirSync(DATA).filter(n => n.endsWith('.zip'))) {
      const m = buildTdd(load(name))
      expect(m.bots.length).toBeGreaterThan(0)
      for (const b of m.bots) {
        const views = solutionFlows(b); expect(views).toHaveLength(1)
        const diagrams = flowDiagrams(views[0].flow, views[0].title)
        expect(diagrams.length).toBeGreaterThan(0)
        for (const diagram of diagrams) expect(diagram.height, diagram.title).toBeLessThanOrEqual(800)
      }
    }
  })
})
