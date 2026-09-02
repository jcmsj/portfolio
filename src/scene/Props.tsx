import { useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import type { ReactElement } from 'react'
import { getFootprint } from './archetypes'
import { mulberry32, pick, randRange } from './util'
import { useCityStore } from '@/state/store'
import type { CityData } from '@/city/load'

/**
 * Decorative props: trees, pines, lamps, benches and hydrants.
 *
 * When the city config has no props (the default), a deterministic
 * mulberry32(1337) scatter fills the island — keeping clear of the plaza,
 * district platforms, roads and building footprints. Rendered through drei
 * Instances so ~350 props cost a handful of draw calls.
 */

type PropKind = 'tree' | 'pine' | 'lamp' | 'bench' | 'hydrant'

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

interface Spot {
  x: number
  z: number
  ry: number
  s: number
  c: string
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

/** One entry per instanced part, positioned in world space. */
interface Item {
  x: number
  y: number
  z: number
  ry: number
  s: number | [number, number, number]
  c?: string
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

/** Rotate a local (x, z) offset by a yaw and add it to a spot. */
function offset(spot: Spot, lx: number, ly: number, lz: number, s: number): [number, number, number] {
  const cos = Math.cos(spot.ry)
  const sin = Math.sin(spot.ry)
  return [spot.x + (lx * cos + lz * sin) * s, ly * s, spot.z + (-lx * sin + lz * cos) * s]
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

function buildSpots(city: CityData): Record<PropKind, Spot[]> {
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

function buildItems(spots: Record<PropKind, Spot[]>): Record<string, Item[]> {
  const rng = mulberry32(4242) // part-level variation, still deterministic
  const trunks: Item[] = []
  const canopies: Item[] = []
  const canopyTops: Item[] = []
  const cones: Item[] = []
  const lampPosts: Item[] = []
  const lampHeads: Item[] = []
  const benchSeats: Item[] = []
  const benchBacks: Item[] = []
  const benchLegs: Item[] = []
  const hydrantBodies: Item[] = []
  const hydrantCaps: Item[] = []

  for (const spot of spots.tree) {
    trunks.push({ x: spot.x, y: 0.6 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
    const lean = randRange(rng, -0.12, 0.12)
    canopies.push({
      x: spot.x + lean * spot.s,
      y: 2.05 * spot.s,
      z: spot.z,
      ry: spot.ry,
      s: spot.s * randRange(rng, 0.95, 1.25),
      c: spot.c,
    })
    canopyTops.push({
      x: spot.x + lean * 1.6 * spot.s,
      y: 3.15 * spot.s,
      z: spot.z,
      ry: spot.ry,
      s: spot.s * randRange(rng, 0.55, 0.75),
      c: spot.c,
    })
  }

  for (const spot of spots.pine) {
    trunks.push({ x: spot.x, y: 0.5 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
    cones.push({ x: spot.x, y: 1.85 * spot.s, z: spot.z, ry: spot.ry, s: spot.s, c: spot.c })
    cones.push({ x: spot.x, y: 3.1 * spot.s, z: spot.z, ry: spot.ry, s: spot.s * 0.62, c: spot.c })
  }

  for (const spot of spots.lamp) {
    lampPosts.push({ x: spot.x, y: 1.4 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
    lampHeads.push({ x: spot.x, y: 2.92 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
  }

  for (const spot of spots.bench) {
    benchSeats.push({ x: spot.x, y: 0.46 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
    const [bx, by, bz] = offset(spot, 0, 0.72, -0.26, spot.s)
    benchBacks.push({ x: bx, y: by, z: bz, ry: spot.ry, s: spot.s })
    for (const lx of [-0.68, 0.68]) {
      const [gx, gy, gz] = offset(spot, lx, 0.22, 0, spot.s)
      benchLegs.push({ x: gx, y: gy, z: gz, ry: spot.ry, s: spot.s })
    }
  }

  for (const spot of spots.hydrant) {
    hydrantBodies.push({ x: spot.x, y: 0.33 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
    hydrantCaps.push({ x: spot.x, y: 0.74 * spot.s, z: spot.z, ry: spot.ry, s: spot.s })
  }

  return {
    trunks,
    canopies,
    canopyTops,
    cones,
    lampPosts,
    lampHeads,
    benchSeats,
    benchBacks,
    benchLegs,
    hydrantBodies,
    hydrantCaps,
  }
}

function Part({
  geo,
  material,
  items,
}: {
  geo: ReactElement
  material: ReactElement
  items: Item[]
}) {
  if (items.length === 0) return null
  return (
    <Instances limit={items.length} castShadow receiveShadow>
      {geo}
      {material}
      {items.map((item, i) => (
        <Instance
          key={i}
          position={[item.x, item.y, item.z]}
          rotation-y={item.ry}
          scale={item.s}
          {...(item.c ? { color: item.c } : {})}
        />
      ))}
    </Instances>
  )
}

export function Props() {
  const city = useCityStore((s) => s.city)

  const items = useMemo(() => buildItems(buildSpots(city)), [city])

  const woodMat = <meshStandardMaterial color="#8a6a4a" roughness={1} flatShading />
  const stoneMat = <meshStandardMaterial color="#5a5f66" roughness={0.6} metalness={0.4} flatShading />

  return (
    <group>
      <Part geo={<cylinderGeometry args={[0.16, 0.22, 1.2, 6]} />} material={woodMat} items={items.trunks} />
      <Part
        geo={<icosahedronGeometry args={[1.15, 0]} />}
        material={<meshStandardMaterial roughness={1} flatShading />}
        items={items.canopies}
      />
      <Part
        geo={<icosahedronGeometry args={[1.15, 0]} />}
        material={<meshStandardMaterial roughness={1} flatShading />}
        items={items.canopyTops}
      />
      <Part
        geo={<coneGeometry args={[1.05, 2.6, 7]} />}
        material={<meshStandardMaterial roughness={1} flatShading />}
        items={items.cones}
      />
      <Part geo={<cylinderGeometry args={[0.06, 0.09, 2.8, 6]} />} material={stoneMat} items={items.lampPosts} />
      <Part
        geo={<sphereGeometry args={[0.22, 10, 8]} />}
        material={
          <meshStandardMaterial
            color="#f2c14e"
            emissive="#f2c14e"
            emissiveIntensity={0.4}
            roughness={0.4}
          />
        }
        items={items.lampHeads}
      />
      <Part
        geo={<boxGeometry args={[1.7, 0.12, 0.55]} />}
        material={<meshStandardMaterial color="#b58a5f" roughness={1} flatShading />}
        items={items.benchSeats}
      />
      <Part
        geo={<boxGeometry args={[1.7, 0.5, 0.1]} />}
        material={<meshStandardMaterial color="#b58a5f" roughness={1} flatShading />}
        items={items.benchBacks}
      />
      <Part
        geo={<boxGeometry args={[0.12, 0.45, 0.5]} />}
        material={<meshStandardMaterial color="#93704e" roughness={1} flatShading />}
        items={items.benchLegs}
      />
      <Part
        geo={<cylinderGeometry args={[0.22, 0.28, 0.65, 8]} />}
        material={<meshStandardMaterial color="#d95f5f" roughness={0.6} flatShading />}
        items={items.hydrantBodies}
      />
      <Part
        geo={<sphereGeometry args={[0.16, 8, 6]} />}
        material={<meshStandardMaterial color="#d95f5f" roughness={0.6} flatShading />}
        items={items.hydrantCaps}
      />
    </group>
  )
}
