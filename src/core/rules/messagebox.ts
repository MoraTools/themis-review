import type { Action, Finding, Taskbot } from '../model'
import { isLog } from '../model'

/** MessageBox package and the MessageBoxPlus variants (ShowDictionary, ShowNumber, ...). */
export function isMessageBox(a: Action): boolean {
  return a.packageName === 'MessageBox' || a.packageName === 'MessageBoxPlus'
}

function boolAttr(a: Action, name: string): boolean | undefined {
  const v = a.attributes.find((at) => at.name === name)?.value
  return typeof v?.boolean === 'boolean' ? v.boolean : undefined
}

/** A box only blocks an unattended run when it never closes on its own.
 *  MessageBox uses `closeMsgBox` + `timeOut`; MessageBoxPlus uses `isChecked`. */
export function autoCloses(a: Action): boolean {
  return (boolAttr(a, 'closeMsgBox') ?? boolAttr(a, 'isChecked')) === true
}

export function messageBoxRules(bot: Taskbot): Finding[] {
  const out: Finding[] = []
  const boxes = bot.actions.filter(isMessageBox)

  for (const a of boxes) {
    if (!a.reachable) {
      out.push({
        ruleId: 'MSGBOX_DEAD',
        severity: 'warn',
        botPath: bot.path,
        line: a.line,
        params: { line: String(a.line) },
      })
    } else if (!autoCloses(a)) {
      out.push({
        ruleId: 'MSGBOX_BLOCKING',
        severity: 'error',
        botPath: bot.path,
        line: a.line,
        params: { line: String(a.line), command: a.commandName },
      })
    }
  }

  const activeBoxes = boxes.filter((a) => a.reachable).length
  const activeLogs = bot.actions.filter((a) => isLog(a) && a.reachable).length
  if (activeBoxes > activeLogs) {
    out.push({
      ruleId: 'MSGBOX_OVER_LOGS',
      severity: 'warn',
      botPath: bot.path,
      params: { boxes: String(activeBoxes), logs: String(activeLogs) },
    })
  }
  return out
}
