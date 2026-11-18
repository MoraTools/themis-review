import { useContext, useId, type ReactNode } from 'react'
import type { Finding, Severity } from '../../core/model'
import { SeverityIcon } from '../Icons'
import { LangContext, useNumber, usePlural, useT } from '../i18n'
import { groupLabel, groupTexts, lostTotal, type FixItem, type Lost } from './findings'

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
  // the name starts with the visible text: 'Line 62, open in the editor'
  const name = lineAction && `${label}, ${lineAction}`
  return onLine ? (
    <button type="button" className="finding-where finding-line" aria-label={name} title={name} onClick={onLine}>
      {label}
    </button>
  ) : (
    <span className="finding-where">{label}</span>
  )
}

/** the rule id; with onRule a button to the rule's row in the Rules view. Print hides it: the title names the rule */
function RuleId({ ruleId, onRule }: { ruleId: string; onRule?: (ruleId: string) => void }) {
  const t = useT()
  if (!onRule) return <code className="finding-rule">{ruleId}</code>
  return (
    <button type="button" className="finding-rule finding-rule-link" title={t('report.finding.openRule', { id: ruleId })}
      aria-label={t('report.finding.openRule', { id: ruleId })} onClick={() => onRule(ruleId)}>
      {ruleId}
    </button>
  )
}

/** what a rule family costs, '−15 (cap)'; the card heads and Fix first use it; '(cap)' explains itself on hover */
export function LostPoints({ lost }: { lost: Lost }) {
  const t = useT()
  const number = useNumber()
  return <>−{number(lost.points)}{lost.capped && <> (<abbr title={t('rules.capNote')}>{t('report.lost.cap')}</abbr>)</>}</>
}

/** a Fix first item: taskbot · rule family · −points · −project points; the report and the map show it */
export function FixItemText({ name, item }: { name: string; item: FixItem }) {
  const t = useT()
  const number = useNumber()
  const { lang } = useContext(LangContext)
  // a grid on phones: the name on row 1, the rule and the points (right) on row 2, without separators
  const sep = <span className="report-fix-sep"> · </span>
  return (
    <span className="report-fix-item">
      <span className="report-fix-bot">{name}</span>{sep}<span className="report-lost-title">{groupLabel(lang, item.group)}</span>{sep}
      <span className="report-lost-points"><LostPoints lost={item} /><span className="report-fix-sep"> ·</span> {t('report.fixFirst.project', { points: number(item.project) })}</span>
    </span>
  )
}

/** the rules whose cards show the naming key: their fix is a rename to the convention */
const NAME_KEY_RULES = new Set(['VAR_NAME_FORMAT', 'VAR_TYPE_MISMATCH'])
function NameKey({ ruleId }: { ruleId: string }) {
  const t = useT()
  return NAME_KEY_RULES.has(ruleId) ? <p className="name-key">{t('report.nameKey')}</p> : null
}

/** the card title is a heading: h3 in the report, h2 in the editor dialog (its h1 is the taskbot) */
export type HeadingLevel = 2 | 3

function Head({ severity, ruleId, onRule, points, titleId, level = 3, children }: {
  severity: Severity
  ruleId: string
  titleId: string
  level?: HeadingLevel
  onRule?: (ruleId: string) => void
  /** the family's points: on the first card of the family, and marked inFamily on its later cards */
  points?: Lost & { inFamily?: boolean }
  children?: ReactNode
}) {
  const t = useT()
  const Title = level === 2 ? 'h2' : 'h3'
  return (
    <div className="finding-head">
      <span className={'severity-chip sev-' + severity}>
        <SeverityIcon severity={severity} /> {t('report.severity.' + severity)}
      </span>
      <Title className="finding-title" id={titleId}>{t(`rule.${ruleId}.title`)}</Title>
      {children}
      {points && (
        <span className={'finding-points' + (points.inFamily ? ' in-family' : '')}>
          <span className="sr-only">{t('report.lost.points')}: </span>
          {/* a later card of a family: the family total, marked, so the card does not read as free */}
          {points.inFamily && t('report.lost.inFamily') + ' '}<LostPoints lost={points} />
        </span>
      )}
      <RuleId ruleId={ruleId} onRule={onRule} />
    </div>
  )
}

/** one finding: severity chip, where, rule id, message and a labelled fix. Shared by the editor and the report. */
export function FindingCard({ finding: f, line, onLine, lineAction, tabIndex, index, id, onRule, points, onVar, level }: {
  finding: Finding
  level?: HeadingLevel
  points?: Lost & { inFamily?: boolean }
  /** open the editor on the Variables tab at this variable, for a finding without a line */
  onVar?: (name: string) => void
  line?: number
  onLine?: () => void
  /** what the line button does, after its visible text: 'open in the editor' */
  lineAction?: string
  tabIndex?: number
  index?: number
  /** anchor for the Points lost links */
  id?: string
  onRule?: (ruleId: string) => void
}) {
  const t = useT()
  const autoId = useId()
  const titleId = (id ?? autoId) + '-title'
  return (
    <article id={id} className={'finding-card sev-' + f.severity} tabIndex={tabIndex ?? (id ? -1 : undefined)} data-finding={index} aria-labelledby={titleId}>
      <Head severity={f.severity} ruleId={f.ruleId} onRule={onRule} points={points} titleId={titleId} level={level}>
        <Where line={line} varName={f.varName} onLine={onLine} lineAction={lineAction} onVar={onVar} />
      </Head>
      <p className="finding-msg">{t(`rule.${f.ruleId}.msg`, f.params)}</p>
      <p className="finding-fix">
        <strong>{t('report.finding.fix')}:</strong> {t(`rule.${f.ruleId}.fix`, f.params)}
      </p>
      <NameKey ruleId={f.ruleId} />
    </article>
  )
}

