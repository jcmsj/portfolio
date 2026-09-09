import { getFootprint } from './archetypes'
import { mulberry32, pick, randRange } from './util'
import type { CityData } from '@/city/load'

/**
 * Deterministic prop placement shared by the visual Props layer and
 * WalkControls collisions. When city.props is empty the same mulberry32(1337)
 * scatter fills the island; explicit props override it 1:1.
 */

export type PropKind = 'tree' | 'pine' | 'lamp' | 'bench' | 'hydrant'

const COUNTS: Record<PropKind, number> = {
  tree: 45,
  pine: 18,
  lamp: 26,
  bench: 5,
  hydrant: 4,
}

const GREENS = ['#6fae5f', '#7fae66', '#5f9e52', '#8fbb70', '#679a54'] as const
const PINE_GREENS = ['#3f7a52', '#356b47', '#467f55'] as const

const ISLAND_MIN = 14 // stay off the plaza + its lamps
const ISLAND_MAX = 79 // stay off the sand rim
const ROAD_CLEAR = 4

/**
 * Final walk-collision radii (world units), already including ~0.4 player
 * capsule clearance. Trees block on the trunk only — you can walk under canopy.
 */
export const PROP_OBSTACLE_R: Record<PropKind, number> = {
  tree: 0.75,
  pine: 0.7,
  lamp: 0.4,
  bench: 1.0,
  hydrant: 0.35,
}

export interface Spot {
  x: number
  z: number
  ry: number
  s: number
  c: string
}

export interface Obstacle {
  x: number
  z: number
  r: number
}

interface Circle {
  x: number
  z: number
  r: number
}

interface Segment {
  ax: number
  az: number
  bx: number
  bz: number
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax
  const abz = bz - az
  const lenSq = abx * abx + abz * abz
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq)) : 0
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

function collectObstacles(city: CityData): { circles: Circle[]; roads: Segment[] } {
  const circles: Circle[] = city.places.map((p) => ({
    x: p.position[0],
    z: p.position[1],
    r: getFootprint(p.building).radius * p.scale + 2.5,
  }))
  for (const zone of city.zones) {
    circles.push({ x: zone.position[0], z: zone.position[1], r: zone.radius + 2.5 })
  }
  // Same road spans Zones.tsx draws: radius 13 out to (dist - zone.radius - 2).
  const roads: Segment[] = []
  const [px, pz] = city.plaza.position
  for (const zone of city.zones) {
    const dx = zone.position[0] - px
    const dz = zone.position[1] - pz
    const dist = Math.hypot(dx, dz)
    if (dist < 17) continue
    const end = dist - zone.radius - 2
    if (end - 13 <= 2) continue
    roads.push({
      ax: px + (dx / dist) * 13,
      az: pz + (dz / dist) * 13,
      bx: px + (dx / dist) * end,
      bz: pz + (dz / dist) * end,
    })
  }
  return { circles, roads }
}

function sampleSpots(
  rng: () => number,
  count: number,
  circles: Circle[],
  roads: Segment[],
  accepted: Spot[],
  extra?: (x: number, z: number, roadDist: number) => boolean,
): Spot[] {
  const out: Spot[] = []
  const isFree = (x: number, z: number, roadDist: number) => {
    const dc = Math.hypot(x, z)
    if (dc <= ISLAND_MIN || dc >= ISLAND_MAX) return false
    if (roadDist < ROAD_CLEAR) return false
    for (const c of circles) {
      if (Math.hypot(x - c.x, z - c.z) < c.r) return false
    }
    for (const a of [...accepted, ...out]) {
      if (Math.hypot(x - a.x, z - a.z) < 2.2) return false
    }
    return extra ? extra(x, z, roadDist) : true
  }

  let attempts = 0
  const maxAttempts = count * 150
  while (out.length < count && attempts < maxAttempts) {
    attempts++
    const ang = rng() * Math.PI * 2
    const rad = ISLAND_MIN + rng() * (ISLAND_MAX - ISLAND_MIN)
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad
    const roadDist = roads.length
      ? Math.min(...roads.map((r) => distToSegment(x, z, r.ax, r.az, r.bx, r.bz)))
      : Infinity
    if (!isFree(x, z, roadDist)) continue
    out.push({ x, z, ry: rng() * Math.PI * 2, s: randRange(rng, 0.85, 1.25), c: '' })
  }
  return out
}

/** One entry per prop kind: explicit city.props, or the default scatter. */
export function buildPropSpots(city: CityData): Record<PropKind, Spot[]> {
  if (city.props.length > 0) {
    const byKind: Record<PropKind, Spot[]> = { tree: [], pine: [], lamp: [], bench: [], hydrant: [] }
    for (const p of city.props) {
      byKind[p.kind].push({ x: p.position[0], z: p.position[1], ry: p.rotationY, s: 1, c: '' })
    }
    return byKind
  }

  const rng = mulberry32(1337)
  const { circles, roads } = collectObstacles(city)
  const spots: Record<PropKind, Spot[]> = { tree: [], pine: [], lamp: [], bench: [], hydrant: [] }

  const generic = (kind: PropKind, count: number) => {
    const batch = sampleSpots(rng, count, circles, roads, Object.values(spots).flat())
    spots[kind] = batch
    return batch
  }

  // Trees & pines anywhere free.
  generic('tree', COUNTS.tree)
  generic('pine', COUNTS.pine)

  // Lamps prefer to line the roads: 4–8.5 units from the center line.
  spots.lamp = sampleSpots(rng, COUNTS.lamp, circles, roads, Object.values(spots).flat(), (_x, _z, roadDist) => roadDist <= 8.5)
  if (spots.lamp.length < COUNTS.lamp) {
    const fallback = sampleSpots(rng, COUNTS.lamp - spots.lamp.length, circles, roads, Object.values(spots).flat())
    spots.lamp.push(...fallback)
  }

  generic('bench', COUNTS.bench)
  generic('hydrant', COUNTS.hydrant)

  // Assign foliage colors deterministically.
  for (const spot of spots.tree) spot.c = pick(rng, GREENS)
  for (const spot of spots.pine) spot.c = pick(rng, PINE_GREENS)
  return spots
}

/** Walk-mode collision circles for every placed prop. */
export function buildPropObstacles(city: CityData): Obstacle[] {
  const spots = buildPropSpots(city)
  const out: Obstacle[] = []
  for (const kind of Object.keys(spots) as PropKind[]) {
    const r = PROP_OBSTACLE_R[kind]
    for (const spot of spots[kind]) {
      out.push({ x: spot.x, z: spot.z, r: r * spot.s })
    }
  }
  return out
}
