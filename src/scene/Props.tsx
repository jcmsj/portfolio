import { useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import type { ReactElement } from 'react'
import type { MeshStandardMaterial } from 'three'
import { getStandardMaterial } from './materials'
import { mulberry32, randRange } from './util'
import { buildPropSpots } from './propSpots'
import type { PropKind, Spot } from './propSpots'
import { useCityStore } from '@/state/store'

/**
 * Decorative props: trees, pines, lamps, benches and hydrants.
 *
 * Placement lives in ./propSpots (shared with WalkControls collisions).
 * When the city config has no props (the default), a deterministic
 * mulberry32(1337) scatter fills the island — keeping clear of the plaza,
 * district platforms, roads and building footprints. Rendered through drei
 * Instances so ~350 props cost a handful of draw calls.
 *
 * frustumCulled is forced off: drei's InstancedMesh bounding sphere is
 * computed once from identity first-frame matrices (tiny ball at origin).
 * Orbit mode always looks at the center so that never bit; walk mode turns
 * the origin out of frustum and culls every nearby prop at once.
 */

type Item = {
  x: number
  y: number
  z: number
  ry: number
  s: number | [number, number, number]
  c?: string
}

/** Rotate a local (x, z) offset by a yaw and add it to a spot. */
function offset(spot: Spot, lx: number, ly: number, lz: number, s: number): [number, number, number] {
  const cos = Math.cos(spot.ry)
  const sin = Math.sin(spot.ry)
  return [spot.x + (lx * cos + lz * sin) * s, ly * s, spot.z + (-lx * sin + lz * cos) * s]
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

/** Props are purely decorative (no event handlers): skip raycasting entirely. */
const NO_RAYCAST = () => null

function Part({
  geo,
  material,
  items,
}: {
  geo: ReactElement
  material: MeshStandardMaterial
  items: Item[]
}) {
  if (items.length === 0) return null
  return (
    <Instances
      limit={items.length}
      castShadow
      receiveShadow
      raycast={NO_RAYCAST}
      material={material}
      dispose={null}
      frustumCulled={false}
    >
      {geo}
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

// Shared cached materials — one instance per distinct param set.
const TRUNK_MAT = getStandardMaterial({ color: '#8a6a4a', roughness: 1, flatShading: true })
const FOLIAGE_MAT = getStandardMaterial({ roughness: 1, flatShading: true }) // white; per-instance colors tint it
const LAMP_POST_MAT = getStandardMaterial({ color: '#5a5f66', roughness: 0.6, metalness: 0.4, flatShading: true })
const LAMP_HEAD_MAT = getStandardMaterial({
  color: '#f2c14e',
  emissive: '#f2c14e',
  emissiveIntensity: 0.4,
  roughness: 0.4,
})
const BENCH_MAT = getStandardMaterial({ color: '#b58a5f', roughness: 1, flatShading: true })
const BENCH_LEG_MAT = getStandardMaterial({ color: '#93704e', roughness: 1, flatShading: true })
const HYDRANT_MAT = getStandardMaterial({ color: '#d95f5f', roughness: 0.6, flatShading: true })

export function Props() {
  const city = useCityStore((s) => s.city)

  const items = useMemo(() => buildItems(buildPropSpots(city)), [city])

  return (
    <group>
      <Part geo={<cylinderGeometry args={[0.16, 0.22, 1.2, 6]} />} material={TRUNK_MAT} items={items.trunks} />
      <Part geo={<icosahedronGeometry args={[1.15, 0]} />} material={FOLIAGE_MAT} items={items.canopies} />
      <Part geo={<icosahedronGeometry args={[1.15, 0]} />} material={FOLIAGE_MAT} items={items.canopyTops} />
      <Part geo={<coneGeometry args={[1.05, 2.6, 7]} />} material={FOLIAGE_MAT} items={items.cones} />
      <Part geo={<cylinderGeometry args={[0.06, 0.09, 2.8, 6]} />} material={LAMP_POST_MAT} items={items.lampPosts} />
      <Part geo={<sphereGeometry args={[0.22, 10, 8]} />} material={LAMP_HEAD_MAT} items={items.lampHeads} />
      <Part geo={<boxGeometry args={[1.7, 0.12, 0.55]} />} material={BENCH_MAT} items={items.benchSeats} />
      <Part geo={<boxGeometry args={[1.7, 0.5, 0.1]} />} material={BENCH_MAT} items={items.benchBacks} />
      <Part geo={<boxGeometry args={[0.12, 0.45, 0.5]} />} material={BENCH_LEG_MAT} items={items.benchLegs} />
      <Part geo={<cylinderGeometry args={[0.22, 0.28, 0.65, 8]} />} material={HYDRANT_MAT} items={items.hydrantBodies} />
      <Part geo={<sphereGeometry args={[0.16, 8, 6]} />} material={HYDRANT_MAT} items={items.hydrantCaps} />
    </group>
  )
}
