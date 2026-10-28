import { actionSummary, actionText, type Flow, type FlowNode, type TddBot, type TddModel } from './tdd'
import { isComment, type ActionNode } from './model'
export interface Diagram { title: string; svg: string; width: number; height: number; caption: string; nodes: string[] }
export function xml(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;') }
function wrap(s: string, max = 66): string[] {
  const out: string[] = []
  for (const line of s.split('\n')) {
    let current = ''
    for (const word of line.split(/\s+/)) {
      if (current && (current + ' ' + word).length > max) { out.push(current); current = '' }
      if (word.length > max) { if (current) { out.push(current); current = '' }; for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max)) }
      else current += (current ? ' ' : '') + word
    }
    if (current) out.push(current)
  }
  return out
}
/** Bounded figures keep source-order placement but draw only compiled runtime transitions. */
export function flowDiagrams(flow: Flow, title: string): Diagram[] {
  const parts: FlowNode[][] = []
  let part: FlowNode[] = [], usedHeight = 70
  for (const node of flow.nodes) {
    const exits = flow.edges.filter(e => e.from === node.id)
    const estimate = 60 + wrap(node.label, 51).length * 18 + wrap(exits.map(e => `${e.label || 'Next'} -> P99 L9999`).join(' | '), 67).length * 15
    if (part.length && usedHeight + estimate > 770) { parts.push(part); part = []; usedHeight = 70 }
    part.push(node); usedHeight += estimate
  }
  if (part.length) parts.push(part)
  const byId = new Map(flow.nodes.map(n => [n.id, n]))
  const partFor = new Map(parts.flatMap((part, i) => part.map(n => [n.id, i + 1] as const)))
  const reference = (id: string) => { const n = byId.get(id)!; return `P${partFor.get(id)} ${n.lines.length ? 'L' + Math.min(...n.lines) : n.label}` }
  return parts.map((part, index) => {
    const positions = new Map<string, { y: number; height: number }>()
    let y = 55
    const nodesSvg: string[] = []
    for (const node of part) {
      const lines = wrap(node.label, 51)
      const exits = flow.edges.filter(e => e.from === node.id)
      const errorRefs = [...new Set(exits.filter(e => e.exception).map(e => `${e.label} -> ${reference(e.to)}`))]
      const distantRefs = exits.filter(e => !e.exception && (e.label || partFor.get(e.to) !== index + 1)).map(e => `${e.label || 'Next'} -> ${reference(e.to)}`)
      const notes = wrap([...errorRefs, ...distantRefs].join(' | '), 67)
      const height = 20 + lines.length * 18 + notes.length * 15
      positions.set(node.id, { y, height })
      const fill = node.kind === 'condition' ? '#fff4d7' : node.kind === 'loop' ? '#e7f3f0' : node.kind === 'terminal' ? '#edf0f4' : '#ffffff'
      nodesSvg.push(`<rect x="35" y="${y}" width="520" height="${height}" rx="${node.kind === 'terminal' ? 18 : 4}" fill="${fill}" stroke="#4c596a"/><text x="49" y="${y + 21}" fill="#111827" font-family="Arial" font-size="15">${lines.map((line, i) => `<tspan x="49" dy="${i ? 18 : 0}">${xml(line)}</tspan>`).join('')}</text>${notes.length ? `<text x="49" y="${y + 21 + lines.length * 18}" fill="#594341" font-family="Arial" font-size="11.5">${notes.map((line, i) => `<tspan x="49" dy="${i ? 15 : 0}">${xml(line)}</tspan>`).join('')}</text>` : ''}`)
      y += height + 35
    }
    const edgesSvg: string[] = []
    let lane = 0
    for (const e of flow.edges) {
      if (e.exception) continue // Every exception destination is printed inside its source node.
      const from = positions.get(e.from), to = positions.get(e.to)
      if (!from || !to) continue
      const sy = from.y + from.height, ty = to.y
      const consecutive = Math.abs(ty - sy - 35) < 1
      if (consecutive) edgesSvg.push(`<path d="M295 ${sy} V${ty - 5}" fill="none" stroke="#314154" stroke-width="1.4" marker-end="url(#arrow)"/>`)
      else {
        const x = 570 + (lane++ % 5) * 16, midFrom = from.y + from.height / 2, midTo = to.y + to.height / 2
        edgesSvg.push(`<path d="M555 ${midFrom} H${x} V${midTo} H561" fill="none" stroke="#314154" stroke-width="1.4" marker-end="url(#arrow)"/>`)
      }
    }
    const width = 650, height = y + 20
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#314154"/></marker></defs><rect width="100%" height="100%" fill="#fff"/><text x="35" y="30" font-family="Arial" font-size="15" font-weight="bold">Part ${index + 1} of ${parts.length}</text>${edgesSvg.join('')}${nodesSvg.join('')}</svg>`
    return { title: `${title} flow part ${index + 1}`, svg, width, height, nodes: part.map(n => n.id), caption: `Part ${index + 1}/${parts.length}. P means diagram part; L means source editor line. Arrows show runtime transitions. Error and continuation destinations appear in the source node. Source scopes refer to the control outcomes table for this Taskbot.` }
  })
}

