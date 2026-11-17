import { createContext } from 'react'
import type { BotScore, Severity, TaskbotMetrics } from '../../core/model'
import type { IconName } from '../Icons'

export const DetailContext = createContext(true)

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

export interface FileNodeData {
  label: string // basename
  path: string
  kind: 'config' | 'asset' | 'other'
  ext: string
  [key: string]: unknown
}

export const FILE_NODE_WIDTH = 170
export const FILE_NODE_HEIGHT = 52
