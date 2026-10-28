import type { AAValue, Action } from '../../core/model'

/** Human-readable action labels in the shape the Control Room task-bot view uses:
 *  `Package: Verb args`, string literals in “ ”, variables kept as $name$.
 *  Derived from two real Control Room exports (see plan.md). */

const PACKAGE_LABEL: Record<string, string> = {
  A360BotFramework: 'Bot Framework',
  A360ScreenRecorder: 'Screen Recorder',
  A360ToolBox: 'Tool Box',
  betterComments: 'BetterComment',
  Comment: 'Comment',
  CsvTxt: 'CSV/TXT',
  DataTable: 'Data Table',
  DataTablePlus: 'Data Table',
  Datetime: 'Datetime',
  ErrorHandler: 'Error handler',
  Excel_MS: 'Excel',
  Excel: 'Excel advanced',
  ListPlus: 'List',
  LogToFile: 'Log To File',
  MessageBoxPlus: 'Message box',
  PlaySound: 'Play sound',
  Recorder: 'Recorder',
  TaskBot: 'Task Bot',
  VBScript: 'VBScript',
}

const COMMAND_LABEL: Record<string, string> = {
  assign: 'Assign',
  assignToNumber: 'Assign',
  addItem: 'Add item',
  capture: 'Capture',
  closeWindow: 'Close window',
  CloseCsvTxt: 'Close csv/txt',
  CloseSpreadsheet: 'Close spreadsheet',
  config_read_xml: 'Read XML',
  copyFiles: 'Copy file',
  createFolder: 'Create folder',
  catch: 'Catch',
  delay: 'Add a regular delay',
  deleteEmptyRows: 'Delete empty rows',
  deleteFiles: 'Delete files',
  deleteFolder: 'Delete folder',
  createFile: 'Create file',
  renameFiles: 'Rename files',
  documentation_about: 'About Task Description',
  documentation_comment: 'Comment',
  documentation_sequence: 'Steps',
  downloadTo: 'Download file',
  else: 'Else',
  EndRecordSession: 'End Recording',
  executeFunction: 'Execute function',
  Filter: 'Filter',
  finally: 'Finally',
  getTextFromFile: 'Get text from file',
  log_message: 'Log Message',
  logs_start_session: 'Start Logger Session',
  logs_stop_session: 'Stop Logger Session',
  logToFile: 'Log to file',
  OpenCSVTXT: 'Open',
  playMediaFile: 'Play media file',
  put: 'Put',
  randomString: 'Generate random string of length',
  ReadFromCsvTxt: 'Read data',
  removeBlankEntries: 'Remove blank entries',
  replace: 'Replace',
  runApp: 'Run application',
  runTask: 'Run',
  SaveSpreadSheet: 'Save spreadsheet',
  SetCell: 'Set cell',
  split: 'Split',
  startRecordSession: 'Start Recording',
  stopTask: 'Stop task',
  throw: 'Throw',
  toString: 'To string',
  try: 'Try',
  writeDataTableToWorksheet: 'Write data table to worksheet',
  'loop.commands.start': 'Loop',
  'loop.commands.break': 'Break',
  'loop.commands.continue': 'Continue',
}

/** Attributes worth showing, in the order Control Room tends to read them. */
const PRIMARY_ATTRS = [
  'firstString',
  'content',
  'message',
  'value',
  'sourceString',
  'sourceDictionary',
  'sourceList',
  'sourceTable',
  'sourceFile',
  'dateTime',
  'xPathToNodes',
  'randomStringLength',
  'text',
  'filePath',
  'folderPath',
  'windowTitle',
  'title',
  'aboutDescription',
  'name',
]

/** Attributes that only carry a mode/enum; never worth showing as the summary. */
const ATTR_DENY = new Set([
  'option', 'inputMethod', 'loopType', 'varOrManual', 'subtype', 'waitType',
  'charsetName', 'logVariable', 'advancedWait', 'runInBackground', 'matchCase',
  'captureScreenshot', 'isThrowException', 'logLevelsAndFileOption', 'encodingMode',
])

function quoted(s: string): string {
  return `“${s}”`
}

