import { useContext, type ReactNode } from 'react'
import type { Finding, Severity } from '../../core/model'
import { SeverityIcon } from '../Icons'
import { LangContext, useNumber, usePlural, useT } from '../i18n'
import { groupLabel, groupTexts } from './findings'

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

/** the rule id; with onRule a screen-only button to the rule's row in the Rules view, plain text in print */
function RuleId({ ruleId, onRule }: { ruleId: string; onRule?: (ruleId: string) => void }) {
  const t = useT()
  if (!onRule) return <code className="finding-rule">{ruleId}</code>
  return (
    <>
      <button type="button" className="finding-rule finding-rule-link no-print" title={t('report.finding.openRule', { id: ruleId })}
        aria-label={t('report.finding.openRule', { id: ruleId })} onClick={() => onRule(ruleId)}>
        {ruleId}
      </button>
      <code className="finding-rule print-only">{ruleId}</code>
    </>
  )
}

function Head({ severity, ruleId, onRule, children }: { severity: Severity; ruleId: string; onRule?: (ruleId: string) => void; children?: ReactNode }) {
  const t = useT()
  return (
    <div className="finding-head">
      <span className={'severity-chip sev-' + severity}>
        <SeverityIcon severity={severity} /> {t('report.severity.' + severity)}
      </span>
      <span className="finding-title">{t(`rule.${ruleId}.title`)}</span>
      {children}
      <RuleId ruleId={ruleId} onRule={onRule} />
    </div>
  )
}

/** one finding: severity chip, where, rule id, message and a labelled fix. Shared by the editor and the report. */
export function FindingCard({ finding: f, line, onLine, lineAction, tabIndex, index, id, onRule }: {
  finding: Finding
  line?: number
  onLine?: () => void
  lineAction?: string
  tabIndex?: number
  index?: number
  /** anchor for the Points lost links */
  id?: string
  onRule?: (ruleId: string) => void
}) {
  const t = useT()
  return (
    <article id={id} className={'finding-card sev-' + f.severity} tabIndex={tabIndex ?? (id ? -1 : undefined)} data-finding={index}>
      <Head severity={f.severity} ruleId={f.ruleId} onRule={onRule}>
        <Where line={line} varName={f.varName} onLine={onLine} lineAction={lineAction} />
      </Head>
      <p className="finding-msg">{t(`rule.${f.ruleId}.msg`, f.params)}</p>
      <p className="finding-fix">
        <strong>{t('report.finding.fix')}:</strong> {t(`rule.${f.ruleId}.fix`, f.params)}
      </p>
    </article>
  )
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
  id,
  onRule,
}: {
  findings: Finding[]
  lineOf: (f: Finding) => number | undefined
  onLine?: (line: number) => void
  lineAction?: (line: number) => string
  id?: string
  onRule?: (ruleId: string) => void
}) {
  const t = useT()
  const number = useNumber()
  const plural = usePlural()
  const { lang } = useContext(LangContext)
  const first = findings[0]
  // a group sentence and fix per rule: the list carries each name, line and rename
  const { msg, fix } = groupTexts(lang, first.ruleId, findings.length)
  const items = findings
    .map((f) => ({ f, line: lineOf(f), text: itemText(f) }))
    .sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
  // a subject that is the same in every item (e.g. the command) says nothing in the list
  const sameText = items.every((i) => i.text === items[0].text)
  return (
    <article id={id} tabIndex={id ? -1 : undefined} className={'finding-card finding-group sev-' + first.severity}>
      <Head severity={first.severity} ruleId={first.ruleId} onRule={onRule}>
        <span className="finding-where">{plural('report.group.count', findings.length)}</span>
      </Head>
      <p className="finding-msg">{msg}</p>
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

/** points each rule family took from one taskbot, largest first; an item with a target scrolls to and focuses its card */
export function PointsLost({ lost, targetOf }: {
  lost: { group: string; points: number; capped: boolean }[]
  /** id of the card or group of that family, when one is shown */
  targetOf?: (group: string) => string | undefined
}) {
  const t = useT()
  const number = useNumber()
  const { lang } = useContext(LangContext)
  if (lost.length === 0) return null
  const go = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ block: 'start' })
    el?.focus({ preventScroll: true })
  }
  return (
    <div className="report-lost">
      <span className="report-lost-label">{t('report.lost')}</span>{' '}
      <ul className={'report-lost-list' + (lost.length > 4 ? ' stacked' : '')}>
        {lost.map((l) => {
          const target = targetOf?.(l.group)
          const body = (
            <>
              <span className="report-lost-title">{groupLabel(lang, l.group)}</span> <code className="report-lost-id">{l.group}</code>{' '}
              <span className="report-lost-points">−{number(l.points)}{l.capped && ` (${t('report.lost.cap')})`}</span>
            </>
          )
          return (
            <li key={l.group}>
              {target ? <button type="button" className="report-lost-link" onClick={() => go(target)}>{body}</button> : body}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
