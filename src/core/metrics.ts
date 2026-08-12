import { isComment, type Taskbot, type TaskbotMetrics } from './model'
import { isMessageBox } from './rules/messagebox'

export function computeMetrics(bot: Taskbot): TaskbotMetrics {
  const commentsByKind: Record<string, number> = {}
  let disabledLines = 0
  let commentLines = 0
  let logMessages = 0
  let logToFile = 0
  let messageBoxes = 0
  let inputVars = 0
  let outputVars = 0
  let localVars = 0
  for (const a of bot.actions) {
    if (!a.reachable) disabledLines++
    if (isComment(a)) {
      commentLines++
      commentsByKind[a.commandName] = (commentsByKind[a.commandName] ?? 0) + 1
    }
    if (a.commandName === 'log_message') logMessages++
    if (a.commandName === 'logToFile') logToFile++
    if (isMessageBox(a)) messageBoxes++
  }
  for (const variable of bot.variables) {
    if (variable.input) inputVars++
    if (variable.output) outputVars++
    if (!variable.input && !variable.output) localVars++
  }
  return {
    totalLines: bot.actions.length,
    disabledLines,
    commentLines,
    commentsByKind,
    logMessages,
    logToFile,
    messageBoxes,
    variables: bot.variables.length,
    inputVars,
    outputVars,
    localVars,
  }
}
