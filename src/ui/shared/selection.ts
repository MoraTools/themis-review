import type { ProjectAnalysis } from '../../core/model'

export type View = 'map' | 'report' | 'rules'

/** the taskbot open in the editor, where it was opened from, and an optional line to show */
export type Selection = { path: string; from: 'map' | 'report'; line?: number }

export type NavState = { view: View; selection: Selection | null }

export type NavAction =
  | { type: 'open'; path: string; from: Selection['from']; line?: number }
  | { type: 'close' }
  | { type: 'view'; view: View }
  | { type: 'reset' }

export const initialNav: NavState = { view: 'map', selection: null }

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'open':
      return { view: action.from, selection: { path: action.path, from: action.from, line: action.line } }
    case 'close':
      // the editor returns to the view it was opened from
      return state.selection ? { view: state.selection.from, selection: null } : state
    case 'view':
      return { ...state, view: action.view }
    case 'reset':
      return initialNav
  }
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
