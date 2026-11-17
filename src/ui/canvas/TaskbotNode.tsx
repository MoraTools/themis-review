import { Icon, SeverityIcon } from '../Icons'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useContext } from 'react'
import { Name } from '../shared/Name'
import { useT, useNumber } from '../i18n'
import { DetailContext, SEVERITIES, STAT_ICONS, typeColor, type TBNodeData } from './nodeTypes'

const SEVERITY_LABEL = { error: 'node.errors', warn: 'node.warnings', info: 'node.infos' } as const

export default function TaskbotNode({ data }: NodeProps<Node<TBNodeData>>) {
  const t = useT()
  const number = useNumber()
  const detailed = useContext(DetailContext)
  const mode = detailed ? '' : ' compact'

  if (data.ghost) {
    return (
      <div className={'tb-node ghost' + mode}>
        <Handle type="target" position={Position.Left} id="call-in" className="call-handle" />
        <Name text={data.label} />
        {detailed && <div className="tb-ghost-tag">{t('node.ghost')}</div>}
      </div>
    )
  }

  const m = data.metrics!
  const grade = data.score?.grade
  const chip = data.score && (
    <span className={'tb-chip grade-' + data.score.grade}>
      {data.score.grade} {number(data.score.score)}
    </span>
  )
  const handles = (
    <>
      <Handle type="target" position={Position.Left} id="call-in" className="call-handle" />
      <Handle type="source" position={Position.Right} id="call-out" className="call-handle" />
    </>
  )

  if (!detailed) {
    return (
      <div className={'tb-node compact' + (grade ? ' g-' + grade : '')}>
        {handles}
        {chip}
        <Name text={data.label} />
      </div>
    )
  }

  const stat = (key: keyof typeof STAT_ICONS, value: number) => {
    const label = t('node.stat', { name: t('node.' + key), n: number(value) })
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
      {/* own fixed row, counted in nodeHeight(), so the stats never wrap */}
      {data.findingsCount > 0 && (
        <div className="tb-stats tb-sevs">
          {SEVERITIES.map((sev) => {
            const count = data.bySeverity?.[sev] ?? 0
            if (!count) return null
            const label = t('node.stat', { name: t(SEVERITY_LABEL[sev]), n: number(count) })
            return (
              <span key={sev} className={'tb-sev sev-' + sev} role="img" aria-label={label} title={label}>
                <SeverityIcon severity={sev} /> {number(count)}
              </span>
            )
          })}
        </div>
      )}
      <div className="tb-vars">
        <div className="tb-col tb-col-in">
          {data.inputVars.map((v) => (
            <div className="tb-var" key={v.name}>
              <Handle
                type="target"
                position={Position.Left}
                id={'in:' + v.name}
                className="var-handle"
                style={{ background: typeColor(v.type) }}
              />
              <span className="tb-var-dot" style={{ background: typeColor(v.type) }} />
              <span className="tb-var-name">{v.name}</span>
            </div>
          ))}
        </div>
        <div className="tb-col tb-col-out">
          {data.wireOutVars.map((v) => (
            <div className="tb-var out" key={v.name}>
              <span className="tb-var-name">{v.name}</span>
              <span className="tb-var-dot" style={{ background: typeColor(v.type) }} />
              <Handle
                type="source"
                position={Position.Right}
                id={'out:' + v.name}
                className="var-handle"
                style={{ background: typeColor(v.type) }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
