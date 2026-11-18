import { useContext } from 'react'
import { BaseEdge, getBezierPath, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react'
import { fitRoute, joinPoint, routePath, type Point } from './routes'
import { VerticalContext } from './nodeTypes'

export type RoutedEdgeData = {
  /** the ELK route, start to end */
  points?: Point[]
  /** where the layout put the two nodes; the route holds only while they are still there */
  sourceAt?: Point
  targetAt?: Point
  /** the size of the two layout slots: each edge has its own port, at its place along the slot side */
  sourceSlot?: { width: number; height: number }
  targetSlot?: { width: number; height: number }
  /** the callee has more calls: they share its last stretch, and a dot marks where this one joins it */
  joins?: boolean
}

const at = (a: Point | undefined, b: Point | undefined) => !!a && !!b && a.x === b.x && a.y === b.y

/** a call edge on the route ELK computed, so it goes round other nodes; a bezier once a node was dragged */
export default function RoutedEdge(props: EdgeProps<Edge<RoutedEdgeData>>) {
  const { source, target, sourceX, sourceY, targetX, targetY, data, markerEnd, style, interactionWidth } = props
  const vertical = useContext(VerticalContext)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const from = sourceNode?.internals.positionAbsolute
  const to = targetNode?.internals.positionAbsolute
  const routed = data?.points && at(from, data.sourceAt) && at(to, data.targetAt)
  // the end keeps its port's place along the side, scaled from the layout slot to the rendered node,
  // so the calls of one node keep their own lanes up to the node
  const cross = vertical ? 'x' : 'y'
  const size = vertical ? 'width' : 'height'
  const end = (handle: Point, port: Point, at: Point, slot?: { width: number; height: number }, measured?: { width?: number; height?: number }) => {
    const length = measured?.[size]
    return slot && length ? { ...handle, [cross]: at[cross] + ((port[cross] - at[cross]) / slot[size]) * length } : handle
  }
  const points = routed
    ? fitRoute(
        data.points!,
        end({ x: sourceX, y: sourceY }, data.points![0], from!, data.sourceSlot, sourceNode?.measured),
        end({ x: targetX, y: targetY }, data.points!.at(-1)!, to!, data.targetSlot, targetNode?.measured),
        vertical,
      )
    : null
  const join = points && data?.joins ? joinPoint(points, vertical) : undefined
  return (
    <>
      <BaseEdge id={props.id} path={points ? routePath(points) : getBezierPath(props)[0]} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
      {join && <circle className="edge-junction" cx={join.x} cy={join.y} r={2.5} />}
    </>
  )
}
