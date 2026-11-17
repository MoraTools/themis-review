import { createContext } from 'react'
import type { BotScore, Severity, TaskbotMetrics } from '../../core/model'
import type { IconName } from '../Icons'
import { hasText, translate, type Lang } from '../i18n'

export const DetailContext = createContext(true)
/** true when the layout runs top to bottom (narrow panes): call handles sit on the top and bottom */
export const VerticalContext = createContext(false)

export interface TBNodeData {
  label: string
  path: string
  ghost: boolean
  metrics?: TaskbotMetrics
  score?: BotScore
  /** input vars shown on the left with target handles */
  inputVars: { name: string; type: string }[]
  /** vars feeding outgoing calls, shown on the right with source handles */
  wireOutVars: { name: string; type: string }[]
  outputVars: string[]
  findingsCount: number
  /** findings split by severity; absent on ghosts */
  bySeverity?: Record<Severity, number>
  [key: string]: unknown
}

export const TYPE_COLORS: Record<string, string> = {
  STRING: 'var(--type-string)',
  NUMBER: 'var(--type-number)',
  DICTIONARY: 'var(--type-dictionary)',
  LIST: 'var(--type-list)',
  BOOLEAN: 'var(--type-boolean)',
  DATETIME: 'var(--type-datetime)',
  FILE: 'var(--type-file)',
  TABLE: 'var(--type-table)',
  RECORD: 'var(--type-record)',
  WINDOW: 'var(--type-window)',
  ANY: 'var(--type-any)',
}

export function typeColor(t: string): string {
  return TYPE_COLORS[t] ?? TYPE_COLORS.ANY
}

/** short type tags, the same as the Type part of the naming key */
const TYPE_TAGS: Record<string, string> = {
  STRING: 'Str',
  NUMBER: 'Num',
  DICTIONARY: 'Dict',
  LIST: 'List',
  BOOLEAN: 'Bool',
  DATETIME: 'Date',
  FILE: 'File',
  TABLE: 'Table',
  RECORD: 'Rec',
  WINDOW: 'Win',
  ANY: 'Any',
}

export function typeTag(t: string): string {
  return TYPE_TAGS[t] ?? t.charAt(0) + t.slice(1).toLowerCase()
}

/** the short tag and the readable name, e.g. "Dict · Dictionary"; for the Variables table and the legend */
export function typeLabel(t: string, lang: Lang): string {
  return hasText('type.' + t) ? `${typeTag(t)} · ${translate(lang, 'type.' + t)}` : typeTag(t)
}

/** node stat glyphs, shared by the node and the legend; keys are `node.*` labels */
export const STAT_ICONS = {
  lines: 'file-archive',
  comments: 'message-square',
  logs: 'scroll-text',
  vars: 'braces',
  msgbox: 'app-window',
} as const satisfies Record<string, IconName>

export const SEVERITIES: Severity[] = ['error', 'warn', 'info']

export const NODE_WIDTH = 280
/** about one 13px title line beside the grade chip; longer names wrap (up to 3 lines) */
const TITLE_CHARS = 24
/** the rendered height, measured in Chromium: head + stats 89, a variable row 22 (inputs and
 *  outputs sit side by side), the findings row 33, an extra title line 18, a ghost 67 */
export function nodeHeight(d: TBNodeData): number {
  const extraTitle = (Math.min(3, Math.max(1, Math.ceil(d.label.length / TITLE_CHARS))) - 1) * 18
  if (d.ghost) return 67 + extraTitle
  const rows = Math.max(d.inputVars.length, d.wireOutVars.length, 1)
  return 89 + rows * 22 + (d.findingsCount > 0 ? 33 : 0) + extraTitle
}

/** compact text grows by 1/zoom up to this factor (the --s cap in styles.css) */
const COMPACT_SCALE_CAP = 3.4
/** average advance of the 12 px semibold UI font, in px */
const CHAR_PX = 7

/** The height of a compact node at `zoom`, in flow units: its text is counter-scaled, so at a
 *  low zoom it needs more room than the detailed node. The name wraps only at word points
 *  (underscore, camel case), as <Name> does. */
export function compactHeight(d: TBNodeData, zoom: number): number {
  const s = Math.min(1 / zoom, COMPACT_SCALE_CAP)
  const perLine = Math.max(1, Math.floor((NODE_WIDTH - 20 * s) / (CHAR_PX * s)))
  let lines = 1
  let used = 0
  for (const part of d.label.split(/(?<=_)|(?<=[a-z0-9])(?=[A-Z])/)) {
    if (used > 0 && used + part.length > perLine) {
      lines++
      used = 0
    }
    // a single part longer than the line breaks inside the word
    lines += Math.floor(Math.max(0, used + part.length - 1) / perLine)
    used = ((used + part.length - 1) % perLine) + 1
  }
  // a ghost has its tag ('No está en los zips', up to 19 characters) where the grade chip is
  const head = d.ghost ? 4 + Math.ceil(19 / perLine) * 14.4 : 22
  // padding 12, grade chip 18 and gap 4, title lines of 14.4, severity row 4 + 16
  return s * (12 + head + lines * 14.4 + (d.findingsCount > 0 ? 20 : 0)) + 2
}

export interface FileNodeData {
  label: string // basename
  path: string
  kind: 'config' | 'asset' | 'other'
  ext: string
  [key: string]: unknown
}

export const FILE_NODE_WIDTH = 170
export const FILE_NODE_HEIGHT = 52
