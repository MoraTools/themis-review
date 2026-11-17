import { Fragment } from 'react'

/** allow line breaks after underscores and at camelCase boundaries, so long names wrap between words */
export function Name({ text, className = 'tb-title', id }: { text: string; className?: string; id?: string }) {
  return (
    <span className={className} id={id}>
      {text.split(/(?<=_)|(?<=[a-z0-9])(?=[A-Z])/).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </span>
  )
}
