// Core data model — pure TS, no React.

/** Raw AA attribute value; recursive, loosely typed on purpose. */
export interface AAValue {
  type?: string
  string?: string
  expression?: string
  number?: string
  boolean?: boolean
  dictionary?: { key: string; value: AAValue }[]
  taskbotFile?: AAValue
  taskbotInput?: AAValue
  variableName?: string
  [k: string]: unknown
}

export interface AAAttribute {
  name: string
  value?: AAValue
}

export interface Variable {
  name: string
  description: string
  type: string // STRING, NUMBER, DICTIONARY, ...
  subtype?: string
  readOnly: boolean
  input: boolean
  output: boolean
}

export interface Action {
  uid: string
  line: number // 1-based, AA editor order (parent, children, branches)
  depth: number
  commandName: string
  packageName: string
  disabled: boolean // own flag
  reachable: boolean // false if self or any ancestor disabled
  attributes: AAAttribute[]
  returnTo?: AAValue
  childCount: number
  parentUid?: string
}

export interface CallInput {
  calleeVar: string
  /** raw expression or literal passed */
  raw: string
  /** caller variables referenced in the expression */
  callerVars: string[]
  isLiteral: boolean
}

export interface Call {
  line: number
  targetPath: string // normalized repo path
  inputs: CallInput[]
  disabled: boolean
  reachable: boolean
}

export interface TaskbotMetrics {
  totalLines: number
  disabledLines: number
  commentLines: number // all comment-kind actions
  commentsByKind: Record<string, number>
  logMessages: number
  logToFile: number
  messageBoxes: number
  variables: number
  inputVars: number
  outputVars: number
  localVars: number
}

export interface Taskbot {
  path: string // 'Automation Anywhere/Bots/.../tasks/Name'
  name: string
  folder: string // bot folder path (parent of /tasks)
  sourceZip: string
  variables: Variable[]
  actions: Action[] // flattened, editor order
  packages: { name: string; version: string }[]
  calls: Call[]
  /** var name -> lines where referenced in attributes/returnTo */
  varRefs: Record<string, number[]>
  /** lowercase concatenation of every attribute string/expression — used to match asset file references */
  textBlob: string
}

export type Severity = 'error' | 'warn' | 'info'

export interface Finding {
  ruleId: string
  severity: Severity
  botPath: string
  line?: number
  varName?: string
  /** interpolation params for i18n message/fix templates */
  params: Record<string, string>
}

export interface GraphEdge {
  from: string
  to: string
  calls: Call[] // one edge per bot pair; individual calls listed
}

export interface BotScore {
  score: number // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface OtherFile {
  path: string
  sourceZip: string
  size: number
  kind: 'config' | 'asset' | 'other'
}

export interface FileEdge {
  from: string // taskbot path
  to: string // file path
}

export interface ProjectAnalysis {
  taskbots: Taskbot[]
  /** paths referenced by runTask but not present in any uploaded zip */
  ghostPaths: string[]
  edges: GraphEdge[]
  /** taskbot → static asset/config references (basename match, contents never analyzed) */
  fileEdges: FileEdge[]
  findings: Finding[]
  metrics: Record<string, TaskbotMetrics> // by bot path
  scores: Record<string, BotScore>
  projectScore: BotScore
  otherFiles: OtherFile[]
  zipNames: string[]
}

export const COMMENT_COMMANDS = new Set([
  'BetterComments',
  'Comment',
  'documentation_comment',
  'documentation_about',
  'documentation_sequence',
])

export function isComment(a: { commandName: string }): boolean {
  return COMMENT_COMMANDS.has(a.commandName)
}