/** Keep source body phases separate from handlers and each finalizer continuation. */
export function solutionFlows(item: TddBot): { title: string; flow: Flow }[] {
  const groups: { node: ActionNode; lines: Set<number> }[] = []
  const rootTryCount = (item.bot.nodes ?? []).filter(node => node.commandName === 'try').length
  const descendants = (node: ActionNode): number[] => [node.line, ...node.children.flatMap(descendants), ...node.branches.flatMap(descendants)]
  const bodyLines = (node: ActionNode): number[] => {
    const excluded = new Set<number>()
    const roles = (owner: ActionNode) => owner.branches.filter(b => /^(?:catch|finally)$/.test(b.commandName)).forEach(branch => descendants(branch).forEach(line => excluded.add(line)))
    roles(node)
    const children = node.children.filter(child => child.reachable && (!isComment(child) || child.childCount > 0))
    if (/^(?:step|documentation_sequence)$/.test(node.commandName) && children.length === 1 && children[0].commandName === 'try') roles(children[0])
    return descendants(node).filter(line => !excluded.has(line))
  }
  const collect = (nodes: ActionNode[]) => {
    for (const node of nodes) {
      if (/^(?:catch|finally)$/.test(node.commandName)) continue
      const lines = bodyLines(node)
      const authored = /^(?:step|documentation_sequence)$/.test(node.commandName) && lines.length >= 6
      const bodyPhase = node.commandName === 'try' && node.depth === 0 && rootTryCount >= 2 && lines.length >= 6 && lines.length <= 90
      const simpleLoop = node.commandName === 'loop.commands.start' && lines.length >= 30 && item.bot.actions.filter(a => lines.includes(a.line) && /^(?:if|elseIf|try)$/.test(a.commandName)).length <= 1
      if (authored || simpleLoop || bodyPhase) {
        groups.push({ node, lines: new Set(lines) })
        // Source roles excluded above still have their own source phases.
        node.children.filter(child => child.commandName === 'try').forEach(child => collect(child.branches))
        collect(node.branches)
      } else { collect(node.children); collect(node.branches) }
    }
  }
  collect(item.bot.nodes ?? [])
  // Comments can name consecutive source operations without turning editor order into runtime order.
  const commentPhases = (list: ActionNode[]) => {
    for (let i = 0; i < list.length; i++) {
      const owner = list[i]
      if (/comment/i.test(owner.commandName)) {
        let end = i + 1
        while (end < list.length && !/comment/i.test(list[end].commandName)) end++
        const following = list.slice(i + 1, end)
        const lines = following.flatMap(descendants)
        const hasChoice = following.some(node => node.commandName === 'if' && node.branches.length > 0)
        const hasContainer = following.some(node => /^(?:try|step|documentation_sequence)$/.test(node.commandName))
        if (!hasChoice && !hasContainer && lines.length >= 6 && !groups.some(group => lines.some(line => group.lines.has(line)))) groups.push({ node: owner, lines: new Set([owner.line, ...lines]) })
      }
      commentPhases(owner.children); commentPhases(owner.branches)
    }
  }
  commentPhases(item.bot.nodes ?? [])
  const roles: { node: ActionNode; lines: Set<number>; ids: Set<string>; states: Map<string, string> }[] = []
  const collectRoles = (list: ActionNode[]) => {
    for (const node of list) {
      if (/^(?:catch|finally)$/.test(node.commandName)) {
        const lines = new Set(descendants(node)), ids = new Set<string>(), states = new Map<string, string>()
        const entries = item.flow.nodes.filter(source => source.lines.length === 1 && source.lines[0] === node.line && source.kind === 'scope')
        for (const entry of entries) {
          const state = entry.label.match(/\(([^)]+)\)$/)?.[1] ?? 'caught error'
          const queue = [entry.id], visited = new Set<string>()
          for (let i = 0; i < queue.length; i++) {
            if (visited.has(queue[i])) continue
            visited.add(queue[i])
            const source = item.flow.nodes.find(n => n.id === queue[i])!
            if (!source.lines.length || !source.lines.every(line => lines.has(line))) continue
            ids.add(source.id); states.set(source.id, state)
            item.flow.edges.filter(edge => edge.from === source.id).forEach(edge => queue.push(edge.to))
          }
        }
        if (ids.size) roles.push({ node, lines, ids, states })
      }
      collectRoles(node.children); collectRoles(node.branches)
    }
  }
  collectRoles(item.bot.nodes ?? [])
  // Nested handlers belong to the enclosing role's work. A resumed internal action is not a new phase entry.
  roles.sort((a, b) => b.lines.size - a.lines.size)
  const mapping = new Map<string, string>(), nodes: FlowNode[] = []
  const ownership = new Map<string, { group: typeof groups[number] | typeof roles[number]; role?: typeof roles[number] }>()
  const sourceById = new Map(item.flow.nodes.map(n => [n.id, n]))
  for (const source of item.flow.nodes) {
    const candidateRole = roles.find(role => role.ids.has(source.id))
    const phase = groups.find(g => source.lines.length && source.lines.every(line => g.lines.has(line)))
    const role = candidateRole && !(phase && [...candidateRole.lines].every(line => phase.lines.has(line))) ? candidateRole : undefined
    const group = role ?? phase
    const id = group ? 'scope' + group.node.line : source.id
    mapping.set(source.id, id)
    if (group && !ownership.has(id)) ownership.set(id, { group, role })
  }
  for (const source of item.flow.nodes) {
    const id = mapping.get(source.id)!
    if (nodes.some(n => n.id === id)) continue
    const owner = ownership.get(id)
    if (owner) {
      const { group, role } = owner
      const ownedLines = new Set(item.flow.nodes.filter(n => mapping.get(n.id) === id).flatMap(n => n.lines))
      const effects = item.bot.actions.filter(a => ownedLines.has(a.line) && (isEffect(a) || role && /^(?:assign|assignToNumber)$/.test(a.commandName)))
      const families = new Map<string, string>()
      for (const effect of effects) {
        const operation = effect.attributes.find(attribute => /Action$/.test(attribute.name))?.value?.string ?? ''
        const key = `${effect.packageName}:${effect.commandName}:${operation}${effect.commandName === 'runTask' ? ':' + actionText(effect) : ''}`
        if (!families.has(key)) families.set(key, actionSummary(effect))
      }
      const labels = [...new Set(families.values())]
      const calls = effects.filter(effect => effect.commandName === 'runTask')
      const callSummary = calls.length > 2 ? [`Run ${calls.length} Taskbot calls (${calls.length <= 6 ? 'L' + calls.map(call => call.line).join('/') + '; ' : ''}control details)`] : [...new Set(calls.map(actionSummary))]
      const important = [...labels.filter(label => /^(?:Stop task|Throw error)$/.test(label)), ...callSummary, ...labels.filter(label => /^(?:Write|Copy|Delete|Save|Send email)/.test(label))]
      const other = labels.filter(label => !label.startsWith('Run ') || label === 'Run script' || label === 'Run application').sort((a, b) => Number(/^(?:Run script|Send (?:GET|POST) request|Extract|Read)/.test(b)) - Number(/^(?:Run script|Send (?:GET|POST) request|Extract|Read)/.test(a)))
      const summary = [...new Set([...important, ...other])].slice(0, Math.max(4, new Set(important).size))
      const states = role && role.node.commandName === 'finally' ? ` (entry states: ${[...new Set(role.states.values())].join(', ')})` : ''
      const loops = item.bot.actions.filter(a => ownedLines.has(a.line) && a.commandName === 'loop.commands.start').map(a => `L${a.line} ${actionText(a)}`)
      const loopSummary = /comment/i.test(group.node.commandName) && loops.length ? '\nInternal loops: ' + loops.map(label => label.match(/^L\d+/)?.[0]).join(', ') + ' (control details)' : ''
      nodes.push({ id, label: `L${group.node.line}-${Math.max(...ownedLines)} ${actionSummary(group.node)}${states}${summary.length ? '\n' + summary.join(' / ') : ''}${loopSummary}`, lines: [...ownedLines], kind: simpleKind(group.node.commandName), detail: 'Source control and operation details follow this flow.' })
    } else {
      const actions = item.bot.actions.filter(a => source.lines.includes(a.line))
      const preferred = actions.filter(isEffect)
      let operations = [...new Set((preferred.length ? preferred : actions).map(actionSummary))]
      if (operations.includes('Run script')) operations = operations.filter(operation => operation !== 'Open script' && operation !== 'Close script')
      const range = source.lines.length ? `L${Math.min(...source.lines)}${source.lines.length > 1 ? '-' + Math.max(...source.lines) : ''} ` : ''
      nodes.push({ ...source, label: source.kind === 'condition' || source.kind === 'loop' || !source.lines.length ? source.label : range + operations.slice(0, 3).join(' / ') })
    }
  }
  const edges: Flow['edges'] = []
  for (const e of item.flow.edges) {
    const from = mapping.get(e.from)!, to = mapping.get(e.to)!
    const source = sourceById.get(e.from)!, target = sourceById.get(e.to)!
    const loopOwner = groups.find(group => 'scope' + group.node.line === from && group.node.commandName === 'loop.commands.start')
    const iteration = loopOwner && target.lines.includes(loopOwner.node.line) && source.id !== target.id
    const originalLoop = from === source.id && source.id === target.id && source.kind === 'loop'
    if (from === to && !iteration && !originalLoop) continue
    const crossing = from !== e.from || to !== e.to
    const sourceRole = roles.find(role => 'scope' + role.node.line === from && role.ids.has(e.from))
    const pending = sourceRole?.node.commandName === 'finally' ? sourceRole.states.get(e.from) : undefined
    const outcome = target.label === 'Unhandled error' ? 'Propagate error' : target.label === 'Stop task' ? 'Stop task' : /\(propagate error\)$/.test(target.label) ? 'Finally with pending error' : /\(normal return\)$/.test(target.label) ? 'Finally after normal completion' : e.label || (target.kind === 'loop' && from === to ? `Return to loop check L${Math.min(...target.lines)}` : 'Complete phase')
    const roleOutcome = pending ? e.label === 'Stop' ? 'Stop inside finalizer' : `${e.exception ? 'Cleanup error' : pending === 'normal return' ? 'Normal completion' : pending === 'propagate error' ? 'Pending error' : 'Pending ' + pending}: ${outcome}` : sourceRole?.node.commandName === 'catch' && !e.exception ? `Catch completed: ${outcome}` : outcome
    const label = crossing && source.lines.length ? `L${Math.max(...source.lines)} ${roleOutcome}` : e.label || (target.label === 'Unhandled error' ? 'Propagate error' : '')
    const known = edges.find(other => other.from === from && other.to === to && other.exception === e.exception)
    if (!known) edges.push({ ...e, from, to, label })
    else if (roleOutcome && !known.label.includes(roleOutcome)) known.label += ' / ' + roleOutcome
  }
  return [{ title: item.bot.name, flow: { nodes, edges } }]
}
function simpleKind(command: string): FlowNode['kind'] { return command === 'loop.commands.start' ? 'loop' : 'scope' }
function isEffect(action: { commandName: string; packageName: string }): boolean {
  return /^(?:runTask|runApp|openbrowser|restGet|restPost|config_read_xml|unzipFiles|ReadFile|getTextFromFile|deleteFiles|copyFiles|createFile|renameFiles|deleteFolder|createFolder|downloadTo|capture|SendMailV2|executeFunction|vbscript.commands.executeFunction|SetCell|setCellValue|SaveSpreadSheet|SaveSpreadsheet|writeDataTableToWorksheet|writeText|writeToFile|startRecordSession|EndRecordSession|logs_start_session|logs_stop_session|throw|stopTask)$/.test(action.commandName) || /Database|SQL|Crypto|Base64|^SAP$|^Excel(?:_MS)?$|^CsvTxt$/.test(action.packageName)
}
export function dependencyDiagrams(model: TddModel): Diagram[] {
  const nodes: FlowNode[] = model.bots.map((b, i) => ({ id: b.bot.path, label: `T${i + 1} ${b.bot.name}`, lines: [], kind: 'scope', detail: b.bot.path }))
  const individual = model.bots.flatMap(b => b.calls.map(c => {
    const target = c.status === 'included' ? c.target : `${c.status}:${c.target}`
    if (!nodes.some(n => n.id === target)) nodes.push({ id: target, label: `${c.status.toUpperCase()} ${c.target.split('/').pop()}`, lines: [], kind: 'terminal', detail: c.target })
    return { from: b.bot.path, to: target, label: c.disabled ? 'disabled' : c.runtimeReachable === false ? 'unreachable' : 'Run' }
  }))
  const edges = individual.filter((e, i) => individual.findIndex(other => other.from === e.from && other.to === e.to) === i).map(edge => ({ ...edge, label: [...new Set(individual.filter(other => other.from === edge.from && other.to === edge.to).map(other => other.label))].join(' / ') }))
  return flowDiagrams({ nodes, edges }, 'Project dependencies').map(diagram => ({ ...diagram, caption: diagram.caption.replace('Arrows show runtime transitions.', 'Arrows show Taskbot calls.').replace(' Source scopes refer to the control outcomes table for this Taskbot.', '') }))
}
