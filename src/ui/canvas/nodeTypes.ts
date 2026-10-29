import { createContext } from 'react'
import type { BotScore, TaskbotMetrics } from '../../core/model'

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

export const NODE_WIDTH = 280
export function nodeHeight(d: TBNodeData): number {
  if (d.ghost) return 60
  const rows = Math.max(d.inputVars.length, 1) + Math.max(d.wireOutVars.length, 0)
  return 96 + rows * 22
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
