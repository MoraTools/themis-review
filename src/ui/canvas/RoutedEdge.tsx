import { useContext } from 'react'
import { BaseEdge, getBezierPath, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react'
import { fitRoute, routePath, type Point } from './routes'
import { VerticalContext } from './nodeTypes'

export type RoutedEdgeData = {
  /** the ELK route, start to end */
  points?: Point[]
  /** where the layout put the two nodes; the route holds only while they are still there */
  sourceAt?: Point
  targetAt?: Point
}

const at = (a: Point | undefined, b: Point | undefined) => !!a && !!b && a.x === b.x && a.y === b.y

/** a call edge on the route ELK computed, so it goes round other nodes; a bezier once a node was dragged */
export default function RoutedEdge(props: EdgeProps<Edge<RoutedEdgeData>>) {
  const { source, target, sourceX, sourceY, targetX, targetY, data, markerEnd, style, interactionWidth } = props
  const vertical = useContext(VerticalContext)
  const from = useInternalNode(source)?.internals.positionAbsolute
  const to = useInternalNode(target)?.internals.positionAbsolute
  const routed = data?.points && at(from, data.sourceAt) && at(to, data.targetAt)
  const path = routed
    ? routePath(fitRoute(data.points!, { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, vertical))
    : getBezierPath(props)[0]
  return <BaseEdge id={props.id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
}
