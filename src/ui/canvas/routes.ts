import type { ElkNode } from 'elkjs/lib/elk-api'

export type Point = { x: number; y: number }

/** each laid-out edge as one point list (start, bend points, end), from the ELK edge sections */
export function elkRoutes(result: ElkNode): { id: string; points: Point[] }[] {
  return (result.edges ?? []).flatMap((edge) => {
    const sections = (edge as { sections?: { startPoint: Point; endPoint: Point; bendPoints?: Point[] }[] }).sections
    if (!sections?.length) return []
    const points = sections.flatMap((s, i) => [...(i ? [] : [s.startPoint]), ...(s.bendPoints ?? []), s.endPoint])
    return [{ id: edge.id, points: points.map(({ x, y }) => ({ x, y })) }]
  })
}

/** Fits an orthogonal ELK route to the rendered handles: a node renders shorter or taller than its
 *  layout slot, so a handle can sit off the port. The ends move to the handles and the bend next to
 *  each end takes the handle's cross coordinate, so every segment stays straight. */
export function fitRoute(points: Point[], source: Point, target: Point, vertical: boolean): Point[] {
  const cross = vertical ? 'x' : 'y'
  const main = vertical ? 'y' : 'x'
  if (points.length < 2) return [source, target]
  if (points.length <= 3) {
    if (points.length === 2 && source[cross] === target[cross]) return [source, target]
    // too few bends to move apart: one jog half way (or at the single bend)
    const mid = points.length === 3 ? points[1][main] : (source[main] + target[main]) / 2
    const a = { [main]: mid, [cross]: source[cross] } as Point
    const b = { [main]: mid, [cross]: target[cross] } as Point
    return [source, a, b, target]
  }
  const out = points.map((p) => ({ ...p }))
  out[0] = { ...source }
  out[out.length - 1] = { ...target }
  out[1][cross] = source[cross]
  out[out.length - 2][cross] = target[cross]
  return out
}

/** an SVG path through the points, with corners rounded by up to `radius` */
export function routePath(points: Point[], radius = 8): string {
  if (!points.length) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const [a, p, b] = [points[i - 1], points[i], points[i + 1]]
    const r = Math.min(radius, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2)
    const towards = (q: Point) => {
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
      return { x: p.x + ((q.x - p.x) / len) * r, y: p.y + ((q.y - p.y) / len) * r }
    }
    const [inP, outP] = [towards(a), towards(b)]
    d += ` L ${inP.x} ${inP.y} Q ${p.x} ${p.y} ${outP.x} ${outP.y}`
  }
  const last = points[points.length - 1]
  return d + ` L ${last.x} ${last.y}`
}
