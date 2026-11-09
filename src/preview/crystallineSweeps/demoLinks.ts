/**
 * Example connections for the preview drill-down.
 * Names come from the catalog and the existing preview graphs.
 * This is not a saved technique tree.
 */

export const DEMO_CONNECTION_NOTE = 'Example connections. Not a saved technique tree.'

export type SideRole = 'left' | 'base' | 'right'

export type DemoSides = { left: string | null; base: string | null; right: string | null }

/** Outgoing side, in the order the owner asked for when they named one. */
const SIDES: Record<string, Partial<DemoSides>> = {
  'Closed guard': { left: 'Scissor sweep', base: 'Hip bump sweep', right: 'Flower sweep' },
  'Scissor sweep': { left: 'Mount', right: 'Closed guard' },
  'Hip bump sweep': { left: 'Mount', base: 'Hip bump to kimura', right: 'Closed guard' },
  'Flower sweep': { left: 'Mount', right: 'Closed guard' },
  'Pendulum sweep': { left: 'Armbar', base: 'Mount', right: 'Armbar from guard' },
  Mount: { left: 'Armbar', base: 'Cross collar choke', right: 'Americana' },
  Armbar: { left: 'Wrist lock', right: 'Triangle choke' },
  'X-guard': { left: 'Elevator sweep' },
  'Elevator sweep': { left: 'Back control', right: 'X-guard' },
  'Back control': { left: 'Rear naked choke', right: 'Elevator sweep' },
}

const EXTRA_INCOMING: Record<string, string[]> = {
  Mount: ['Scissor sweep', 'Hip bump sweep', 'Flower sweep', 'Pendulum sweep'],
}

export type DemoCard = {
  outgoing: string[]
  incoming: string[]
  sides: DemoSides
  more: string[]
}

export function demoCard(name: string): DemoCard {
  const specified = SIDES[name] ?? {}
  const sides: DemoSides = {
    left: specified.left ?? null,
    base: specified.base ?? null,
    right: specified.right ?? null,
  }
  const outgoing = [sides.left, sides.base, sides.right].filter((item): item is string => Boolean(item))
  const incoming = new Set<string>(EXTRA_INCOMING[name] ?? [])
  for (const [from, row] of Object.entries(SIDES)) {
    if (from === name) continue
    if (row.left === name || row.base === name || row.right === name) incoming.add(from)
  }
  const onSide = new Set(outgoing)
  const more = [...incoming].filter((item) => !onSide.has(item))
  return { outgoing, incoming: [...incoming], sides, more }
}

/** Fill an empty side with the step we came from, when that step is not already showing. */
export function sidesWithBack(name: string, parent: string | null): DemoSides {
  const sides = { ...demoCard(name).sides }
  const used = new Set([sides.left, sides.base, sides.right].filter(Boolean))
  if (parent && !used.has(parent)) {
    const empty = (['base', 'left', 'right'] as const).find((role) => !sides[role])
    if (empty) sides[empty] = parent
  }
  return sides
}

/** Catalog row when the example label is the owner's longer name. */
export function catalogNameFor(name: string): string | null {
  if (name === 'Triangle choke') return 'Triangle'
  return null
}

export const DRILL_LIMIT = 8

/** Local example names: specified sides first, then incoming names that are not already a side. */
export function localNames(name: string, parent: string | null): string[] {
  const sides = sidesWithBack(name, parent)
  const ordered = [sides.left, sides.base, sides.right].filter((item): item is string => Boolean(item))
  const extras = demoCard(name).more.filter((item) => !ordered.includes(item))
  return [...ordered, ...extras]
}

export type DrillLayout =
  | { mode: 'edges'; sides: DemoSides; names: string[] }
  | { mode: 'grid'; n: number; names: string[]; blanks: number }

/** Three sides when there are at most three local connections. Otherwise the face grid, ⌈√k⌉². */
export function connectionLayout(name: string, parent: string | null): DrillLayout {
  const sides = { ...sidesWithBack(name, parent) }
  const names = localNames(name, parent)
  if (names.length <= 3) {
    const extras = names.filter((item) => item !== sides.left && item !== sides.base && item !== sides.right)
    for (const extra of extras) {
      const empty = (['base', 'left', 'right'] as const).find((role) => !sides[role])
      if (empty) sides[empty] = extra
    }
    return { mode: 'edges', sides, names }
  }
  const n = Math.ceil(Math.sqrt(names.length))
  return { mode: 'grid', n, names, blanks: n * n - names.length }
}

export function gridCells(count: number): number | null {
  if (count <= 3) return null
  const n = Math.ceil(Math.sqrt(count))
  return n * n
}

