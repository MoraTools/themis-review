import type { ReactNode } from 'react'
import type { Finding, Severity } from '../../core/model'
import { SeverityIcon } from '../Icons'
import { useNumber, useT } from '../i18n'

/** the place a finding cites: "Line N" (a button when it can be opened), else the variable name */
function Where({ line, varName, onLine, lineAction }: { line?: number; varName?: string; onLine?: () => void; lineAction?: string }) {
  const t = useT()
  const number = useNumber()
  if (line === undefined) return varName ? <code className="finding-where">{varName}</code> : null
  const label = `${t('report.finding.line')} ${number(line)}`
  return onLine ? (
    <button type="button" className="finding-where finding-line" aria-label={lineAction} title={lineAction} onClick={onLine}>
      {label}
    </button>
  ) : (
    <span className="finding-where">{label}</span>
  )
}

function Head({ severity, ruleId, children }: { severity: Severity; ruleId: string; children?: ReactNode }) {
  const t = useT()
  return (
    <div className="finding-head">
      <span className={'severity-chip sev-' + severity}>
        <SeverityIcon severity={severity} /> {t('report.severity.' + severity)}
      </span>
      <span className="finding-title">{t(`rule.${ruleId}.title`)}</span>
      {children}
      <code className="finding-rule">{ruleId}</code>
    </div>
  )
}

/** one finding: severity chip, where, rule id, message and a labelled fix. Shared by the editor and the report. */
export function FindingCard({ finding: f, line, onLine, lineAction, tabIndex, index }: {
  finding: Finding
  line?: number
  onLine?: () => void
  lineAction?: string
  tabIndex?: number
  index?: number
}) {
  const t = useT()
  return (
    <article className={'finding-card sev-' + f.severity} tabIndex={tabIndex} data-finding={index}>
      <Head severity={f.severity} ruleId={f.ruleId}>
        <Where line={line} varName={f.varName} onLine={onLine} lineAction={lineAction} />
      </Head>
      <p className="finding-msg">{t(`rule.${f.ruleId}.msg`, f.params)}</p>
      <p className="finding-fix">
        <strong>{t('report.finding.fix')}:</strong> {t(`rule.${f.ruleId}.fix`, f.params)}
      </p>
    </article>
  )
}

/** params that are equal in every finding stay; the others read "…" in the shared message */
function commonParams(findings: Finding[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(findings[0].params)) {
    const value = findings[0].params[key]
    out[key] = findings.every((f) => f.params[key] === value) ? value : '…'
  }
  return out
}

/** what one item of a group names: its variable, path, command or call target, plus the rename when there is one */
function itemText(f: Finding): string {
  const p = f.params
  const subject = f.varName ?? p.name ?? p.var ?? p.path ?? p.target ?? p.callee ?? p.command ?? ''
  return p.suggestion ? `${subject} → ${p.suggestion}` : subject
}

/** 3 or more findings of one rule in one taskbot: the message and the fix once, then a compact list */
export function FindingGroupCard({
  findings,
  lineOf,
  onLine,
  lineAction,
}: {
  findings: Finding[]
  lineOf: (f: Finding) => number | undefined
  onLine?: (line: number) => void
  lineAction?: (line: number) => string
}) {
  const t = useT()
  const number = useNumber()
  const first = findings[0]
  const params = commonParams(findings)
  // the list shows each rename, so the fix needs no "…" placeholder
  const fix = first.ruleId === 'VAR_NAME_FORMAT' ? t('report.group.rename') : t(`rule.${first.ruleId}.fix`, params)
  const items = findings
    .map((f) => ({ f, line: lineOf(f), text: itemText(f) }))
    .sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
  // a subject that is the same in every item (e.g. the command) says nothing in the list
  const sameText = items.every((i) => i.text === items[0].text)
  return (
    <article className={'finding-card finding-group sev-' + first.severity}>
      <Head severity={first.severity} ruleId={first.ruleId}>
        <span className="finding-where">{t('report.group.count', { n: number(findings.length) })}</span>
      </Head>
      <p className="finding-msg">{t(`rule.${first.ruleId}.msg`, params)}</p>
      <p className="finding-fix">
        <strong>{t('report.finding.fix')}:</strong> {fix}
      </p>
      <ul className="finding-items">
        {items.map(({ line, text }, i) => {
          return (
            <li key={i}>
              {line !== undefined &&
                (onLine ? (
                  <button type="button" className="finding-line" aria-label={lineAction?.(line)} title={lineAction?.(line)} onClick={() => onLine(line)}>
                    L{number(line)}
                  </button>
                ) : (
                  <span>L{number(line)}</span>
                ))}{' '}
              {!sameText && <code>{text}</code>}
            </li>
          )
        })}
      </ul>
    </article>
  )
}
