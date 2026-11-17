import { useContext, type ReactNode } from 'react'
import type { Finding, Severity } from '../../core/model'
import { SeverityIcon } from '../Icons'
import { LangContext, useNumber, usePlural, useT } from '../i18n'
import { groupLabel, groupTexts, lostTotal, type Lost } from './findings'

/** a variable name; with onVar a screen-only button that opens the editor on the Variables tab, plain text in print */
function VarName({ name, onVar, className }: { name: string; onVar?: (name: string) => void; className?: string }) {
  const t = useT()
  if (!onVar) return <code className={className}>{name}</code>
  const label = t('report.finding.openVar', { name })
  return (
    <>
      <button type="button" className={(className ? className + ' ' : '') + 'finding-var no-print'} aria-label={label} title={label} onClick={() => onVar(name)}>
        <code>{name}</code>
      </button>
      <code className={(className ? className + ' ' : '') + 'print-only'}>{name}</code>
    </>
  )
}

/** the place a finding cites: "Line N" (a button when it can be opened), else the variable name */
function Where({ line, varName, onLine, lineAction, onVar }: { line?: number; varName?: string; onLine?: () => void; lineAction?: string; onVar?: (name: string) => void }) {
  const t = useT()
  const number = useNumber()
  if (line === undefined) return varName ? <VarName name={varName} onVar={onVar} className="finding-where" /> : null
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

/** what a rule family costs, '−15 (cap)'; the card heads and Fix first use it */
export function LostPoints({ lost }: { lost: Lost }) {
  const t = useT()
  const number = useNumber()
  return <>−{number(lost.points)}{lost.capped && ` (${t('report.lost.cap')})`}</>
}

function Head({ severity, ruleId, onRule, points, children }: {
  severity: Severity
  ruleId: string
  onRule?: (ruleId: string) => void
  /** the family's points, on the first card of the family */
  points?: Lost
  children?: ReactNode
}) {
  const t = useT()
  return (
    <div className="finding-head">
      <span className={'severity-chip sev-' + severity}>
        <SeverityIcon severity={severity} /> {t('report.severity.' + severity)}
      </span>
      <span className="finding-title">{t(`rule.${ruleId}.title`)}</span>
      {children}
      {points && (
        <span className="finding-points">
          <span className="sr-only">{t('report.lost.points')}: </span><LostPoints lost={points} />
        </span>
      )}
      <RuleId ruleId={ruleId} onRule={onRule} />
    </div>
  )
}

/** one finding: severity chip, where, rule id, message and a labelled fix. Shared by the editor and the report. */
export function FindingCard({ finding: f, line, onLine, lineAction, tabIndex, index, id, onRule, points, onVar }: {
  finding: Finding
  points?: Lost
  /** open the editor on the Variables tab at this variable, for a finding without a line */
  onVar?: (name: string) => void
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
      <Head severity={f.severity} ruleId={f.ruleId} onRule={onRule} points={points}>
        <Where line={line} varName={f.varName} onLine={onLine} lineAction={lineAction} onVar={onVar} />
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
  points,
  onVar,
}: {
  findings: Finding[]
  points?: Lost
  onVar?: (name: string) => void
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
      <Head severity={first.severity} ruleId={first.ruleId} onRule={onRule} points={points}>
        <span className="finding-where">{plural('report.group.count', findings.length)}</span>
      </Head>
      <p className="finding-msg">{msg}</p>
      <p className="finding-fix">
        <strong>{t('report.finding.fix')}:</strong> {fix}
      </p>
      <ul className="finding-items">
        {items.map(({ f, line, text }, i) => {
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
              {/* an item without a line names a variable: it opens the editor at that variable */}
              {!sameText && (line === undefined && f.varName && onVar && text === f.varName ? <VarName name={text} onVar={onVar} /> : <code>{text}</code>)}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

/** points each rule family took from one taskbot, largest first, then their total; an item with a target scrolls
 *  to and focuses its card, an item whose cards the filter hides says so */
export function PointsLost({ lost, targetOf, hiddenOf, stacked, label = true }: {
  lost: Lost[]
  /** id of the card or group of that family, when one is shown */
  targetOf?: (group: string) => string | undefined
  /** the severity names of a family's findings that the filter hides, e.g. "Info" */
  hiddenOf?: (group: string) => string | undefined
  /** one rule per line; else inline up to 4 items */
  stacked?: boolean
  /** false when a <summary> already says "Points lost" */
  label?: boolean
}) {
  const t = useT()
  const number = useNumber()
  const { lang } = useContext(LangContext)
  if (lost.length === 0) return null
  return (
    <div className="report-lost">
      {label && <><span className="report-lost-label">{t('report.lost')}</span>{' '}</>}
      <ul className={'report-lost-list' + (stacked || lost.length > 4 ? ' stacked' : '')}>
        {lost.map((l) => {
          const target = targetOf?.(l.group)
          const hidden = target ? undefined : hiddenOf?.(l.group)
          const body = (
            <>
              <span className="report-lost-title">{groupLabel(lang, l.group)}</span>{' '}
              <span className="report-lost-points"><LostPoints lost={l} /></span>
            </>
          )
          return (
            <li key={l.group}>
              {target ? <button type="button" className="report-lost-link" onClick={() => goToCard(target)}>{body}</button> : body}
              {hidden && <> <span className="report-lost-hidden">{t('report.lost.hidden', { list: hidden })}</span></>}
            </li>
          )
        })}
        <li className="report-lost-total">
          {t('report.lost.total')} <span className="report-lost-points">−{number(lostTotal(lost))}</span>
        </li>
      </ul>
    </div>
  )
}

/** scroll to a card and focus it */
export function goToCard(id: string) {
  const el = document.getElementById(id)
  el?.scrollIntoView({ block: 'start' })
  el?.focus({ preventScroll: true })
}

/** a link to a card: a button on screen, an anchor in the PDF */
export function CardLink({ target, children }: { target: string; children: ReactNode }) {
  return (
    <>
      <button type="button" className="report-lost-link no-print" onClick={() => goToCard(target)}>{children}</button>
      <a className="print-only card-anchor" href={'#' + target}>{children}</a>
    </>
  )
}
