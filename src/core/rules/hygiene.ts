import type { Finding, Taskbot, TaskbotMetrics } from '../model'
import { isLog } from '../model'

export function hygieneRules(bot: Taskbot, m: TaskbotMetrics): Finding[] {
  const out: Finding[] = []

  const reachableLogs = bot.actions.filter((a) => isLog(a) && a.reachable).length
  if (reachableLogs === 0 && m.totalLines >= 10) {
    out.push({ ruleId: 'NO_LOGS', severity: 'warn', botPath: bot.path, params: {} })
  }

  if (m.totalLines >= 20) {
    const ratio = m.commentLines / m.totalLines
    if (ratio < 0.1) {
      out.push({
        ruleId: 'LOW_COMMENTS',
        severity: 'info',
        botPath: bot.path,
        params: { pct: (ratio * 100).toFixed(1), comments: String(m.commentLines), lines: String(m.totalLines) },
      })
    }
  }

  for (const v of bot.variables) {
    const refs = bot.varRefs[v.name] ?? []
    if (refs.length === 0 && !v.input && !v.output) {
      out.push({ ruleId: 'UNUSED_VAR', severity: 'info', botPath: bot.path, varName: v.name, params: { name: v.name } })
    }
  }
  return out
}
