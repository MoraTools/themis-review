import type { ProjectAnalysis } from '../../core/model'

export type View = 'map' | 'report' | 'rules'

/** the taskbot open in the editor, where it was opened from, and an optional line to show */
export type Selection = { path: string; from: 'map' | 'report'; line?: number }

/** a request for the map to center and select a node; a new nonce asks again for the same path */
export type MapFocus = { path: string; nonce: number }

export type NavState = { view: View; selection: Selection | null; mapFocus?: MapFocus }

export type NavAction =
  | { type: 'open'; path: string; from: Selection['from']; line?: number }
  | { type: 'close' }
  | { type: 'showOnMap'; path: string }
  | { type: 'view'; view: View }
  | { type: 'reset' }

export const initialNav: NavState = { view: 'map', selection: null }

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'open':
      return { ...state, view: action.from, selection: { path: action.path, from: action.from, line: action.line } }
    case 'close':
      // the editor returns to the view it was opened from
      return state.selection ? { ...state, view: state.selection.from, selection: null } : state
    case 'showOnMap':
      return { view: 'map', selection: null, mapFocus: { path: action.path, nonce: (state.mapFocus?.nonce ?? 0) + 1 } }
    case 'view':
      return { ...state, view: action.view }
    case 'reset':
      return initialNav
  }
}

/** the view a location hash names; without an analysis only the rules stand on their own (else the upload view, 'map') */
export function viewFromHash(hash: string, hasAnalysis: boolean): View {
  const name = hash.replace(/^#/, '')
  if (name === 'rules') return 'rules'
  return hasAnalysis && name === 'report' ? 'report' : 'map'
}

/** the history calls the shell uses, so tests can pass a fake */
export type HistoryLike = Pick<History, 'state' | 'pushState' | 'replaceState' | 'back'>

/** a fresh page has no analysis: drop any view hash and editor entry, so it shows the upload view at a clean address */
export function cleanStart(history: HistoryLike, location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  if (location.hash || history.state !== null) history.replaceState(null, '', location.pathname + location.search)
}

/** the editor selection kept in a history entry's state (never in the URL), or null */
export function editorEntry(state: unknown): Selection | null {
  const entry = (state as { editor?: Selection } | null)?.editor
  return entry && typeof entry.path === 'string' ? entry : null
}

/** opening the editor adds one history entry with the same URL, so Back closes it */
export function pushEditor(history: HistoryLike, selection: Selection) {
  history.pushState({ editor: selection }, '')
}

/** Close and Escape go back when the entry is ours (popstate then closes), so history does not grow per open */
export function closeEditor(history: HistoryLike, closeNow: () => void) {
  if (editorEntry(history.state)) history.back()
  else closeNow()
}

/** document.title per view; an open editor names its taskbot */
export function pageTitle(view: View, hasAnalysis: boolean, t: (key: string) => string, botName?: string): string {
  const label = botName ?? (hasAnalysis || view === 'rules' ? t('tab.' + view) : null)
  return label ? `${label} · Themis Review` : 'Themis Review'
}

/** the loaded analysis and the navigation over it */
export type ShellState = { analysis: ProjectAnalysis | null; nav: NavState }

export type ShellAction = NavAction | { type: 'loaded'; analysis: ProjectAnalysis } | { type: 'failed' }

export const initialShell: ShellState = { analysis: null, nav: initialNav }

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'loaded':
      // a new analysis replaces the old one and drops its selection and origin
      return { analysis: action.analysis, nav: navReducer(state.nav, { type: 'reset' }) }
    case 'failed':
      // a failed upload keeps the current analysis, view and selection
      return state
    default: {
      const nav = navReducer(state.nav, action)
      return nav === state.nav ? state : { ...state, nav }
    }
  }
}
