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
