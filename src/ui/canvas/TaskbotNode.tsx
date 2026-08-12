import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useContext } from 'react'
import { useT } from '../i18n'
import { DetailContext, typeColor, type TBNodeData } from './nodeTypes'

export default function TaskbotNode({ data }: NodeProps<Node<TBNodeData>>) {
  const t = useT()
  const detailed = useContext(DetailContext)

  if (data.ghost) {
    return (
      <div className="tb-node ghost">
        <Handle type="target" position={Position.Left} id="call-in" className="call-handle" />
        <div className="tb-title">{data.label}</div>
        <div className="tb-ghost-tag">{t('node.ghost')}</div>
      </div>
    )
  }

  const m = data.metrics!
  return (
    <div className="tb-node">
      <Handle type="target" position={Position.Left} id="call-in" className="call-handle" />
      <Handle type="source" position={Position.Right} id="call-out" className="call-handle" />
      <div className="tb-head">
        <span className="tb-title">{data.label}</span>
        {data.score && <span className={'tb-grade grade-' + data.score.grade}>{data.score.grade}</span>}
      </div>
      <div className="tb-stats">
        <span title={t('node.lines')}>📄 {m.totalLines}</span>
        <span title={t('node.comments')}>💬 {m.commentLines}</span>
        <span title={t('node.logs')}>📝 {m.logMessages}</span>
        <span title={t('node.vars')}>🔡 {m.variables}</span>
        {m.messageBoxes > 0 && (
          <span className="tb-warn" title={t('node.msgbox')}>
            ⚠ {m.messageBoxes}
          </span>
        )}
        {data.findingsCount > 0 && <span className="tb-findings">● {data.findingsCount}</span>}
      </div>
      {detailed && (
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
      )}
    </div>
  )
}
