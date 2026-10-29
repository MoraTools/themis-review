import { translate, type Lang } from '../i18n'
import type { AAValue, Action } from '../../core/model'

/** Human-readable action labels in the shape the Control Room task-bot view uses:
 *  `Package: Verb args`, string literals in “ ”, variables kept as $name$.
 *  Derived from two real Control Room exports (see plan.md). */

function label(lang: Lang, kind: string, value: string) {
  const key = `action.${kind}.${value}`
  const text = translate(lang, key)
  return text === key ? value : text
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
function primitive(v: AAValue | undefined, lang: Lang): string | undefined {
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
    return translate(lang, 'action.dictionary', { count: new Intl.NumberFormat(lang).format(v.dictionary.length) })
  }
  if (Array.isArray(v.list)) return translate(lang, 'action.list', { count: new Intl.NumberFormat(lang).format(v.list.length) })
  if (Array.isArray(v.table)) return translate(lang, 'action.table', { count: new Intl.NumberFormat(lang).format(v.table.length) })
  return undefined
}

function stripHtml(s: string): string {
  const text = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 90 ? text.slice(0, 87) + '…' : text
}

function attr(a: Action, name: string): AAValue | undefined {
  return a.attributes.find((x) => x.name === name)?.value
}

function firstPrimitive(a: Action, lang: Lang): string | undefined {
  for (const name of PRIMARY_ATTRS) {
    const p = primitive(attr(a, name), lang)
    if (p) return p
  }
  for (const at of a.attributes) {
    if (ATTR_DENY.has(at.name)) continue
    const p = primitive(at.value, lang)
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

/** `if` keeps its operands on the condition attribute entry itself, alongside name/value */
function condition(a: Action, lang: Lang): string {
  const entry = a.attributes.find((x) => x.name === 'condition') as
    | { name: string; value?: AAValue; attributes?: { name: string; value?: AAValue }[] }
    | undefined
  if (!entry) return ''
  const inner = entry.attributes ?? []
  const get = (n: string) => inner.find((x) => x.name === n)?.value
  const left = primitive(get('variable'), lang) ?? primitive(get('sourceString'), lang) ?? primitive(get('window'), lang) ?? ''
  const opRaw = get('operator')?.string ?? ''
  const op = label(lang, 'operator', opRaw)
  const right = primitive(get('value'), lang) ?? ''
  // only name the operand type when there is an operand to name
  const kind = typeof entry.value?.conditionalName === 'string' ? entry.value.conditionalName : ''
  const noun = left ? kind.replace(/Variable$/, '').toLowerCase() : ''
  return [noun, left, op, right].filter(Boolean).join(' ')
}

/** Recorder actions hide the captured control inside a base64 JSON blob. Decoding is
 *  cached per action because the blobs run to several KB each. */
const uiObjectCache = new Map<string, string>()

function capturedControl(a: Action, lang: Lang): string {
  const cached = uiObjectCache.get(lang + ':' + a.uid)
  if (cached !== undefined) return cached

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
      if (tag) props.push(translate(lang, 'action.on', { tag: tag.toLowerCase() }))
      const name = id ?? text
      if (name) props.push(quoted(name))
      out = props.join(' ')
    }
  } catch {
    out = '' // an unreadable blob just means a shorter label
  }
  uiObjectCache.set(lang + ':' + a.uid, out)
  return out
}

/** Control Room renders these without the `Package:` prefix, or from specific attributes. */
function special(a: Action, lang: Lang): string | undefined {
  const p = firstPrimitive(a, lang)
  switch (a.commandName) {
    case 'BetterComments':
    case 'Comment':
      return `BetterComment ${p ?? ''}`.trim()
    case 'messageBox':
      return `${translate(lang, 'action.messageBox')} ${p ?? ''}`.trim()
    case 'if':
      return `${translate(lang, 'action.if')} ${condition(a, lang)}`.trim()
    case 'Keystrokes':
      return `${translate(lang, 'action.keystrokes')} ${p ?? ''}`.trim()
    case 'waitForWindow': {
      const type = attr(a, 'waitType')?.string === 'CLOSE' ? translate(lang, 'action.close') : translate(lang, 'action.open')
      const win = primitive(attr(a, 'window'), lang) ?? ''
      return translate(lang, 'action.waitWindow', { type, window: win }).trim()
    }
    case 'runTask': {
      const name = taskbotName(a)
      return name ? `${label(lang, 'package', 'TaskBot')}: ${label(lang, 'command', 'runTask')} ${name}` : undefined
    }
    case 'log_message': {
      const level = label(lang, 'logLevel', attr(a, 'logLevel')?.string ?? '')
      const msg = primitive(attr(a, 'logMessage'), lang) ?? ''
      return `Bot Framework: ${label(lang, 'command', 'log_message')} ${level}${level ? ': ' : ''}${msg}`.trim()
    }
    case 'logs_start_session':
      return `Bot Framework: ${label(lang, 'command', 'logs_start_session')} ${returnTarget(a) ?? ''}`.trim()
    case 'documentation_about':
      return `Bot Framework: ${label(lang, 'command', 'documentation_about')}`
    case 'throw': {
      const ex = (attr(a, 'exceptionType') as AAValue | undefined)?.exceptionName
      return `${label(lang, 'package', 'ErrorHandler')}: ${label(lang, 'command', 'throw')} ${typeof ex === 'string' ? ex : (p ?? '')}`.trim()
    }
    case 'capture': {
      const action = attr(a, 'buttonAction')?.string
      const verb = action ? action.charAt(0) + action.slice(1).toLowerCase() : ''
      return `${label(lang, 'package', 'Recorder')}: ${label(lang, 'command', 'capture')} ${verb} ${capturedControl(a, lang)}`.replace(/\s+/g, ' ').trim()
    }
    default:
      return undefined
  }
}

export function describeAction(a: Action, lang: Lang = 'en'): string {
  const s = special(a, lang)
  if (s) return s

  const pkg = label(lang, 'package', a.packageName)
  const verb = label(lang, 'command', a.commandName)
  const parts = [`${pkg}: ${verb}`]

  const p = firstPrimitive(a, lang)
  if (p) parts.push(p)
  const to = returnTarget(a)
  if (to) parts.push(`${translate(lang, 'action.to')} ${to}`)
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
