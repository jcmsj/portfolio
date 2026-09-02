import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { IcosahedronGeometry, MeshStandardMaterial } from 'three'
import { mulberry32, randRange } from './util'

/**
 * 5 slow-drifting cloud clusters made of flat-shaded white puffs.
 * They wrap around the island along +x and never cast shadows.
 */

const CLUSTER_COUNT = 5
const WRAP_X = 170

interface Puff {
  ox: number
  oy: number
  oz: number
  r: number
}

interface Cluster {
  x: number
  y: number
  z: number
  speed: number
  puffs: Puff[]
}

export function Clouds() {
  const clusters = useMemo<Cluster[]>(() => {
    const rng = mulberry32(90210)
    return Array.from({ length: CLUSTER_COUNT }, () => ({
      x: randRange(rng, -WRAP_X, WRAP_X),
      y: randRange(rng, 30, 42),
      z: randRange(rng, -110, 110),
      speed: randRange(rng, 0.5, 1.1),
      puffs: Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({
        ox: randRange(rng, -4.5, 4.5),
        oy: randRange(rng, -0.9, 0.9),
        oz: randRange(rng, -2.6, 2.6),
        r: randRange(rng, 1.7, 3.6),
      })),
    }))
  }, [])

  const groupRefs = useRef<(Group | null)[]>([])
  const puffGeometry = useMemo(() => new IcosahedronGeometry(1, 1), [])
  const puffMaterial = useMemo<MeshStandardMaterial>(
    () =>
      new MeshStandardMaterial({
        color: '#ffffff',
        roughness: 1,
        flatShading: true,
        transparent: true,
        opacity: 0.95,
      }),
    [],
  )

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
          {cluster.puffs.map((puff, j) => (
            <mesh
              key={j}
              geometry={puffGeometry}
              material={puffMaterial}
              position={[puff.ox, puff.oy, puff.oz]}
              scale={puff.r}
            />
          ))}
        </group>
      ))}
    </group>
  )
}
