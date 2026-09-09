import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { MergedParts, ico } from './buildingKinds'
import type { PartSpec } from './buildingKinds'
import { mulberry32, randRange } from './util'

/**
 * 5 slow-drifting cloud clusters made of flat-shaded white puffs.
 * Each cluster's puffs are merged into ONE mesh (they never move relative to
 * their group), so the whole layer costs 5 draw calls. They wrap around the
 * island along +x and never cast or receive shadows.
 */

const CLUSTER_COUNT = 5
const WRAP_X = 170

interface Cluster {
  x: number
  y: number
  z: number
  speed: number
  parts: PartSpec[]
}

export function Clouds() {
  const clusters = useMemo<Cluster[]>(() => {
    const rng = mulberry32(90210)
    return Array.from({ length: CLUSTER_COUNT }, () => ({
      x: randRange(rng, -WRAP_X, WRAP_X),
      y: randRange(rng, 30, 42),
      z: randRange(rng, -110, 110),
      speed: randRange(rng, 0.5, 1.1),
      parts: Array.from({ length: 3 + Math.floor(rng() * 3) }, () => {
        // Draw in the original order (ox, oy, oz, r) to keep the layout identical.
        const ox = randRange(rng, -4.5, 4.5)
        const oy = randRange(rng, -0.9, 0.9)
        const oz = randRange(rng, -2.6, 2.6)
        const r = randRange(rng, 1.7, 3.6)
        return ico('#ffffff', r, [ox, oy, oz], {
          detail: 1,
          rough: 1,
          transparent: true,
          opacity: 0.95,
          receive: false,
        })
      }),
    }))
  }, [])

  const groupRefs = useRef<(Group | null)[]>([])

  useFrame((_, delta) => {
    for (const group of groupRefs.current) {
      if (!group) continue
      const speed = group.userData.speed as number
      group.position.x += speed * delta
      if (group.position.x > WRAP_X) group.position.x = -WRAP_X
    }
  })

  return (
    <group>
      {clusters.map((cluster, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          position={[cluster.x, cluster.y, cluster.z]}
          userData={{ speed: cluster.speed }}
        >
          <MergedParts cacheKey={`clouds|${i}`} parts={cluster.parts} />
        </group>
      ))}
    </group>
  )
}
