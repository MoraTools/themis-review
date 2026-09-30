import { computeMetrics } from './metrics'
import type { BotScore, Finding, Taskbot, TaskbotMetrics } from './model'
import { hygieneRules } from './rules/hygiene'
import { messageBoxRules } from './rules/messagebox'
import { namingRules } from './rules/naming'
import { structureRules } from './rules/structure'
import { botScore } from './score'

export interface TaskbotReview {
  findings: Finding[]
  metrics: TaskbotMetrics
  score: BotScore
}

/** Single-bot rules shared by the project analyzer and browser extension. */
export function reviewBot(bot: Taskbot): TaskbotReview {
  const metrics = computeMetrics(bot)
  const findings = [
    ...namingRules(bot),
    ...messageBoxRules(bot),
    ...structureRules(bot),
    ...hygieneRules(bot, metrics),
  ]
  return { findings, metrics, score: botScore(findings) }
}
