import { isComment, type Action, type Finding, type Taskbot } from '../model'

const WIN_PATH_RE = /[A-Za-z]:\\[^\s"'<>|]+/

export function structureRules(bot: Taskbot): Finding[] {
  const out: Finding[] = []
  const byParent = new Map<string, Action[]>()
  const byUid = new Map(bot.actions.map((action) => [action.uid, action]))
  for (const a of bot.actions) {
    if (a.parentUid) {
      const arr = byParent.get(a.parentUid) ?? []
      arr.push(a)
      byParent.set(a.parentUid, arr)
    }
  }

  let hasTry = false
  for (const a of bot.actions) {
    if (a.commandName === 'try') hasTry = true

    // empty catch: catch node whose direct children are all disabled or comments (or none)
    if (a.commandName === 'catch' && a.reachable) {
      const kids = (byParent.get(a.uid) ?? []).filter((k) => k.depth === a.depth + 1)
      const effective = kids.filter((k) => !k.disabled && !isComment(k))
      if (effective.length === 0) {
        out.push({ ruleId: 'EMPTY_CATCH', severity: 'error', botPath: bot.path, line: a.line, params: { line: String(a.line) } })
      }
    }

    // disabled block: report topmost disabled node only
    if (a.disabled) {
      const parent = a.parentUid ? byUid.get(a.parentUid) : undefined
      if (!parent || !parent.disabled) {
        out.push({ ruleId: 'DISABLED_CODE', severity: 'info', botPath: bot.path, line: a.line, params: { line: String(a.line), command: a.commandName } })
      }
    }

    // hardcoded absolute Windows path in enabled, non-comment actions
    if (a.reachable && !isComment(a)) {
      const texts: string[] = []
      const walk = (v: unknown): void => {
        if (v == null || typeof v !== 'object') return
        const o = v as Record<string, unknown>
        if (typeof o.string === 'string') texts.push(o.string)
        if (typeof o.expression === 'string') texts.push(o.expression)
        for (const k of Object.keys(o)) {
          const c = o[k]
          if (Array.isArray(c)) c.forEach(walk)
          else if (c && typeof c === 'object') walk(c)
        }
      }
      a.attributes.forEach((at) => walk(at.value))
      const hit = texts.find((t) => WIN_PATH_RE.test(t))
      if (hit) {
        out.push({
          ruleId: 'HARDCODED_PATH',
          severity: 'warn',
          botPath: bot.path,
          line: a.line,
          params: { line: String(a.line), path: hit.match(WIN_PATH_RE)![0] },
        })
      }
    }

  }

  // deep nesting: single finding at first line reaching depth >= 6
  const deep = bot.actions.find((a) => a.depth >= 6 && a.reachable && !isComment(a))
  if (deep) {
    const maxDepth = Math.max(...bot.actions.map((a) => a.depth))
    out.push({ ruleId: 'DEEP_NESTING', severity: 'info', botPath: bot.path, line: deep.line, params: { line: String(deep.line), depth: String(maxDepth) } })
  }

  if (!hasTry && bot.actions.length >= 10) {
    out.push({ ruleId: 'NO_ERROR_HANDLING', severity: 'warn', botPath: bot.path, params: {} })
  }

  if (bot.actions.length > MAX_LINES) {
    out.push({
      ruleId: 'TOO_LONG',
      severity: 'error',
      botPath: bot.path,
      params: { lines: String(bot.actions.length), max: String(MAX_LINES) },
    })
  }
  return out
}

/** Framework limit: past this size a taskbot must be split into modules. */
export const MAX_LINES = 250