/** first meaningful literal or expression inside a value tree */
function primitive(v: AAValue | undefined): string | undefined {
  if (v == null || typeof v !== 'object') return undefined
  if (typeof v.expression === 'string' && v.expression) return v.expression
  if (typeof v.string === 'string' && v.string) {
    // repository:/// paths are long and noisy; the Control Room shows the file name
    if (v.type === 'FILE' || v.string.startsWith('repository:///')) {
      const name = decodeURIComponent(v.string.replace(/^repository:\/\/\//, '')).split('/').pop()
      if (name) return name
    }
    return quoted(stripHtml(v.string))
  }
  if (typeof v.number === 'string' && v.number) return v.number
  if (typeof v.boolean === 'boolean') return String(v.boolean)
  if (typeof v.variableName === 'string') return `$${v.variableName}$`
  if (Array.isArray(v.dictionary)) {
    // rich-text payloads (comments, task descriptions) hide their text under an `html` key
    const htmlEntry = v.dictionary.find((e) => e.key === 'html')?.value?.string
    if (typeof htmlEntry === 'string' && htmlEntry) return quoted(stripHtml(htmlEntry))
    return `Dictionary (${v.dictionary.length})`
  }
  if (Array.isArray(v.list)) return `List (${v.list.length})`
  if (Array.isArray(v.table)) return `Table (${v.table.length})`
  return undefined
}

function stripHtml(s: string): string {
  const text = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 90 ? text.slice(0, 87) + '…' : text
}

function attr(a: Action, name: string): AAValue | undefined {
  return a.attributes.find((x) => x.name === name)?.value
}

function firstPrimitive(a: Action): string | undefined {
  for (const name of PRIMARY_ATTRS) {
    const p = primitive(attr(a, name))
    if (p) return p
  }
  for (const at of a.attributes) {
    if (ATTR_DENY.has(at.name)) continue
    const p = primitive(at.value)
    if (p) return p
  }
  return undefined
}

function returnTarget(a: Action): string | undefined {
  const r = a.returnTo
  if (!r) return undefined
  if (typeof r.variableName === 'string') return `$${r.variableName}$`
  const session = r.sessionName as AAValue | undefined
  if (session?.string) return `“${session.string}”`
  return undefined
}

function taskbotName(a: Action): string | undefined {
  const tb = attr(a, 'taskbot')
  const file = tb?.taskbotFile as AAValue | undefined
  const s = file?.string ?? file?.expression
  if (!s) return undefined
  return decodeURIComponent(s.replace(/^repository:\/\/\//, '')).split('/').pop()
}

const LOG_LEVEL: Record<string, string> = {
  INFO: 'INFORMATION',
  WARN: 'WARNING',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
  TRACE: 'TRACE',
  FATAL: 'FATAL',
}

const OPERATOR: Record<string, string> = {
  EQ: 'Equals to (=)',
  NEQ: 'Not equals to (!=)',
  GT: 'Greater than (>)',
  GTE: 'Greater than or equal to (>=)',
  LT: 'Less than (<)',
  LTE: 'Less than or equal to (<=)',
  CONTAINS: 'Contains',
  NOT_CONTAINS: 'Does not contain',
  STARTS_WITH: 'Starts with',
  ENDS_WITH: 'Ends with',
  IS_EMPTY: 'Is empty',
}

/** `if` keeps its operands on the condition attribute entry itself, alongside name/value */
function condition(a: Action): string {
  const entry = a.attributes.find((x) => x.name === 'condition') as ConditionEntry | undefined
  if (!entry) return '[condition not decoded from source]'
  return conditionEntry(a, entry)
}
interface ConditionEntry {
  value?: AAValue
  attributes?: { name: string; value?: AAValue }[]
  groupAttribute?: ConditionEntry
  operatorAttribute?: ConditionEntry
  operator?: string
}
function conditionEntry(a: Action, entry: ConditionEntry): string {
  if (entry.groupAttribute) {
    const left = conditionEntry(a, entry.groupAttribute)
    const next = entry.operatorAttribute
    return next ? `(${left}) ${next.operator ?? '[operator not decoded]'} (${conditionEntry(a, next)})` : left
  }
  if (entry.operatorAttribute) {
    const left = conditionEntry(a, { ...entry, operatorAttribute: undefined })
    const next = entry.operatorAttribute
    return `(${left}) ${next.operator ?? '[operator not decoded]'} (${conditionEntry(a, next)})`
  }
  const inner = entry.attributes ?? []
  const get = (n: string) => inner.find((x) => x.name === n)?.value
  const operand = (name: string) => {
    const value = get(name)
    if (value?.string === '') return '""'
    return primitive(value)
  }
  const left = operand('variable') ?? operand('sourceString') ?? operand('sourceDateTime') ?? operand('window') ?? ''
  const opRaw = get('operator')?.string ?? ''
  const op = OPERATOR[opRaw] ?? opRaw
  const right = operand('value') ?? operand('destDateTime') ?? operand('stringValue') ?? ''
  // only name the operand type when there is an operand to name
  const kind = typeof entry.value?.conditionalName === 'string' ? entry.value.conditionalName : ''
  const noun = left ? kind.replace(/Variable$/, '').toLowerCase() : ''
  if (op && left) return [noun, left, op, right].filter(Boolean).join(' ')
  const relevant = inner.filter(at => !['operator', 'waitTimeout', 'advancedWait', 'matchCase', 'isIgnoreCarriage', 'subtype', 'valueType', 'wait', 'hasClickOption', 'hasRepeatOptionSet', 'isMigratedBot', 'compareMode', 'offsetX', 'offsetY', 'repeatTimes', 'selectClickOrOffsetMatch'].includes(at.name))
  const operands = relevant.map(at => { const p = operand(at.name); return p === undefined ? '' : `${at.name} ${p}` }).filter(Boolean)
  if (operands.length) return [kind || 'source condition', ...operands].join(' ')
  if (inner.some(at => at.name === 'uiObject')) {
    const control = capturedControl({ ...a, attributes: inner })
    return `${kind === 'capture' ? 'captured object exists' : kind === 'captureObjectNotExist' ? 'captured object does not exist' : kind || 'Recorder condition'} ${control || '[captured control in source]'}`
  }
  return `${kind || 'condition'} [source operands not decoded]`
}

/** Recorder actions hide the captured control inside a base64 JSON blob. Decoding is
 *  cached per action because the blobs run to several KB each. */
const uiObjectCache = new Map<string, string>()

export function capturedControl(a: Action, nameOnly = false): string {
  const value = attr(a, 'uiObject')
  const sourceObject = value?.uiObject as { controlType?: string; criteria?: Record<string, { enabled?: boolean; value?: AAValue }> } | undefined
  if (sourceObject?.criteria) {
    const criteria = sourceObject.criteria
    const get = (key: string) => { const entry = criteria[key]; return entry?.enabled ? primitive(entry.value) : undefined }
    if (nameOnly) return get('Name') ?? get('HTML InnerText') ?? get('HTML Name') ?? get('HTML ID') ?? ''
    const identifier = get('HTML ID') ?? get('HTML Name') ?? get('HTML InnerText') ?? get('Name') ?? get('DOMXPath') ?? get('CSS Selector')
    const tag = get('HTML Tag') ?? sourceObject.controlType ?? ''
    const window = primitive(value?.uiObjectWindow as AAValue | undefined)
    return [tag ? `on ${tag}` : '', identifier ?? '', window ? `in ${window}` : ''].filter(Boolean).join(' ')
  }
  const cached = uiObjectCache.get(a.uid)
  if (cached !== undefined) return nameOnly ? cached.match(/“[^”]+”/)?.[0] ?? '' : cached

  let out = ''
  try {
    const ui = attr(a, 'uiObject')?.uiObject as { blob?: string } | undefined
    if (ui?.blob) {
      const json = typeof atob === 'function' ? atob(ui.blob) : ''
      const props: string[] = []
      // properties are flat {name, value} pairs; pull the useful ones by name
      const grab = (label: string) =>
        json.match(new RegExp(`"name"\\s*:\\s*"${label}"[^}]*?"value"\\s*:\\s*"([^"]{1,60})"`))?.[1]
      const tag = grab('HTML Tag')
      const id = grab('HTML ID') ?? grab('HTML Name')
      const text = grab('HTML InnerText')
      if (tag) props.push(`on ${tag.toLowerCase()}`)
      const name = id ?? text
      if (name) props.push(quoted(name))
      out = props.join(' ')
    }
  } catch {
    out = '' // an unreadable blob just means a shorter label
  }
  uiObjectCache.set(a.uid, out)
  return nameOnly ? out.match(/“[^”]+”/)?.[0] ?? '' : out
}

/** Control Room renders these without the `Package:` prefix, or from specific attributes. */
function special(a: Action): string | undefined {
  const p = firstPrimitive(a)
  if (a.packageName === 'Boolean' && a.commandName === 'assign') {
    const value = primitive(attr(a, 'userDefined') ?? attr(a, 'variable'))
    if (value) return `Boolean: Assign ${value}${returnTarget(a) ? ' to ' + returnTarget(a) : ''}`
  }
  switch (a.commandName) {
    case 'BetterComments':
    case 'Comment':
      return `BetterComment ${p ?? ''}`.trim()
    case 'messageBox':
      return `Message box ${p ?? ''}`.trim()
    case 'if':
      return `If ${condition(a)}`.trim()
    case 'elseIf':
      return `Else if ${condition(a)}`.trim()
    case 'catch':
      return 'Error handler: Catch'
    case 'loop.commands.start': {
      if (a.attributes.some(attribute => attribute.name === 'condition')) {
        const atEnd = attr(a, 'checkConditionAtEnd')?.boolean === true
        return `Loop while ${condition(a)} (condition ${atEnd ? 'after' : 'before'} body)`
      }
      const iterator = a.attributes.find(at => at.name === 'iterator') as { value?: AAValue; attributes?: { name: string; value?: AAValue }[] } | undefined
      if (iterator) {
        const kind = typeof iterator.value?.iteratorName === 'string' ? iterator.value.iteratorName : ''
        const operands = (iterator.attributes ?? []).map(at => { const p = primitive(at.value); return p === undefined ? '' : `${at.name} ${p}` }).filter(Boolean)
        return ['Loop', kind, ...operands].filter(Boolean).join(' ')
      }
      const operands = a.attributes.filter(at => !['loopType', 'advancedWait'].includes(at.name)).map(at => { const p = primitive(at.value); return p === undefined ? '' : `${at.name} ${p}` }).filter(Boolean)
      return ['Loop', ...operands].filter(Boolean).join(' ')
    }
    case 'Keystrokes':
      return `Simulate keystrokes ${p ?? ''}`.trim()
    case 'waitForWindow': {
      const type = attr(a, 'waitType')?.string === 'CLOSE' ? 'close' : 'open'
      const win = primitive(attr(a, 'window')) ?? ''
      return `Wait for window to ${type} with window title ${win}`.trim()
    }
    case 'runTask': {
      const name = taskbotName(a)
      return name ? `Task Bot: Run ${name}` : undefined
    }
    case 'restGet':
    case 'restPost': {
      const uriValue = attr(a, 'uri') ?? attr(a, 'url')
      const uri = (primitive(uriValue) ?? '[URI in source]')
        .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
        .replace(/([?&](?:password|secret|api[_-]?key|token|access[_-]?token)=)([^&\s”]+)/gi, (_, key: string, value: string) => key + (uriValue?.expression && /^\$[^$]+\$$/.test(value) ? value : '[REDACTED]'))
      return `REST: ${a.commandName === 'restGet' ? 'GET' : 'POST'} ${uri}${returnTarget(a) ? ' to ' + returnTarget(a) : ''}`
    }
    case 'log_message': {
      const level = LOG_LEVEL[attr(a, 'logLevel')?.string ?? ''] ?? ''
      const msg = primitive(attr(a, 'logMessage')) ?? ''
      return `Bot Framework: Log Message ${level}${level ? ': ' : ''}${msg}`.trim()
    }
    case 'logs_start_session':
      return `Bot Framework: Start Logger Session ${returnTarget(a) ?? ''}`.trim()
    case 'documentation_about':
      return 'Bot Framework: About Task Description'
    case 'throw': {
      const ex = (attr(a, 'exceptionType') as AAValue | undefined)?.exceptionName
      return `Error handler: Throw ${typeof ex === 'string' ? ex : (p ?? '')}`.trim()
    }
    case 'capture': {
      const action = a.attributes.find(at => /Action$/.test(at.name))?.value?.string
      const verbs: Record<string, string> = { LEFTCLICK: 'Left click', RIGHTCLICK: 'Right click', DOUBLECLICK: 'Double click', CLICK: 'Click', SETTEXT: 'Set text', GETPROPERTY: 'Get property', SELECT: 'Select', SELECTITEMBYTEXT: 'Select item by text', EXPAND: 'Expand', EXTRACTTOCSV: 'Extract to CSV' }
      const verb = action ? verbs[action] ?? action : ''
      const inputValue = attr(a, 'valueCV') ?? attr(a, 'value')
      const password = a.attributes.some(attribute => attribute.name === 'passwordtextAction')
      const safePasswordReference = inputValue?.expression && /^\$[^$]+\$$/.test(inputValue.expression) ? inputValue.expression : inputValue?.variableName ? `$${inputValue.variableName}$` : '[REDACTED]'
      const input = /SETTEXT|SELECTITEMBYTEXT/.test(action ?? '') ? password ? safePasswordReference : primitive(inputValue) : undefined
      return `Recorder: Capture ${verb} ${capturedControl(a)}${input ? ' value ' + input : ''}`.replace(/\s+/g, ' ').trim()
    }
    default:
      return undefined
  }
}

export function describeAction(a: Action): string {
  const s = special(a)
  if (s) return s

  const pkg = PACKAGE_LABEL[a.packageName] ?? a.packageName
  const verb = COMMAND_LABEL[a.commandName] ?? a.commandName
  const parts = [`${pkg}: ${verb}`]

  const p = firstPrimitive(a)
  if (p) parts.push(p)
  const to = returnTarget(a)
  if (to) parts.push(`to ${to}`)
  return parts.join(' ')
}

/** Broad package families, so one glyph covers related packages. */
export type Glyph =
  | 'data' | 'flow' | 'error' | 'file' | 'table' | 'recorder'
  | 'log' | 'comment' | 'taskbot' | 'time' | 'message' | 'app' | 'generic'

const GLYPH_BY_PACKAGE: Record<string, Glyph> = {
  String: 'data', Number: 'data', Boolean: 'data', Dictionary: 'data', List: 'data', ListPlus: 'data',
  If: 'flow', Loop: 'flow',
  ErrorHandler: 'error',
  File: 'file', Folder: 'file', CsvTxt: 'file', LogToFile: 'file', A360ToolBox: 'file',
  DataTable: 'table', DataTablePlus: 'table', Excel: 'table', Excel_MS: 'table', 'Data Table_Additional Functions': 'table',
  Recorder: 'recorder', A360ScreenRecorder: 'recorder', Keystrokes: 'recorder', Window: 'recorder',
  A360BotFramework: 'log',
  betterComments: 'comment', Comment: 'comment',
  TaskBot: 'taskbot',
  Datetime: 'time', Delay: 'time', Wait: 'time',
  MessageBox: 'message', MessageBoxPlus: 'message', Email: 'message', PlaySound: 'message',
  Application: 'app', VBScript: 'app', Browser: 'app',
}

export function glyphFor(a: Action): Glyph {
  if (a.commandName.startsWith('documentation')) return 'comment'
  if (a.commandName.startsWith('log')) return 'log'
  return GLYPH_BY_PACKAGE[a.packageName] ?? 'generic'
}

/** 16×16 path data, drawn here rather than lifted from the Control Room icon font. */
export const GLYPH_PATH: Record<Glyph, string> = {
  data: 'M3 4h10M3 8h10M3 12h6',
  flow: 'M8 2v4M8 6L4 9v5M8 6l4 3v5',
  error: 'M8 2l6 11H2L8 2zM8 6v4M8 11.5v.5',
  file: 'M4 2h5l3 3v9H4V2zM9 2v3h3',
  table: 'M2 3h12v10H2V3zM2 7h12M6 3v10',
  recorder: 'M3 4h10v8H3V4zM8 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  log: 'M4 2h8v12l-4-2.5L4 14V2z',
  comment: 'M2 3h12v8H7l-3 3v-3H2V3z',
  taskbot: 'M5 3h6v3H5V3zM3 9h4v4H3V9zM9 9h4v4H9V9zM8 6v3M5 9V8h6v1',
  time: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3.5l2.5 1.5',
  message: 'M2 4h12v7H9l-3 3v-3H2V4z',
  app: 'M2 3h12v3H2V3zM2 7h12v6H2V7zM4 4.5h.01M6 4.5h.01',
  generic: 'M8 3.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z',
}