/** what one item of a group names: its variable, path, command or call target, and the new name when there is one */
function itemText(f: Finding): { subject: string; suggestion?: string } {
  const p = f.params
  return { subject: f.varName ?? p.name ?? p.var ?? p.path ?? p.target ?? p.callee ?? p.command ?? '', suggestion: p.suggestion }
}

/** 2 or more findings of one rule in one taskbot: the message and the fix once, then a compact list */
export function FindingGroupCard({
  findings,
  lineOf,
  onLine,
  lineAction,
  id,
  onRule,
  points,
  onVar,
  level,
}: {
  findings: Finding[]
  level?: HeadingLevel
  points?: Lost & { inFamily?: boolean }
  onVar?: (name: string) => void
  lineOf: (f: Finding) => number | undefined
  onLine?: (line: number) => void
  /** what a line button does, after its visible text: 'open in the editor' */
  lineAction?: string
  id?: string
  onRule?: (ruleId: string) => void
}) {
  const t = useT()
  const number = useNumber()
  const plural = usePlural()
  const { lang } = useContext(LangContext)
  const first = findings[0]
  const autoId = useId()
  const titleId = (id ?? autoId) + '-title'
  // a group sentence and fix per rule: the list carries each name, line and rename
  const { msg, fix } = groupTexts(lang, first.ruleId, findings.length)
  const items = findings
    .map((f) => ({ f, line: lineOf(f), ...itemText(f) }))
    .sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
  // a subject that is the same in every item (e.g. the command) says nothing in the list
  const sameText = items.every((i) => i.subject === items[0].subject && i.suggestion === items[0].suggestion)
  // a rename list (old → new): one grid row per item, in columns
  const renames = items.some((i) => i.suggestion)
  return (
    <article id={id} tabIndex={id ? -1 : undefined} className={'finding-card finding-group sev-' + first.severity} aria-labelledby={titleId}>
      <Head severity={first.severity} ruleId={first.ruleId} onRule={onRule} points={points} titleId={titleId} level={level}>
        <span className="finding-where">{plural('report.group.count', findings.length)}</span>
      </Head>
      <p className="finding-msg">{msg}</p>
      <p className="finding-fix">
        <strong>{t('report.finding.fix')}:</strong> {fix}
      </p>
      <NameKey ruleId={first.ruleId} />
      <ul className={'finding-items' + (renames ? ' finding-renames' : '')}>
        {items.map(({ f, line, subject, suggestion }, i) => {
          // the name starts with the visible text: 'L62, open in the editor'
          const lineName = line === undefined || !lineAction ? undefined : `L${number(line)}, ${lineAction}`
          const lineCell = line === undefined ? null : onLine ? (
            <button type="button" className="finding-line" aria-label={lineName} title={lineName} onClick={() => onLine(line)}>
              L{number(line)}
            </button>
          ) : (
            <span>L{number(line)}</span>
          )
          // an item without a line names a variable: it opens the editor at that variable
          const name = line === undefined && f.varName && onVar && !suggestion && subject === f.varName ? <VarName name={subject} onVar={onVar} /> : <code>{subject}</code>
          return (
            <li key={i}>
              {/* the grid keeps an empty line cell, so the names stay in one column */}
              {renames ? <span className="finding-item-line">{lineCell}</span> : lineCell}{' '}
              {!sameText && (
                <span className="finding-item-text">
                  {name}
                  {suggestion && <> → <code className="finding-new">{suggestion}</code></>}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

/** hidden findings of a family, '8 Info, not shown': on screen a button that turns those severities on and goes to
 *  the card, plain text in print */
export function HiddenNote({ text, onShow }: { text: string; onShow?: () => void }) {
  const t = useT()
  if (!onShow) return <span className="report-lost-hidden">{text}</span>
  return (
    <>
      <button type="button" className="report-lost-hidden report-lost-show no-print" title={t('report.lost.showHidden')} onClick={onShow}>{text}</button>
      <span className="report-lost-hidden print-only">{text}</span>
    </>
  )
}

/** the Points lost box opens above 760 px; at 760 px and under it starts closed, where it would push the cards down */
const LOST_CLOSED = '(max-width: 760px)'
export const lostOpenDefault = () => typeof matchMedia === 'undefined' || !matchMedia(LOST_CLOSED).matches

/** points each rule family took from one taskbot, largest first, then their total as a full-width last row; an item
 *  with a target links to its card (a button on screen, an anchor in the PDF), an item whose cards the filter hides
 *  says how many and can show them */
export function PointsLost({ lost, targetOf, hiddenOf, onShowHidden }: {
  lost: Lost[]
  /** id of the card or group of that family, when one is shown */
  targetOf?: (group: string) => string | undefined
  /** the hidden findings of a family as text, e.g. "8 Info, not shown" */
  hiddenOf?: (group: string) => string | undefined
  /** turn the hidden severities of a family on and go to its card */
  onShowHidden?: (group: string) => void
}) {
  const number = useNumber()
  const t = useT()
  const { lang } = useContext(LangContext)
  if (lost.length === 0) return null
  return (
    <div className="report-lost">
      <ul className={'report-lost-list' + (lost.length > 6 ? ' long' : '')}>
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
              {target ? <CardLink target={target}>{body}</CardLink> : <span className="report-lost-row">{body}</span>}
              {hidden && <HiddenNote text={hidden} onShow={onShowHidden && (() => onShowHidden(l.group))} />}
            </li>
          )
        })}
        <li className="report-lost-total">
          <span className="report-lost-row">
            {t('report.lost.total')} <span className="report-lost-points">−{number(lostTotal(lost))}</span>
          </span>
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
