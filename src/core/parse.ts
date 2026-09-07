import type { AAAttribute, AAValue, Action, Call, CallInput, Taskbot, Variable } from './model'

interface RawNode {
  uid: string
  commandName: string
  packageName: string
  disabled?: boolean
  attributes?: AAAttribute[]
  children?: RawNode[]
  branches?: RawNode[]
  returnTo?: AAValue
}

interface RawTaskbot {
  nodes?: RawNode[]
  variables?: Partial<Variable>[]
  packages?: { name: string; version: string }[]
}

/** Matches direct, indexed, dictionary, and method/property variable references. Package-qualified system vars ($System:AATaskName$) stay excluded by not accepting ':' next. */
const VAR_REF = /\$([A-Za-z][A-Za-z0-9_]*)(?=[$\[{.])/g

export function extractVarRefs(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(VAR_REF)) out.push(m[1])
  return out
}

function walkValueStrings(v: AAValue | undefined, visit: (s: string) => void): void {
  if (v == null || typeof v !== 'object') return
  if (v.objectTypeName === 'VARIABLE' && typeof v.string === 'string') visit('$' + v.string + '$')
  else if (typeof v.string === 'string') visit(v.string)
  if (typeof v.expression === 'string') visit(v.expression)
  if (typeof v.variableName === 'string') visit('$' + v.variableName + '$')
  if (Array.isArray(v.variableMapNames)) {
    for (const name of v.variableMapNames) if (typeof name === 'string') visit('$' + name + '$')
  }
  for (const k of Object.keys(v)) {
    const child = (v as Record<string, unknown>)[k]
    if (Array.isArray(child)) {
      for (const c of child) walkValueStrings(c as AAValue, visit)
    } else if (child && typeof child === 'object') {
      walkValueStrings(child as AAValue, visit)
    }
  }
}

function decodeRepositoryPath(fileValue: AAValue | undefined): string | undefined {
  const s = fileValue?.string ?? fileValue?.expression
  if (!s) return undefined
  const m = s.match(/^repository:\/\/\/(.+)$/)
  if (!m) return undefined
  return decodeURIComponent(m[1]).replace(/\\/g, '/')
}

function parseCall(node: RawNode, line: number, reachable: boolean): Call | undefined {
  const tb = node.attributes?.find((a) => a.name === 'taskbot')?.value
  if (!tb) return undefined
  const targetPath = decodeRepositoryPath(tb.taskbotFile as AAValue | undefined)
  if (!targetPath) return undefined // file-system or variable-based target; ignore for graph
  const inputs: CallInput[] = []
  const dict = (tb.taskbotInput as AAValue | undefined)?.dictionary ?? []
  for (const { key, value } of dict) {
    const raw = value?.expression ?? value?.string ?? JSON.stringify(value?.dictionary ?? value?.number ?? value?.boolean ?? '')
    const callerVars = value?.expression ? extractVarRefs(value.expression) : []
    inputs.push({ calleeVar: key, raw, callerVars, isLiteral: !value?.expression })
  }
  return { line, targetPath, inputs, disabled: !!node.disabled, reachable }
}

export function parseTaskbot(path: string, sourceZip: string, json: string): Taskbot {
  const raw = JSON.parse(json) as RawTaskbot
  // Extensionless files are only candidates; this is what actually identifies a taskbot.
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.variables)) {
    throw new Error('not a taskbot: ' + path)
  }
  const actions: Action[] = []
  const calls: Call[] = []
  const varRefs: Record<string, number[]> = {}
  const texts: string[] = []

  const declared = new Set((raw.variables ?? []).map((v) => v.name ?? ''))

  let line = 0
  const walk = (node: RawNode, depth: number, parentReachable: boolean, parentUid?: string) => {
    line++
    const myLine = line
    const reachable = parentReachable && !node.disabled
    const children = node.children ?? []
    const branches = node.branches ?? []
    actions.push({
      uid: node.uid,
      line: myLine,
      depth,
      commandName: node.commandName,
      packageName: node.packageName,
      disabled: !!node.disabled,
      reachable,
      attributes: node.attributes ?? [],
      returnTo: node.returnTo,
      childCount: children.length + branches.length,
      parentUid,
    })

    // Scan the complete attribute tree, including condition/iterator sibling attributes.
    const seen = new Set<string>()
    const visit = (s: string) => {
      texts.push(s)
      for (const name of extractVarRefs(s)) {
        if (declared.has(name) && !seen.has(name)) {
          seen.add(name)
          ;(varRefs[name] ??= []).push(myLine)
        }
      }
    }
    walkValueStrings({ attributes: node.attributes }, visit)
    walkValueStrings(node.returnTo, visit)

    if (node.commandName === 'runTask') {
      const call = parseCall(node, myLine, reachable)
      if (call) calls.push(call)
    }

    for (const c of children) walk(c, depth + 1, reachable, node.uid)
    for (const b of branches) walk(b, depth, reachable, node.uid)
  }
  for (const n of raw.nodes ?? []) walk(n, 0, true)

  const parts = path.split('/')
  const name = parts[parts.length - 1]
  // bot folder = grandparent of the task file (…/<bot>/<tasks|Tareas>/<Name>)
  const folder = parts.slice(0, -2).join('/')

  const variables: Variable[] = (raw.variables ?? []).map((v) => ({
    name: v.name ?? '',
    description: v.description ?? '',
    type: v.type ?? 'ANY',
    subtype: v.subtype,
    readOnly: !!v.readOnly,
    input: !!v.input,
    output: !!v.output,
  }))

  return {
    path,
    name,
    folder,
    sourceZip,
    variables,
    actions,
    packages: raw.packages ?? [],
    calls,
    varRefs,
    textBlob: texts.join('\n').toLowerCase(),
  }
}
