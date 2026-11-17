import { Icon } from '../Icons'

export type Sort<C extends string> = { col: C; dir: 1 | -1 }

/** a sortable column header; keep it at module scope, a component defined in render would remount every <th> */
export function SortHeader<C extends string>({ col, label, sort, onSort, className = '' }: {
  col: C
  label: string
  sort: Sort<C>
  onSort: (c: C) => void
  className?: string
}) {
  const active = sort.col === col
  return (
    <th className={'sortable ' + className + (active ? ' sorted' : '')} aria-sort={active ? sort.dir === 1 ? 'ascending' : 'descending' : 'none'}>
      <button type="button" onClick={() => onSort(col)}>{label}
      {active && <Icon name={sort.dir === 1 ? 'arrow-up' : 'arrow-down'} className="sort-icon" />}</button>
    </th>
  )
}

/** a click on the sorted column flips it; another column starts ascending */
export function nextSort<C extends string>(s: Sort<C>, col: C): Sort<C> {
  return { col, dir: s.col === col && s.dir === 1 ? -1 : 1 }
}
