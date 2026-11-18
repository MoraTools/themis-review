import { useContext, useId, type ReactNode } from 'react'
import type { Finding, Severity } from '../../core/model'
import { SeverityIcon } from '../Icons'
import { LangContext, useNumber, usePlural, useT } from '../i18n'
import { Figures } from '../shared/Grade'
import { groupTexts, lostLabel, lostTotal, type FixItem, type Lost } from './findings'

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

/** what a rule family costs, '−15 (cap)'; the card heads and Points lost use it. '(cap)' is plain text: the scoring
 *  line in the report facts names the same word */
export function LostPoints({ lost }: { lost: Pick<Lost, 'points' | 'capped'> }) {
  const t = useT()
  const number = useNumber()
  return <><span className="fig">−{number(lost.points)}</span>{lost.capped && ` (${t('report.lost.cap')})`}</>
}

/** a Fix first item: taskbot · rule · +points taskbot · +points project; the report and the map show it. A capped
 *  item says that all findings of its family must be fixed */
export function FixItemText({ name, item }: { name: string; item: FixItem }) {
  const t = useT()
  const number = useNumber()
  const { lang } = useContext(LangContext)
  // no line starts or ends on a separator: each one is glued to its neighbours with no-break spaces, and the values
  // with their leading separator are one nowrap group. At 760 px and under the item is a grid (the name on row 1, the
  // rule and the two values stacked at the right on row 2) with no separators
  const sep = <span className="report-fix-sep">{'\u00a0·\u00a0'}</span>
  return (
    <span className="report-fix-item">
      <span className="report-fix-bot">{name}</span>{sep}<span className="report-lost-title">{lostLabel(lang, item)}</span>
      <span className="report-lost-points">
        {sep}
        <span className="report-fix-value"><Figures text={t('report.fixFirst.bot', { points: number(item.points) })} />{item.capped && <> ({<Figures text={t('report.fixFirst.all', { n: number(item.count) })} />})</>}</span>
        <span className="report-fix-vsep"> · </span>
        <span className="report-fix-value"><Figures text={t('report.fixFirst.project', { points: number(item.project) })} /></span>
      </span>
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
  // a rename list puts the declared but unused variables (no line) last, under their own caption
  const isUnused = (i: (typeof items)[number]) => renames && i.line === undefined && !!i.f.varName
  const used = items.filter((i) => !isUnused(i))
  const unused = items.filter(isUnused)
  const item = ({ f, line, subject, suggestion }: (typeof items)[number], i: number) => {
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
    const name = line === undefined && f.varName && onVar ? <VarName name={subject} onVar={onVar} /> : <code>{subject}</code>
    return (
      <li key={i}>
        {/* the grid line cell: a muted dash when there is no line, so the names stay in one column */}
        {renames ? <span className="finding-item-line">{lineCell ?? <span className="finding-no-line" aria-hidden="true">—</span>}</span> : lineCell}{' '}
        {!sameText && (
          <span className="finding-item-text">
            {name}
            {suggestion && <> → <code className="finding-new">{suggestion}</code></>}
          </span>
        )}
      </li>
    )
  }
  return (
    <article id={id} tabIndex={id ? -1 : undefined} className={'finding-card finding-group sev-' + first.severity} aria-labelledby={titleId}>
      <Head severity={first.severity} ruleId={first.ruleId} onRule={onRule} points={points} titleId={titleId} level={level}>
        <span className="finding-where finding-count"><Figures text={plural('report.group.count', findings.length)} /></span>
      </Head>
      {/* message and fix stay together on paper */}
      <div className="finding-texts">
        <p className="finding-msg">{msg}</p>
        <p className="finding-fix">
          <strong>{t('report.finding.fix')}:</strong> {fix}
        </p>
      </div>
      <NameKey ruleId={first.ruleId} />
      {used.length > 0 && <ul className={'finding-items' + (renames ? ' finding-renames' : '')}>{used.map(item)}</ul>}
      {unused.length > 0 && (
        <>
          <p className="finding-items-caption">{t('report.group.unused')}</p>
          <ul className="finding-items finding-renames">{unused.map(item)}</ul>
        </>
      )}
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
  const largest = Math.max(...lost.map((l) => l.points))
  return (
    <div className="report-lost">
      <ul className={'report-lost-list' + (lost.length > 6 ? ' long' : '')}>
        {lost.map((l) => {
          const target = targetOf?.(l.group)
          const hidden = hiddenOf?.(l.group)
          // one line per row: title, the hidden note, the bar track and the points. A row that links to its card
          // holds the note as text (no button inside a button); a row whose cards are all hidden holds its button
          const body = (
            <>
              <span className="report-lost-title">{lostLabel(lang, l)}</span>
              {hidden && (target ? <span className="report-lost-hidden">{hidden}</span> : <HiddenNote text={hidden} onShow={onShowHidden && (() => onShowHidden(l.group))} />)}
              {/* the row's share of the largest row, right-anchored to its figure; the figure says the same */}
              <span className="report-lost-track" aria-hidden="true">
                <span className="report-lost-bar" style={{ width: `${(largest > 0 ? l.points / largest : 0) * 100}%` }} />
              </span>
              <span className="report-lost-points"><LostPoints lost={l} /></span>
            </>
          )
          return <li key={l.group}>{target ? <CardLink target={target}>{body}</CardLink> : <span className="report-lost-row">{body}</span>}</li>
        })}
        <li className="report-lost-total">
          <span className="report-lost-row">
            {t('report.lost.total')} <span className="report-lost-points fig">−{number(lostTotal(lost))}</span>
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
