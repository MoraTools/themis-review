import type { ProjectAnalysis } from '../../core/model'

export type View = 'map' | 'report' | 'rules'

/** the taskbot open in the editor, where it was opened from, and an optional line, variable or rule family to show */
export type Selection = { path: string; from: 'map' | 'report'; line?: number; variable?: string; rule?: string }

/** a request for the map to center and select a node; a new nonce asks again for the same path */
export type MapFocus = { path: string; nonce: number }

export type NavState = { view: View; selection: Selection | null; mapFocus?: MapFocus }

export type NavAction =
  | { type: 'open'; path: string; from: Selection['from']; line?: number; variable?: string; rule?: string }
  | { type: 'close' }
  | { type: 'showOnMap'; path: string }
  | { type: 'view'; view: View }
  | { type: 'reset' }

export const initialNav: NavState = { view: 'map', selection: null }

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'open':
      return { ...state, view: action.from, selection: { path: action.path, from: action.from, line: action.line, variable: action.variable, rule: action.rule } }
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

/** a fresh page has no analysis: drop any editor entry and any view hash but #rules (the rules stand on their own), so it shows the upload view at a clean address */
export function cleanStart(history: HistoryLike, location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const keep = location.hash === '#rules' ? '#rules' : ''
  if (location.hash !== keep || history.state !== null) history.replaceState(null, '', location.pathname + location.search + keep)
}

/** the shell on a fresh page: no analysis, on the view the hash names (the rules, else the upload view) */
export function startShell(hash: string): ShellState {
  return { ...initialShell, nav: { ...initialNav, view: viewFromHash(hash, false) } }
}

/** the address a view tab links to; null for the upload view, which has no hash */
export function tabHref(view: View, hasAnalysis: boolean): string | null {
  return hasAnalysis || view === 'rules' ? '#' + view : null
}

/** a good upload: the map at #map (replace, not push: Back must not return to an upload page with the analysis gone), focus to the view heading */
export function uploaded(
  history: HistoryLike,
  analysis: ProjectAnalysis,
  dispatch: (action: ShellAction) => void,
  focusHeading: { current: boolean },
) {
  history.replaceState(null, '', '#map')
  focusHeading.current = true
  dispatch({ type: 'loaded', analysis })
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

/** document.title names the view only, also with the editor open: browser history keeps titles, and they must not name a taskbot */
export function pageTitle(view: View, hasAnalysis: boolean, t: (key: string) => string): string {
  const label = hasAnalysis || view === 'rules' ? t('tab.' + view) : null
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
