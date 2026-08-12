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
  STRING: '#63b3ed',
  NUMBER: '#68d391',
  DICTIONARY: '#b794f4',
  LIST: '#f6ad55',
  BOOLEAN: '#f687b3',
  DATETIME: '#4fd1c5',
  FILE: '#f6e05e',
  TABLE: '#fc8181',
  RECORD: '#d6bcfa',
  WINDOW: '#a0aec0',
  ANY: '#cbd5e0',
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

export function fileIcon(ext: string): string {
  switch (ext) {
    case 'xml': return '⚙'
    case 'xlsx': case 'xls': case 'csv': return '▦'
    case 'ps1': case 'bat': case 'vbs': return '»'
    case 'png': case 'jpg': case 'gif': case 'svg': return '◱'
    case 'wav': case 'mp3': return '♪'
    case 'pdf': return '≡'
    default: return '·'
  }
}
