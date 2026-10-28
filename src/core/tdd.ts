import { isComment, type AAAttribute, type Action, type ActionNode, type ProjectAnalysis, type Taskbot } from './model'
import { capturedControl, describeAction } from '../ui/editor/describe'

export interface TddImage { id: string; source: string; data: Uint8Array; mime: 'image/png' | 'image/jpeg'; line: number; actionUid: string; role: 'screenshot' | 'documentation'; caption: string }
export interface FlowNode { id: string; label: string; lines: number[]; kind: 'action' | 'condition' | 'loop' | 'terminal' | 'scope'; detail: string }
export interface FlowEdge { from: string; to: string; label: string; exception?: boolean }
export interface Flow { nodes: FlowNode[]; edges: FlowEdge[] }
export interface TddCall { line: number; target: string; status: 'included' | 'missing' | 'dynamic' | 'filesystem'; disabled: boolean; inputs: string[]; runtimeReachable?: boolean }
export interface TddBot { bot: Taskbot; flow: Flow; images: TddImage[]; calls: TddCall[]; imageIssues: string[]; references: { line: number; value: string; files: string[] }[] }
export interface TddModel { title: string; introduction: ''; processSummary: ''; analysis: ProjectAnalysis; bots: TddBot[] }

const SECRET = /password|passwd|passphrase|secret|credential|api[_ -]?key|token|private[_ -]?key|clave|contrase(?:ñ|n)a|authorization|cookie/i
export function isSecretField(name: string): boolean { return SECRET.test(name) }
const DECORATIVE = /(?:^|[/\s_-])(?:logo|brand|icon)(?:[.\s/_-]|$)/i
function secretReference(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const object = value as Record<string, unknown>
  if (typeof object.expression === 'string' && /^\$[^$]+\$$/.test(object.expression)) return object.expression
  if (typeof object.variableName === 'string') return `$${object.variableName}$`
  if (object.objectTypeName === 'VARIABLE' && typeof object.string === 'string') return object.string.startsWith('$') ? object.string : `$${object.string}$`
  return undefined
}
function decode(s: string): string { try { return decodeURIComponent(s) } catch { return s } }
export function redactText(s: string): string {
  return s.replace(/\b(password|passwd|secret|clave|contrase(?:ñ|n)a|token|api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s;,<]+)/gi, '$1=[REDACTED]')
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
}
function text(s: string): string {
  return redactText(s.replace(/<(?:style|script)\b[^>]*>[\s\S]*?<\/(?:style|script)>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<img\b[^>]*>/gi, '').replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/data:image\/[^\s"']+/g, '[embedded image]').trim())
}
/** Flatten named primitive fields, while keeping source expressions and suppressing secrets and recorder blobs. */
export function sourceFields(value: unknown, prefix = '', secret = false): string[] {
  if (value == null) return []
  if (typeof value !== 'object') return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? [`${prefix}: ${secret ? '[REDACTED]' : text(String(value))}`] : []
  if (Array.isArray(value)) return value.flatMap((v) => sourceFields(v, prefix, secret))
  const obj = value as Record<string, unknown>
  const name = typeof obj.name === 'string' ? obj.name : typeof obj.key === 'string' ? obj.key : ''
  const hidden = secret || SECRET.test(name) && !/Action$/.test(name) || Object.keys(obj).some(k => /credential(?:Id|Value)|password$/i.test(k))
  if (hidden && ('value' in obj || 'string' in obj || 'expression' in obj)) return [`${prefix}${name ? (prefix ? '.' : '') + name : ''}: ${secretReference(obj.value ?? obj) ?? '[REDACTED]'}`]
  return Object.entries(obj).flatMap(([key, child]) => {
    if (['name', 'key', 'type', 'objectTypeName', 'packageName', 'blob', 'uiObject', 'capture', 'children', 'branches'].includes(key)) return []
    if (key === 'string' || key === 'expression' || key === 'number' || key === 'boolean') {
      if (typeof child !== 'string' && typeof child !== 'number' && typeof child !== 'boolean') return []
      const result = text(String(child))
      return result ? [`${prefix}${name ? (prefix ? '.' : '') + name : ''}: ${hidden ? '[REDACTED]' : result}`] : []
    }
    return sourceFields(child, ['value', 'attributes', 'dictionary'].includes(key) ? `${prefix}${name ? (prefix ? '.' : '') + name : ''}` : `${prefix}${prefix ? '.' : ''}${key}`, hidden || SECRET.test(key))
  })
}
function safeAction(a: Action): Action {
  const clean = (value: unknown, hidden = false): unknown => {
    if (Array.isArray(value)) return value.map(v => clean(v, hidden))
    if (!value || typeof value !== 'object') return typeof value === 'string' ? redactText(value) : value
    const o = value as Record<string, unknown>
    const fieldName = String(o.name ?? o.key ?? '')
    const privateField = hidden || SECRET.test(fieldName) && !/Action$/.test(fieldName)
    const reference = secretReference(o)
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'blob' ? '' : privateField && ['string', 'expression', 'number', 'boolean'].includes(k) ? reference ?? '[REDACTED]' : clean(v, privateField || SECRET.test(k))]))
  }
  const target = a.returnTo?.variableName ?? a.returnTo?.string ?? ''
  const privateAssignment = SECRET.test(target) || /password|credential/i.test(a.commandName)
  const passwordRecorder = a.attributes.some(attribute => attribute.name === 'passwordtextAction')
  return { ...a, attributes: a.attributes.map(attribute => clean(attribute, privateAssignment || passwordRecorder && /^(?:value|valueCV|text|string|stringValue|password|passwordValue|credential)$/i.test(attribute.name))) as AAAttribute[], returnTo: clean(a.returnTo) as Action['returnTo'] }
}
export function actionText(a: Action): string {
  const safe = safeAction(a)
  if (a.commandName === 'SendMailV2') return 'Email: SendMailV2'
  try { const label = text(describeAction(safe)).replace(/\s+/g, ' '); return label.length > 260 ? label.slice(0, 257) + '...' : label } catch { return `${a.packageName}: ${a.commandName}` }
}
/** TDD operation names omit implementation parameters. Source details retain them. */
export function actionSummary(a: Action): string {
  const command = a.commandName.split('.').pop() ?? a.commandName
  if (a.commandName === 'if' || a.commandName === 'elseIf' || a.commandName === 'loop.commands.start') return actionText(a)
  if (a.commandName === 'runTask') return actionText(a).replace(/^Task Bot:\s*/, '')
  if (/comment|documentation|^step$/i.test(a.commandName)) {
    const name = actionText(a).replace(/^(?:BetterComment|[^:]+: (?:Steps|step|Comment))\s*/, '').replace(/[“”]/g, '').replace(/(?:file|repository):\/\/[^\s]+/gi, '').replace(/\$[^$]+\$/g, '').replace(/\s+/g, ' ').trim()
    return name.length <= 65 ? name || 'Source operations' : 'Source operations'
  }
  if (a.commandName === 'log_message') {
    const level = a.attributes.find(attribute => attribute.name === 'logLevel')?.value?.string ?? ''
    return `Log ${({ WARN: 'warning', ERROR: 'error', FATAL: 'fatal error', DEBUG: 'debug', TRACE: 'trace', INFO: 'information' } as Record<string, string>)[level] ?? 'message'}`
  }
  if (a.commandName === 'capture') {
    const operation = a.attributes.find(attribute => /Action$/.test(attribute.name))?.value?.string ?? ''
    const verb = ({ SETTEXT: 'Set text', LEFTCLICK: 'Click', CLICK: 'Click', RIGHTCLICK: 'Right click', DOUBLECLICK: 'Double click', GETPROPERTY: 'Read control', SELECT: 'Select item', SELECTITEMBYTEXT: 'Select item', EXPAND: 'Expand control', EXTRACTTOCSV: 'Extract table' } as Record<string, string>)[operation] ?? 'Use captured control'
    const name = redactText(capturedControl(safeAction(a), true)).replace(/\s+/g, ' ').trim()
    return verb + (name && name.length <= 48 && !/(?:file|repository):\/\/|[A-Z]:[\\/]/i.test(name) ? ' ' + name : '')
  }
  if (command === 'startSession' || command === 'endSession') return `${command === 'startSession' ? 'Open' : 'Close'} ${a.packageName === 'XML' ? 'XML' : 'session'}`
  const names: Record<string, string> = {
    unzipFiles: 'Extract ZIP', OpenScript: 'Open script', openScript: 'Open script', executeFunction: 'Run script', closeScript: 'Close script',
    ReadFile: 'Read file', getTextFromFile: 'Read file', copyFiles: 'Copy file', writeToFile: 'Write file', writeText: 'Write file',
    logToFile: 'Write log', logs_start_session: 'Start logging', logs_stop_session: 'Stop logging',
    runApp: 'Run application', openbrowser: 'Open browser', delay: 'Wait', waitForWindow: 'Wait for window',
    config_read_xml: 'Read configuration', getSingleNode: 'Read XML', getSingleNodeV2: 'Read XML',
    OpenSpreadsheet: 'Open spreadsheet', CloseSpreadsheet: 'Close spreadsheet', GetSingleCell: 'Read cell', GetMultipleCells: 'Read cells', SetCell: 'Write cell', setCellValue: 'Write cell',
    SaveSpreadSheet: 'Save spreadsheet', SaveSpreadsheet: 'Save spreadsheet', writeDataTableToWorksheet: 'Write worksheet',
    OpenCSVTXT: 'Open CSV', CloseCsvTxt: 'Close CSV', ReadFromCsvTxt: 'Read CSV',
    restGet: 'Send GET request', restPost: 'Send POST request', SendMailV2: 'Send email',
    deleteFiles: 'Delete files', deleteFolder: 'Delete folder', createFolder: 'Create folder', createFile: 'Create file', renameFiles: 'Rename files', downloadTo: 'Download file',
    try: 'Try', catch: 'Catch', finally: 'Finally', throw: 'Throw error', stopTask: 'Stop task', break: 'Break loop', continue: 'Continue loop',
    startRecordSession: 'Start recording', EndRecordSession: 'Stop recording', messageBox: 'Show message',
    assign: 'Assign value', assignToNumber: 'Assign number', put: 'Set dictionary item', addItem: 'Add item',
  }
  return names[command] ?? (command.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, letter => letter.toUpperCase()))
}
export function actionDetails(a: Action): string {
  const safe = safeAction(a)
  return [...new Set(sourceFields(safe.attributes).filter(s => !/^(?:sequenceCheckBox\d|aboutVersion|captureScreenshot|advancedWait|waitType|charsetName|encodingMode|isThrowException|option|inputMethod|subtype|matchCase|runInBackground|logVariable|varOrManual):/.test(s)))].map(s => s.length > 300 ? s.slice(0, 297) + '...' : s).join('; ')
}
function walkStrings(value: unknown, visit: (value: string, key: string) => void, key = ''): void {
  if (typeof value === 'string') visit(value, key)
  else if (Array.isArray(value)) value.forEach(v => walkStrings(v, visit, key))
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { if (k !== 'blob') walkStrings(v, visit, k) })
}
function dataImage(src: string): { data: Uint8Array; mime: TddImage['mime'] } | undefined {
  const m = src.match(/^data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!m) return undefined
  try { return { data: Uint8Array.from(atob(m[2].replace(/\s/g, '')), c => c.charCodeAt(0)), mime: /png/i.test(m[1]) ? 'image/png' : 'image/jpeg' } } catch { return undefined }
}
function resolveImage(bot: Taskbot, path: string, analysis: ProjectAnalysis) {
  const normalized = decode(path).replace(/\\/g, '/').replace(/^repository:\/\/\//, '').replace(/^\//, '')
  const candidates = [normalized, `${bot.path}Metadata/${normalized}`, `${bot.path.slice(0, bot.path.lastIndexOf('/'))}/${normalized}`]
  return analysis.archiveFiles?.find(f => f.sourceZip === bot.sourceZip && candidates.includes(f.path))
    ?? analysis.archiveFiles?.find(f => candidates.includes(f.path))
}
function imagesFor(bot: Taskbot, analysis: ProjectAnalysis) {
  const images: TddImage[] = [], issues: string[] = []
  for (const a of bot.actions) {
    const captures: { full: string; thumbnail: string }[] = []
    const capturePaths = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(capturePaths)
      else if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>
        if (object.screenshotMetadataPath || object.thumbnailMetadataPath) captures.push({ full: String(object.screenshotMetadataPath ?? ''), thumbnail: String(object.thumbnailMetadataPath ?? '') })
        Object.values(object).forEach(capturePaths)
      }
    }
    const enabledImages = a.attributes.filter(attr => {
      const match = attr.name.match(/^imageString(\d*)$/)
      if (!match) return true
      const checkbox = a.attributes.find(v => v.name === 'imageCheckbox' + match[1])
      return checkbox?.value?.boolean !== false
    })
    capturePaths(enabledImages)
    for (const { full, thumbnail } of captures) {
      const f = resolveImage(bot, full || thumbnail, analysis)
      if (f && /\.(png|jpe?g)$/i.test(f.path)) images.push({ id: `${bot.path}|${a.line}|${f.path}`, data: f.data, mime: /\.png$/i.test(f.path) ? 'image/png' : 'image/jpeg', source: f.path, line: a.line, actionUid: a.uid, role: /comment|documentation/i.test(a.commandName) ? 'documentation' : 'screenshot', caption: `${bot.name} L${a.line} ${a.uid} | ${actionText(a)} | ${f.path}` })
      else issues.push(`L${a.line}: recorder image not included (${full || thumbnail})`)
    }
    if (!/comment|documentation/i.test(a.commandName)) continue
    let imageNo = 0
    walkStrings(a.attributes, s => {
      for (const tag of s.matchAll(/<img\b[^>]*>/gi)) {
        const src = tag[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
        if (!src) continue
        const alt = tag[0].match(/\b(?:alt|title)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
        if (DECORATIVE.test(src.startsWith('data:') ? alt : `${src} ${alt}`)) continue
        const inline = dataImage(src)
        const f = inline ? undefined : resolveImage(bot, src, analysis)
        const data = inline?.data ?? f?.data
        if (data && (inline || /\.(png|jpe?g)$/i.test(f!.path))) {
          imageNo++
          const source = inline ? `embedded documentation image ${imageNo}` : f!.path
          images.push({ id: `${bot.path}|${a.line}|doc${imageNo}`, data, mime: inline?.mime ?? (/\.png$/i.test(f!.path) ? 'image/png' : 'image/jpeg'), source, line: a.line, actionUid: a.uid, role: 'documentation', caption: `${bot.name} L${a.line} ${a.uid} | ${actionText(a)} | ${source}` })
        } else issues.push(`L${a.line}: documentation image not included (${src.startsWith('data:') ? 'unsupported embedded image' : redactText(src)})`)
      }
    })
  }
  return { images, issues }
}
function callsFor(bot: Taskbot, analysis: ProjectAnalysis): TddCall[] {
  return bot.actions.filter(a => a.commandName === 'runTask').map(a => {
    const tb = a.attributes.find(v => v.name === 'taskbot')?.value
    const file = tb?.taskbotFile
    const target = file?.expression ?? file?.string ?? '[target absent in source]'
    const normalized = decode(target).replace(/^repository:\/\/\//, '').replace(/\\/g, '/')
    const dynamic = !!file?.expression || /\$[^$]+\$/.test(target)
    const status = dynamic ? 'dynamic' : target.startsWith('repository:///') ? analysis.taskbots.some(b => b.path === normalized) ? 'included' : 'missing' : 'filesystem'
    return { line: a.line, target: redactText(normalized), status, disabled: !a.reachable, inputs: (tb?.taskbotInput?.dictionary ?? []).map(v => `${v.key}: ${SECRET.test(v.key) ? '[REDACTED]' : sourceFields(v.value).map(s => s.replace(/^: /, '')).join(', ')}`) }
  })
}

interface Context { error: string; stop: string; break?: string; continue?: string; ignoreErrors?: boolean }
/** Continuation compilation preserves branch alternatives, loop back edges and finalizers on every exit. */
export function buildFlow(bot: Taskbot): Flow {
  const nodes: FlowNode[] = [], edges: FlowEdge[] = []
  let serial = 0
  const add = (a: Action, kind: FlowNode['kind'] = 'action', suffix = '') => {
    const id = `n${++serial}`
    nodes.push({ id, label: `L${a.line} ${actionText(a)}${suffix}`, lines: [a.line], kind, detail: actionDetails(a) })
    return id
  }
  const terminal = (label: string) => { const id = `n${++serial}`; nodes.push({ id, label, lines: [], kind: 'terminal', detail: '' }); return id }
  const end = terminal('End'), failed = terminal('Unhandled error'), stopped = terminal('Stop task')
  const edge = (from: string, to: string, label = '', exception = false) => { if (!edges.some(e => e.from === from && e.to === to && e.label === label)) edges.push({ from, to, label, exception }) }
  const seq = (actions: ActionNode[], next: string, ctx: Context): string => {
    let entry = next
    for (let i = actions.length - 1; i >= 0; i--) entry = compile(actions[i], entry, ctx)
    return entry
  }
  const compile = (a: ActionNode, next: string, ctx: Context, falseNext = next): string => {
    if (!a.reachable) return next
    const cmd = a.commandName
    if (cmd === 'if' || cmd === 'elseIf') {
      const id = add(a, 'condition')
      const yes = seq(a.children, next, ctx)
      let no = falseNext
      for (let i = a.branches.length - 1; i >= 0; i--) {
        const branch = a.branches[i]
        if (!branch.reachable) continue
        no = branch.commandName === 'else' ? seq(branch.children, next, ctx) : compile(branch, next, ctx, no)
      }
      edge(id, yes, 'True'); edge(id, no, 'False'); edge(id, ctx.ignoreErrors ? next : ctx.error, ctx.ignoreErrors ? 'Error ignored' : 'Condition error', true)
      return id
    }
    if (cmd === 'loop.commands.start') {
      const id = add(a, 'loop')
      const body = seq(a.children, id, { ...ctx, break: next, continue: id })
      const conditional = a.attributes.some(attribute => attribute.name === 'condition')
      edge(id, body, conditional ? 'Condition true' : 'Next iteration')
      edge(id, next, conditional ? 'Condition false' : 'Done / condition false'); edge(id, ctx.ignoreErrors ? next : ctx.error, ctx.ignoreErrors ? 'Error ignored' : conditional ? 'Condition error' : 'Iterator error', true)
      return a.attributes.some(attribute => attribute.name === 'checkConditionAtEnd' && attribute.value?.boolean === true) ? body : id
    }
    if (cmd === 'try') {
      const id = add(a, 'scope')
      const finalizer = a.branches.find(b => b.commandName === 'finally' && b.reachable)
      const finish = (dest: string, reason: string): string => {
        if (!finalizer) return dest
        const fid = add(finalizer, 'scope', ` (${reason})`)
        edge(fid, seq(finalizer.children, dest, ctx), reason)
        return fid
      }
      const normal = finish(next, 'normal return')
      const outerError = finish(ctx.error, 'propagate error')
      const localCtx: Context = { error: outerError, stop: finish(ctx.stop, 'stop'), break: ctx.break ? finish(ctx.break, 'break') : undefined, continue: ctx.continue ? finish(ctx.continue, 'continue') : undefined, ignoreErrors: ctx.ignoreErrors }
      const catches = a.branches.filter(b => b.commandName === 'catch' && b.reachable)
      let handler = outerError
      for (let i = catches.length - 1; i >= 0; i--) {
        const c = catches[i], cid = add(c, 'scope')
        const continueOnError = c.attributes.some(v => v.name === 'continueOnError' && v.value?.boolean === true)
        edge(cid, seq(c.children, normal, { ...localCtx, ignoreErrors: ctx.ignoreErrors || continueOnError }), 'Caught error')
        handler = cid
      }
      edge(id, seq(a.children, normal, { ...localCtx, error: handler }), 'Try body')
      return id
    }
    if (isComment(a) && !a.children.length) return next
    const id = add(a, a.children.length || cmd === 'runTask' ? 'scope' : 'action')
    if (cmd === 'throw') edge(id, ctx.ignoreErrors ? next : ctx.error, ctx.ignoreErrors ? 'Error ignored' : 'Throw', true)
    else if (cmd === 'stopTask') edge(id, ctx.stop, 'Stop')
    else if (cmd === 'loop.commands.break') edge(id, ctx.break ?? failed, 'Break')
    else if (cmd === 'loop.commands.continue') edge(id, ctx.continue ?? failed, 'Continue')
    else {
      edge(id, seq(a.children, next, ctx), a.children.length ? 'Enter step' : '')
      // Each executable operation can fail. Keep this edge in the model and show it as a compact region reference in drawings.
      if (!/^(?:step|documentation_)/.test(cmd)) edge(id, ctx.ignoreErrors ? next : ctx.error, ctx.ignoreErrors ? 'Error ignored' : 'Error', true)
    }
    return id
  }
  const entry = seq(bot.nodes ?? bot.actions.map(a => ({ ...a, children: [], branches: [] })), end, { error: failed, stop: stopped })
  const start = terminal('Start'); edge(start, entry)
  // Safe straight runs share a normal successor and the same exception target. Source lines stay traceable.
  for (const node of [...nodes]) {
    if (!nodes.includes(node)) continue
    if (node.kind !== 'action') continue
    while (node.lines.length < 12) {
      const outgoing = edges.filter(e => e.from === node.id && !e.exception)
      if (outgoing.length !== 1 || outgoing[0].label) break
      const target = nodes.find(n => n.id === outgoing[0].to)
      if (!target || target.kind !== 'action' || edges.filter(e => e.to === target.id && !e.exception).length !== 1) break
      const owner = bot.actions.find(a => a.line === node.lines[0])
      const targetOwner = bot.actions.find(a => a.line === target.lines[0])
      if (owner?.parentUid !== targetOwner?.parentUid) break
      const targetOut = edges.filter(e => e.from === target.id)
      if (targetOut.some(e => e.label && !e.exception)) break
      const error1 = edges.find(e => e.from === node.id && e.exception)?.to
      const error2 = targetOut.find(e => e.exception)?.to
      if (error1 !== error2 || node.lines.length + target.lines.length > 12) break
      const previousLine = Math.max(...node.lines), nextLine = Math.min(...target.lines)
      if (bot.actions.some(a => a.line > previousLine && a.line < nextLine && /comment|documentation/.test(a.commandName))) break
      node.lines.push(...target.lines)
      const first = bot.actions.find(a => a.line === Math.min(...node.lines))!
      const title = [...bot.actions].reverse().find(a => a.line < first.line && a.parentUid === first.parentUid && a.depth === first.depth && /comment|documentation/.test(a.commandName))
      const authored = title ? actionDetails(title).replace(/^[^:]*:\s*/, '').split(';')[0] : ''
      node.label = `L${Math.min(...node.lines)} to L${Math.max(...node.lines)} ${authored || actionText(first)}`
      node.detail = [node.detail, target.detail].filter(Boolean).join('; ')
      edges.splice(edges.indexOf(outgoing[0]), 1)
      for (const e of targetOut) { if (e.exception) edges.splice(edges.indexOf(e), 1); else e.from = node.id }
      nodes.splice(nodes.indexOf(target), 1)
    }
  }
  const reachable = new Set<string>(), queue = [start]
  for (let i = 0; i < queue.length; i++) { if (reachable.has(queue[i])) continue; reachable.add(queue[i]); for (const e of edges.filter(e => e.from === queue[i])) queue.push(e.to) }
  const result = nodes.filter(n => reachable.has(n.id)).sort((a, b) => a.id === start ? -1 : b.id === start ? 1 : !a.lines.length ? 1 : !b.lines.length ? -1 : Math.min(...a.lines) - Math.min(...b.lines) || a.id.localeCompare(b.id))
  return { nodes: result, edges: edges.filter(e => reachable.has(e.from) && reachable.has(e.to)) }
}

export function buildTdd(analysis: ProjectAnalysis): TddModel {
  const bots = analysis.taskbots.map(bot => {
    const refs: TddBot['references'] = []
    for (const a of bot.actions) {
      const safe = safeAction(a)
      walkStrings(safe.attributes, value => {
        if (!/repository:\/\/\/|[A-Za-z]:\\|\\\\|https?:\/\//.test(value) || value.includes('<') || value.startsWith('data:')) return
        const normalized = decode(value).replace(/^repository:\/\/\//, '').replace(/\\/g, '/')
        refs.push({ line: a.line, value: redactText(value), files: [...analysis.otherFiles, ...analysis.taskbots].filter(f => f.path === normalized).map(f => f.path) })
      })
    }
    const img = imagesFor(bot, analysis)
    const flow = buildFlow(bot), runtimeLines = new Set(flow.nodes.flatMap(node => node.lines))
    return { bot, flow, images: img.images, imageIssues: img.issues, calls: callsFor(bot, analysis).map(call => ({ ...call, runtimeReachable: runtimeLines.has(call.line) })), references: refs }
  })
  return { title: analysis.zipNames.length === 1 ? `TDD ${analysis.zipNames[0].replace(/\.zip$/i, '')}` : 'Combined TDD', introduction: '', processSummary: '', analysis, bots }
}
export function bytesDataUrl(data: Uint8Array, mime: string): string {
  let raw = ''
  for (let i = 0; i < data.length; i += 8192) raw += String.fromCharCode(...data.subarray(i, i + 8192))
  return `data:${mime};base64,${btoa(raw)}`
}
