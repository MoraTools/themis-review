import type { Severity } from '../../core/model'
import { SeverityIcon } from '../Icons'
import { useNumber, useT } from '../i18n'
import type { ShellAction } from '../shared/selection'
import { SEVERITIES } from './findings'

export type SeverityOn = Record<Severity, boolean>

/** info findings are noise in a printed report; opt in when you want the full list */
export const DEFAULT_SEVERITY_ON: SeverityOn = { error: true, warn: true, info: false }

export type SeverityFilterAction = ShellAction | { type: 'severity'; severity: Severity }

/** the report filter lives in the shell: view switches and the editor keep it, a new analysis starts it again */
export function severityFilterReducer(state: SeverityOn, action: SeverityFilterAction): SeverityOn {
  switch (action.type) {
    case 'severity':
      return { ...state, [action.severity]: !state[action.severity] }
    case 'loaded':
      return DEFAULT_SEVERITY_ON
    default:
      return state
  }
}

/** multi-select severity chips: a fieldset whose legend is the label, then one hidden checkbox per severity with its count */
export function SeverityFilter({ label, counts, on, onToggle }: {
  label: string
  counts: Record<Severity, number>
  on: SeverityOn
  onToggle: (severity: Severity) => void
}) {
  const t = useT()
  const number = useNumber()
  return (
    <fieldset className="sev-filter">
      <legend className="report-options-label">{label}</legend>
      {SEVERITIES.map((sev) => {
        // a severity with no finding has nothing to show or hide: disabled, never checked or 'on' (the state keeps it)
        const empty = counts[sev] === 0
        const checked = on[sev] && !empty
        return (
          <label key={sev} className={'sev-toggle sev-' + sev + (checked ? ' on' : '') + (empty ? ' disabled' : '')}>
            <input type="checkbox" checked={checked} disabled={empty} onChange={() => onToggle(sev)} />
            <SeverityIcon severity={sev} /> {t('report.severity.' + sev)} ({number(counts[sev])})
          </label>
        )
      })}
    </fieldset>
  )
}
