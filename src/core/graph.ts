import type { Finding, GraphEdge, Taskbot } from './model'

export interface GraphResult {
  edges: GraphEdge[]
  ghostPaths: string[]
  findings: Finding[]
}

export function buildGraph(taskbots: Taskbot[]): GraphResult {
  const byPath = new Map(taskbots.map((t) => [t.path, t]))
  const inputsByPath = new Map(taskbots.map((bot) => [bot.path, new Set(bot.variables.filter((v) => v.input).map((v) => v.name))]))
  const edgeMap = new Map<string, GraphEdge>()
  const ghosts = new Set<string>()
  const findings: Finding[] = []

  for (const bot of taskbots) {
    const declared = new Set(bot.variables.map((v) => v.name))
    for (const call of bot.calls) {
      const key = bot.path + '→' + call.targetPath
      const edge = edgeMap.get(key) ?? { from: bot.path, to: call.targetPath, calls: [] }
      edge.calls.push(call)
      edgeMap.set(key, edge)

      const callee = byPath.get(call.targetPath)
      if (!callee) {
        if (!ghosts.has(call.targetPath)) {
          ghosts.add(call.targetPath)
          findings.push({
            ruleId: 'MISSING_DEPENDENCY',
            severity: 'info',
            botPath: bot.path,
            line: call.line,
            params: { target: call.targetPath, line: String(call.line) },
          })
        }
      } else {
        const calleeInputs = inputsByPath.get(callee.path)!
        for (const input of call.inputs) {
          if (!calleeInputs.has(input.calleeVar)) {
            findings.push({
              ruleId: 'CALL_INPUT_UNKNOWN',
              severity: 'error',
              botPath: bot.path,
              line: call.line,
              varName: input.calleeVar,
              params: { line: String(call.line), var: input.calleeVar, callee: callee.name },
            })
          }
        }
      }
      // caller-side: expression references undeclared caller vars
      for (const input of call.inputs) {
        for (const cv of input.callerVars) {
          if (!declared.has(cv)) {
            findings.push({
              ruleId: 'CALL_VAR_UNDECLARED',
              severity: 'error',
              botPath: bot.path,
              line: call.line,
              varName: cv,
              params: { line: String(call.line), var: cv },
            })
          }
        }
      }
    }
  }
  const edges = [...edgeMap.values()]
  findings.push(...callDepthFindings(edges, taskbots))
  return { edges, ghostPaths: [...ghosts], findings }
}

/** Execution order of the Run Task actions inside each caller, keyed `botPath|line`.
 *  Actions run top to bottom, so line order is the sequence a reader follows. */
export function callSequence(taskbots: Taskbot[]): Map<string, number> {
  const order = new Map<string, number>()
  for (const bot of taskbots) {
    ;[...bot.calls]
      .sort((a, b) => a.line - b.line)
      .forEach((c, i) => order.set(bot.path + '|' + c.line, i + 1))
  }
  return order
}

/** Depth in the call graph: a master is level 1, what it calls is level 2, and so on.
 *  Level 3+ means the flow is buried too deep to follow; the messaging utility is the
 *  one exception because every taskbot is expected to call it directly. */
const NEST_EXEMPT = /^utilidad_mensajeria/

export function callDepth(edges: GraphEdge[]): Map<string, number> {
  const nodes = new Set<string>()
  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const e of edges) {
    nodes.add(e.from)
    nodes.add(e.to)
    const targets = outgoing.get(e.from) ?? []
    targets.push(e.to)
    outgoing.set(e.from, targets)
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1)
  }

  const depth = new Map<string, number>()
  const queue: string[] = []
  for (const n of nodes) {
    if (!indegree.get(n)) {
      depth.set(n, 1)
      queue.push(n)
    }
  }
  // Every node is in a cycle (no entry point): nothing meaningful to measure.
  if (queue.length === 0) return depth

  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]
    const d = depth.get(n)!
    for (const next of outgoing.get(n) ?? []) {
      const known = depth.get(next)
      if (known === undefined || d + 1 < known) {
        depth.set(next, d + 1)
        queue.push(next)
      }
    }
  }
  return depth
}

function callDepthFindings(edges: GraphEdge[], taskbots: Taskbot[]): Finding[] {
  const depth = callDepth(edges)
  const nameOf = new Map(taskbots.map((t) => [t.path, t.name]))
  const out: Finding[] = []
  for (const e of edges) {
    const d = depth.get(e.to)
    if (d === undefined || d < 3) continue
    const calleeName = nameOf.get(e.to) ?? e.to.split('/').pop() ?? e.to
    if (NEST_EXEMPT.test(calleeName)) continue
    for (const call of e.calls) {
      out.push({
        ruleId: 'CALL_DEPTH',
        severity: 'error',
        botPath: e.from,
        line: call.line,
        params: { line: String(call.line), callee: calleeName, depth: String(d) },
      })
    }
  }
  return out
}
