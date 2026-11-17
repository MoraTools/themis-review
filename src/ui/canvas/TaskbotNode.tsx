import { Icon, SeverityIcon } from '../Icons'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useContext } from 'react'
import { Name } from '../shared/Name'
import { Grade } from '../shared/Grade'
import { useNumber, usePlural, useT } from '../i18n'
import { DetailContext, SEVERITIES, STAT_ICONS, typeColor, typeTag, VerticalContext, type TBNodeData } from './nodeTypes'

const SEVERITY_LABEL = { error: 'node.errors', warn: 'node.warnings', info: 'node.infos' } as const

function Var({ name, type, out }: { name: string; type: string; out?: boolean }) {
  const text = name + ': ' + type
  return (
    <div className={'tb-var' + (out ? ' out' : '')} title={text}>
      <span className="sr-only">{text}</span>
      {/* dot, type tag (zoom >= 0.9 only), name; outputs mirror it with row-reverse */}
      <span className="tb-var-label" aria-hidden="true">
        <span className="tb-var-dot" style={{ background: typeColor(type) }} />
        <span className="tb-var-type">{typeTag(type)}</span>
        <span className="tb-var-name">{name}</span>
      </span>
      <Handle
        type={out ? 'source' : 'target'}
        position={out ? Position.Right : Position.Left}
        id={(out ? 'out:' : 'in:') + name}
        className="var-handle"
        style={{ background: typeColor(type) }}
      />
    </div>
  )
}

export default function TaskbotNode({ data }: NodeProps<Node<TBNodeData>>) {
  const t = useT()
  const plural = usePlural()
  const number = useNumber()
  const detailed = useContext(DetailContext)
  const vertical = useContext(VerticalContext)
  const mode = detailed ? '' : ' compact'
  const callIn = <Handle type="target" position={vertical ? Position.Top : Position.Left} id="call-in" className="call-handle" />

  if (data.ghost) {
    return (
      <div className={'tb-node ghost' + mode}>
        {callIn}
        <Name text={data.label} />
        {detailed && <div className="tb-ghost-tag">{t('node.ghost')}</div>}
      </div>
    )
  }

  const m = data.metrics!
  const grade = data.score?.grade
  const chip = data.score && <Grade score={data.score} className="tb-chip" />
  const handles = (
    <>
      {callIn}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} id="call-out" className="call-handle" />
    </>
  )
  // own fixed row, counted in nodeHeight(), so the stats never wrap
  const sevs = data.findingsCount > 0 && (
    <div className="tb-stats tb-sevs">
      {SEVERITIES.map((sev) => {
        const count = data.bySeverity?.[sev] ?? 0
        if (!count) return null
        const label = plural(SEVERITY_LABEL[sev], count)
        return (
          <span key={sev} className={'tb-sev sev-' + sev} role="img" aria-label={label} title={label}>
            <SeverityIcon severity={sev} /> {number(count)}
          </span>
        )
      })}
    </div>
  )

  if (!detailed) {
    return (
      <div className={'tb-node compact' + (grade ? ' g-' + grade : '')}>
        {handles}
        {chip}
        <Name text={data.label} />
        {sevs}
      </div>
    )
  }

  const stat = (key: keyof typeof STAT_ICONS, value: number) => {
    const label = plural('node.' + key, value)
    return (
      <span role="img" aria-label={label} title={label}>
        <Icon name={STAT_ICONS[key]} /> {number(value)}
      </span>
    )
  }

  return (
    <div className={'tb-node' + (grade ? ' g-' + grade : '')}>
      {handles}
      <div className="tb-head">
        <Name text={data.label} />
        {chip}
      </div>
      <div className="tb-stats">
        {stat('lines', m.totalLines)}
        {stat('comments', m.commentLines)}
        {stat('logs', m.logMessages)}
        {stat('vars', m.variables)}
        {m.messageBoxes > 0 && stat('msgbox', m.messageBoxes)}
      </div>
      {sevs}
      <div className="tb-vars">
        <div className="tb-col tb-col-in">
          {data.inputVars.map((v) => (
            <Var key={v.name} name={v.name} type={v.type} />
          ))}
        </div>
        <div className="tb-col tb-col-out">
          {data.wireOutVars.map((v) => (
            <Var key={v.name} name={v.name} type={v.type} out />
          ))}
        </div>
      </div>
    </div>
  )
}
