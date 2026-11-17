import type { Finding, Taskbot, Variable } from '../model'

// <scope><Type><CamelName> — from guia-core-framework.md (aa-code repo, docs/)
const NAME_RE = /^(io|p|i|o|c)(Str|Num|Table|Dict|List|Date|Bool|File|Rec|Win|Any)([A-Z][A-Za-z0-9]*)$/

const TYPE_TOKEN: Record<string, string> = {
  STRING: 'Str',
  NUMBER: 'Num',
  TABLE: 'Table',
  DICTIONARY: 'Dict',
  LIST: 'List',
  DATETIME: 'Date',
  BOOLEAN: 'Bool',
  FILE: 'File',
  RECORD: 'Rec',
  WINDOW: 'Win',
  ANY: 'Any',
}

const BOOL_FLAG_RE = /^(Is|Has|Can|Allows|Supports)/

function expectedScope(v: Variable): string {
  if (v.input && v.output) return 'io'
  if (v.input) return 'i'
  if (v.output) return 'o'
  if (v.readOnly) return 'c'
  return 'p'
}

function suggestName(v: Variable): string {
  const token = TYPE_TOKEN[v.type] ?? 'Any'
  // strip an existing (possibly wrong) prefix before rebuilding; a prefix counts only before
  // an upper-case letter, so "contador" keeps its "c". A leading lower-case type word goes only
  // when it is an abbreviation (strProveedor) or the variable's own type (fileInput as File);
  // fileName as String keeps "file", which is part of the name.
  const m = v.name.match(NAME_RE)
  const ownWord = new RegExp('^(str|num|bool|' + token.toLowerCase() + ')(?=[A-Z0-9_])', 'i')
  const base = m
    ? m[3]
    : v.name
        .replace(/^(io|p|i|o|c|v)(Str|Num|Table|Dict|List|Date|Bool|File|Rec|Win|Any)(?![a-z])/, '')
        .replace(/^(io|p|i|o|c|v)(?=[A-Z])/, '')
        .replace(ownWord, '')
  const camel = base ? base[0].toUpperCase() + base.slice(1) : 'Variable'
  return expectedScope(v) + token + camel
}

export function namingRules(bot: Taskbot): Finding[] {
  const out: Finding[] = []
  for (const v of bot.variables) {
    const m = v.name.match(NAME_RE)
    if (!m) {
      out.push({
        ruleId: 'VAR_NAME_FORMAT',
        severity: 'warn',
        botPath: bot.path,
        varName: v.name,
        params: { name: v.name, suggestion: suggestName(v) },
      })
    } else {
      const [, scope, typeToken] = m
      const expScope = expectedScope(v)
      // 'c' can't be fully derived (readOnly flag is the only hint); accept c for locals
      const scopeOk = scope === expScope || (scope === 'c' && expScope === 'p')
      if (!scopeOk) {
        out.push({
          ruleId: 'VAR_SCOPE_MISMATCH',
          severity: 'warn',
          botPath: bot.path,
          varName: v.name,
          params: { name: v.name, scope, expected: expScope, suggestion: suggestName(v) },
        })
      }
      const expToken = TYPE_TOKEN[v.type]
      if (expToken && typeToken !== expToken) {
        out.push({
          ruleId: 'VAR_TYPE_MISMATCH',
          severity: 'warn',
          botPath: bot.path,
          varName: v.name,
          params: { name: v.name, token: typeToken, expected: expToken, suggestion: suggestName(v) },
        })
      }
      if (v.type === 'BOOLEAN' && expToken && typeToken === expToken && !BOOL_FLAG_RE.test(m[3])) {
        out.push({
          ruleId: 'VAR_BOOL_NAME',
          severity: 'info',
          botPath: bot.path,
          varName: v.name,
          params: { name: v.name },
        })
      }
    }
    // An undocumented input/output is part of the taskbot's contract with its callers;
    // an undocumented local only costs the next reader of this one file.
    if (!v.description.trim()) {
      const isContract = v.input || v.output
      out.push({
        ruleId: isContract ? 'VAR_NO_DESCRIPTION' : 'VAR_NO_DESCRIPTION_LOCAL',
        severity: isContract ? 'warn' : 'info',
        botPath: bot.path,
        varName: v.name,
        params: { name: v.name },
      })
    }
  }
  return out
}
