import type { BotScore, Finding, ProjectAnalysis, Severity, Taskbot } from '../../core/model'
import { RULES } from '../../core/rulesInfo'
import { DEDUCTION, GRADE_BANDS, RULE_CAP, capGroup } from '../../core/score'
import { hasText, translate, type Lang } from '../i18n'

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

/** One card per finding, except 2 or more findings of one rule (and severity), which share one card
 *  at the place of the first. Every finding stays in exactly one entry, so counts never change. */
export function groupFindings(findings: Finding[], min = 2): FindingEntry[] {
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

/** `rules`: the rules of the family that have findings, in first-finding order */
export type Lost = { group: string; points: number; capped: boolean; rules: string[] }

/** points each rule family takes from one bot, with the same cap as scoreFindings(), largest first */
export function lostPoints(findings: Finding[]): Lost[] {
  const byGroup = new Map<string, { sum: number; rules: Set<string> }>()
  for (const f of findings) {
    const key = capGroup(f.ruleId)
    const g = byGroup.get(key) ?? { sum: 0, rules: new Set<string>() }
    g.sum += DEDUCTION[f.severity]
    g.rules.add(f.ruleId)
    byGroup.set(key, g)
  }
  return [...byGroup]
    .map(([group, { sum, rules }]) => ({ group, points: Math.min(sum, RULE_CAP), capped: sum >= RULE_CAP, rules: [...rules] }))
    .sort((a, b) => b.points - a.points || a.group.localeCompare(b.group))
}

/** the sum of the points lost: 100 − score, unless the score stops at 0 */
export function lostTotal(lost: Lost[]): number {
  return Math.round(lost.reduce((n, l) => n + l.points, 0) * 10) / 10
}

/** card order of one taskbot: family points (largest first, the lostPoints() order), then severity, then line;
 *  the report and the editor sort the findings with it before groupFindings() */
export function compareByFamily(lost: Lost[]): (x: Finding, y: Finding) => number {
  const rank = new Map(lost.map((l, i) => [l.group, i]))
  const at = (f: Finding) => rank.get(capGroup(f.ruleId)) ?? lost.length
  return (x, y) => at(x) - at(y) || compareFindings(x, y)
}

export type FixItem = Lost & {
  botPath: string
  /** what the family takes from the project score: its points weighted by the taskbot lines, as projectScore() does */
  project: number
}

/** all lines of the project: the weight of a taskbot is its lines over this, as in fixFirst() and projectScore() */
export function projectLines(analysis: Pick<ProjectAnalysis, 'taskbots' | 'metrics'>): number {
  return analysis.taskbots.reduce((sum, b) => sum + (analysis.metrics[b.path]?.totalLines ?? 0), 0)
}

/** the losses that raise the project score most when fixed: the report, the PDF and the map call this one function.
 *  Order: project effect, then the lowest taskbot score, then the input order (taskbots, then their lostPoints()).
 *  While other taskbots have a loss of the same size, a taskbot gets at most one item. `more` counts the cut items
 *  of the same size as the last one; `ties` are those items, in rank order. */
export function fixFirst(
  analysis: Pick<ProjectAnalysis, 'findings' | 'taskbots' | 'metrics' | 'scores'>,
  n = 3,
): { items: FixItem[]; more: number; ties: FixItem[] } {
  const byBot = new Map<string, Finding[]>()
  for (const f of analysis.findings) byBot.set(f.botPath, [...(byBot.get(f.botPath) ?? []), f])
  const lines = (path: string) => analysis.metrics[path]?.totalLines ?? 0
  const total = projectLines(analysis)
  // sizes are compared as shown (one decimal), so items that read the same are a tie
  const all = analysis.taskbots.flatMap((b) => {
    const lost = lostPoints(byBot.get(b.path) ?? [])
    const sum = lostTotal(lost)
    const now = analysis.scores[b.path]?.score ?? 100
    return lost.map((l) => {
      // the taskbot score stops at 0, so a fix gains only what lifts it above 0
      const gain = Math.max(0, Math.min(l.points, 100 - (sum - l.points) - now))
      return { ...l, botPath: b.path, project: total ? Math.round((gain * lines(b.path) / total) * 10) / 10 : 0 }
    })
  })
  const score = (i: FixItem) => analysis.scores[i.botPath]?.score ?? 100
  // a stable sort keeps the input order of ties
  const sorted = [...all].sort((a, b) => b.project - a.project || score(a) - score(b))
  // within one size, a taskbot's 2nd item comes after the 1st items of the other taskbots
  const rank = new Map<FixItem, number>()
  const seen = new Map<string, number>()
  for (const i of sorted) {
    const key = i.project + '|' + i.botPath
    rank.set(i, seen.get(key) ?? 0)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const ordered = [...sorted].sort((a, b) => b.project - a.project || rank.get(a)! - rank.get(b)!)
  const items = ordered.slice(0, n)
  const last = items.at(-1)
  const ties = last ? ordered.slice(n).filter((i) => i.project === last.project) : []
  return { items, more: ties.length, ties }
}

/** the family points for each card: the first card of a family carries them, later cards of the same family
 *  are marked inFamily, so no card reads as free */
export function entryPoints(entries: FindingEntry[], lost: Lost[]): Map<number, Lost & { inFamily?: boolean }> {
  const byGroup = new Map(lost.map((l) => [l.group, l]))
  const out = new Map<number, Lost & { inFamily?: boolean }>()
  const seen = new Set<string>()
  entries.forEach((e, i) => {
    const group = capGroup(e.kind === 'group' ? e.ruleId : e.finding.ruleId)
    const l = byGroup.get(group)
    if (!l) return
    out.set(i, seen.has(group) ? { ...l, inFamily: true } : l)
    seen.add(group)
  })
  return out
}

/** the shown severities as "Error, Warning", for the report scope line and the Export PDF name */
export function includedList(shown: Record<Severity, boolean>, lang: Lang): string {
  return SEVERITIES.filter((s) => shown[s]).map((s) => translate(lang, 'report.severity.' + s)).join(', ') || translate(lang, 'report.scope.nothing')
}

export function gradeDistribution(scores: BotScore[]): Record<BotScore['grade'], number> {
  const out = Object.fromEntries(GRADE_BANDS.map((b) => [b.grade, 0])) as Record<BotScore['grade'], number>
  for (const s of scores) out[s.grade]++
  return out
}

/** each grade band as "≥ 90", the last as "< 40"; the report line and the Rules page share it. `words` says
 *  the same in words ("90 and over", "under 40"), for accessible names and titles */
export function gradeBands(lang: Lang): { grade: BotScore['grade']; text: string; words: string }[] {
  const n = new Intl.NumberFormat(lang).format
  return GRADE_BANDS.map((b, i) => {
    const min = b.min > 0 || i === 0
    const value = n(min ? b.min : GRADE_BANDS[i - 1].min)
    return { grade: b.grade, text: min ? `≥ ${value}` : `< ${value}`, words: translate(lang, min ? 'grade.band.min' : 'grade.band.under', { n: value }) }
  })
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
  const bands = gradeBands(lang).map((b) => `${b.grade} ${b.text}`).join(' · ')
  return { rule, bands: translate(lang, 'report.scoring.bands', { bands }) }
}

/** "16 Info" or "3 Warning, 16 Info" for the severities that have hidden findings, with their total for the plural */
export function hiddenList(counts: Record<Severity, number>, shown: Record<Severity, boolean>, lang: Lang): string {
  const n = new Intl.NumberFormat(lang).format
  return SEVERITIES.filter((s) => !shown[s] && counts[s] > 0)
    .map((s) => `${n(counts[s])} ${translate(lang, 'report.severity.' + s)}`)
    .join(', ')
}

export function hiddenTotal(counts: Record<Severity, number>, shown: Record<Severity, boolean>): number {
  return SEVERITIES.reduce((n, s) => n + (shown[s] ? 0 : counts[s]), 0)
}

/** the readable name of a cap group: the family label when several rules share the cap, else the rule title */
export function groupLabel(lang: Lang, group: string): string {
  const shared = RULES.filter((r) => r.capGroup === group).length > 1
  return translate(lang, shared ? `rule.${group}.family` : `rule.${group}.title`)
}

/** the name of a Points lost or Fix first row: the rule title (as on its card) when one rule of the family has
 *  findings, the family label when two or more share the row */
export function lostLabel(lang: Lang, lost: Pick<Lost, 'group' | 'rules'>): string {
  return lost.rules.length === 1 ? translate(lang, `rule.${lost.rules[0]}.title`) : groupLabel(lang, lost.group)
}

/** the sentence and fix of a grouped card: per-rule group texts, never the single message with blanked slots */
export function groupTexts(lang: Lang, ruleId: string, n: number): { msg: string; fix: string } {
  const count = { n: new Intl.NumberFormat(lang).format(n) }
  const msgKey = hasText(`rule.${ruleId}.group`) ? `rule.${ruleId}.group` : 'report.group.msg'
  const fixKey = hasText(`rule.${ruleId}.groupFix`) ? `rule.${ruleId}.groupFix` : `rule.${ruleId}.fix`
  return { msg: translate(lang, msgKey, count), fix: translate(lang, fixKey) }
}