/** Same barycentric split the factor faces use. n² triangles. */
export function subdivideTriangle<T extends [number, number, number]>(corners: [T, T, T], n: number): [T, T, T][] {
  const [a, b, c] = corners
  const mix = (p: T, q: T, t: number): T => p.map((value, index) => value + (q[index] - value) * t) as T
  const pointAt = (i: number, j: number): T => {
    const left = mix(a, b, i / n)
    const right = mix(a, c, i / n)
    return i ? mix(left, right, j / i) : a
  }
  const list: [T, T, T][] = []
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      list.push([pointAt(i, j), pointAt(i + 1, j), pointAt(i + 1, j + 1)])
      if (j < i) list.push([pointAt(i, j), pointAt(i + 1, j + 1), pointAt(i, j + 1)])
    }
  }
  return list
}

/** Nearest tiles get the names, then those tiles are ordered around the triangle. Leftovers stay empty. */
export function assignDrillCells<T extends [number, number, number]>(
  corners: [T, T, T],
  names: readonly string[],
): { name: string | null; corners: [T, T, T] }[] {
  const n = Math.max(1, Math.ceil(Math.sqrt(Math.max(names.length, 1))))
  const tris = subdivideTriangle(corners, names.length <= 3 ? 1 : n)
  if (names.length <= 3) return [{ name: names[0] ?? null, corners: tris[0] ?? corners }]
  const centroid = [0, 1, 2].map((axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3)
  const ranked = tris.map((tri, index) => {
    const mid = [0, 1, 2].map((axis) => (tri[0][axis] + tri[1][axis] + tri[2][axis]) / 3)
    return {
      index,
      tri,
      distance: Math.hypot(mid[0] - centroid[0], mid[1] - centroid[1], mid[2] - centroid[2]),
      angle: Math.atan2(mid[1] - centroid[1], mid[0] - centroid[0]),
    }
  })
  const chosen = [...ranked].sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, names.length)
  chosen.sort((a, b) => a.angle - b.angle || a.index - b.index)
  const nameAt = new Map(chosen.map((row, index) => [row.index, names[index] ?? null]))
  return tris.map((tri, index) => ({ name: nameAt.get(index) ?? null, corners: tri }))
}

/** A label is drawn only when the tile is wide enough to hold it. */
export function labelVisible(box: { w: number; h: number }, text: string): boolean {
  const needed = Math.min(120, Math.max(44, text.length * 6.5))
  return box.w >= needed && box.h >= 28
}

/** Walk example sides one step at a time. Each step must be a side of the previous name. */
export function walkDemo(start: string, steps: readonly string[]): { name: string; parent: string | null; sides: DemoSides }[] {
  const trail: { name: string; parent: string | null; sides: DemoSides }[] = [
    { name: start, parent: null, sides: sidesWithBack(start, null) },
  ]
  let name = start
  let parent: string | null = null
  for (const next of steps) {
    if (trail.length >= DRILL_LIMIT) break
    const sides = sidesWithBack(name, parent)
    const linked = sides.left === next || sides.base === next || sides.right === next
    if (!linked) break
    parent = name
    name = next
    trail.push({ name, parent, sides: sidesWithBack(name, parent) })
  }
  return trail
}

export function screenSides(tri: [[number, number], [number, number], [number, number]]): { role: SideRole; edge: 0 | 1 | 2 }[] {
  const edges = [0, 1, 2].map((edge) => {
    const a = tri[edge]
    const b = tri[(edge + 1) % 3]
    return { edge: edge as 0 | 1 | 2, midX: (a[0] + b[0]) / 2, midY: (a[1] + b[1]) / 2 }
  })
  const base = [...edges].sort((a, b) => b.midY - a.midY || a.edge - b.edge)[0]
  const rest = edges.filter((edge) => edge.edge !== base.edge).sort((a, b) => a.midX - b.midX)
  return [
    { role: 'left', edge: rest[0].edge },
    { role: 'right', edge: rest[1].edge },
    { role: 'base', edge: base.edge },
  ]
}

export function growOffEdge<T extends [number, number, number]>(corners: [T, T, T], edge: 0 | 1 | 2): [T, T, T] {
  const a = corners[edge]
  const b = corners[(edge + 1) % 3]
  const c = corners[(edge + 2) % 3]
  const grown = [a[0] + b[0] - c[0], a[1] + b[1] - c[1], a[2] + b[2] - c[2]] as T
  return [a, b, grown]
}

export function classifyTap(input: {
  pinching: boolean
  moved: boolean
  edge: number | null
  edgeHasLink: boolean
  sameTile: boolean
  elapsedMs: number
}): 'ignore' | 'edge' | 'double' | 'single' {
  if (input.pinching || input.moved) return 'ignore'
  if (input.sameTile && input.edge != null && input.edgeHasLink) return 'edge'
  if (input.sameTile && input.edge == null && input.elapsedMs >= 0 && input.elapsedMs < 400) return 'double'
  return 'single'
}

export function pointToSegment(point: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length))
  const x = a[0] + t * dx
  const y = a[1] + t * dy
  return Math.hypot(point[0] - x, point[1] - y)
}
