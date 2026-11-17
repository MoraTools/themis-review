import type { BotScore, Finding, Severity, Taskbot } from '../../core/model'
import { DEDUCTION, GRADE_BANDS, RULE_CAP, capGroup } from '../../core/score'
import { translate, type Lang } from '../i18n'

export const SEVERITIES: Severity[] = ['error', 'warn', 'info']
const SEV_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

/** severity first (error, warn, info), then line; the editor and the report use the same order */
export function compareFindings(x: Finding, y: Finding): number {
  return SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || (x.line ?? 0) - (y.line ?? 0)
}

/** line a finding points at: its own line, else the first reference of its variable */
export function findingLine(f: Finding, bot: Pick<Taskbot, 'varRefs'>): number | undefined {
  return f.line ?? (f.varName ? bot.varRefs[f.varName]?.[0] : undefined)
}

export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  return counts
}

export type FindingEntry =
  | { kind: 'single'; finding: Finding }
  | { kind: 'group'; ruleId: string; severity: Severity; findings: Finding[] }

/** One card per finding, except 3 or more findings of one rule (and severity), which share one card
 *  at the place of the first. Every finding stays in exactly one entry, so counts never change. */
export function groupFindings(findings: Finding[], min = 3): FindingEntry[] {
  const byKey = new Map<string, Finding[]>()
  for (const f of findings) {
    const key = f.ruleId + '|' + f.severity
    byKey.set(key, [...(byKey.get(key) ?? []), f])
  }
  const out: FindingEntry[] = []
  const placed = new Set<string>()
  for (const f of findings) {
    const key = f.ruleId + '|' + f.severity
    const list = byKey.get(key)!
    if (list.length < min) out.push({ kind: 'single', finding: f })
    else if (!placed.has(key)) {
      placed.add(key)
      out.push({ kind: 'group', ruleId: f.ruleId, severity: f.severity, findings: list })
    }
  }
  return out
}

export function entrySize(e: FindingEntry): number {
  return e.kind === 'single' ? 1 : e.findings.length
}

/** points each rule family takes from one bot, with the same cap as scoreFindings(), largest first */
export function lostPoints(findings: Finding[]): { group: string; points: number; capped: boolean }[] {
  const byGroup = new Map<string, number>()
  for (const f of findings) {
    const key = capGroup(f.ruleId)
    byGroup.set(key, (byGroup.get(key) ?? 0) + DEDUCTION[f.severity])
  }
  return [...byGroup]
    .map(([group, sum]) => ({ group, points: Math.min(sum, RULE_CAP), capped: sum >= RULE_CAP }))
    .sort((a, b) => b.points - a.points || a.group.localeCompare(b.group))
}

export function gradeDistribution(scores: BotScore[]): Record<BotScore['grade'], number> {
  const out = Object.fromEntries(GRADE_BANDS.map((b) => [b.grade, 0])) as Record<BotScore['grade'], number>
  for (const s of scores) out[s.grade]++
  return out
}

/** the scoring rule and the grade bands, built from the scoring constants (no second copy of the numbers) */
export function scoringLines(lang: Lang): { rule: string; bands: string } {
  const n = new Intl.NumberFormat(lang).format
  const rule = translate(lang, 'report.scoring.rule', {
    error: n(DEDUCTION.error),
    warn: n(DEDUCTION.warn),
    info: n(DEDUCTION.info),
    cap: n(RULE_CAP),
  })
  const bands = GRADE_BANDS.map((b, i) =>
    b.min > 0 || i === 0 ? `${b.grade} ≥ ${n(b.min)}` : `${b.grade} < ${n(GRADE_BANDS[i - 1].min)}`,
  ).join(' · ')
  return { rule, bands: translate(lang, 'report.scoring.bands', { bands }) }
}

/** "16 Info" or "3 Warning, 16 Info" for the severities that have hidden findings */
export function hiddenList(counts: Record<Severity, number>, shown: Record<Severity, boolean>, lang: Lang): string {
  const n = new Intl.NumberFormat(lang).format
  return SEVERITIES.filter((s) => !shown[s] && counts[s] > 0)
    .map((s) => `${n(counts[s])} ${translate(lang, 'report.severity.' + s)}`)
    .join(', ')
}
