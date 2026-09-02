import { useEffect, useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BufferGeometry } from 'three'
import { useCityStore } from '@/state/store'
import { getStandardMaterial } from './materials'
import { shade } from './util'
import type { Zone } from '@/city/schema'

/**
 * District platforms (raised pastel discs with a colored curb) and the
 * radial roads connecting each district back to the central plaza.
 * All road segments are merged into a single mesh; materials come from the
 * shared cache.
 */

const ROAD_WIDTH = 3
const ROAD_START = 13 // roads begin at this radius from the plaza center
const DASH_GAP = 4.5

const ROAD_MAT = getStandardMaterial({ color: '#6f6a5e', roughness: 1, flatShading: true })
const DASH_MAT = getStandardMaterial({ color: '#f5f0e6', roughness: 0.9 })
const NO_RAYCAST = () => null

interface RoadSpec {
  x: number
  z: number
  angle: number
  length: number
}

interface DashSpec {
  x: number
  z: number
  angle: number
}

function ZonePlatform({ zone }: { zone: Zone }) {
  const pastel = shade(zone.color, 0.72)
  // Cached per color: every zone tint resolves to one shared material.
  const platformMat = getStandardMaterial({ color: pastel, roughness: 0.95, flatShading: true })
  const curbMat = getStandardMaterial({ color: zone.color, roughness: 0.9, flatShading: true })
  return (
    <group position={[zone.position[0], 0, zone.position[1]]}>
      {/* District platform (casts onto the water) */}
      <mesh position-y={0.25} castShadow receiveShadow material={platformMat} dispose={null}>
        <cylinderGeometry args={[zone.radius, zone.radius, 0.5, 48]} />
      </mesh>
      {/* Curb ring in the zone's full color (thin — skips shadow casting) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.42} material={curbMat} dispose={null}>
        <torusGeometry args={[zone.radius + 0.18, 0.2, 10, 64]} />
      </mesh>
    </group>
  )
}

export function Zones() {
  const city = useCityStore((s) => s.city)

  const { roads, dashes } = useMemo(() => {
    const roads: RoadSpec[] = []
    const dashes: DashSpec[] = []
    const [px, pz] = city.plaza.position
    for (const zone of city.zones) {
      const dx = zone.position[0] - px
      const dz = zone.position[1] - pz
      const dist = Math.hypot(dx, dz)
      if (dist < ROAD_START + 4) continue
      const ux = dx / dist
      const uz = dz / dist
      const end = dist - zone.radius - 2
      const length = end - ROAD_START
      if (length <= 2) continue
      const angle = Math.atan2(ux, uz)
      roads.push({
        x: px + ux * (ROAD_START + length / 2),
        z: pz + uz * (ROAD_START + length / 2),
        angle,
        length,
      })
      for (let t = ROAD_START + 2.4; t < end - 1.4; t += DASH_GAP) {
        dashes.push({ x: px + ux * t, z: pz + uz * t, angle })
      }
    }
    return { roads, dashes }
  }, [city])

  // All road segments share one material: bake their transforms into a
  // single merged geometry (one draw call instead of one per road).
  const roadGeometry = useMemo<BufferGeometry | null>(() => {
    if (roads.length === 0) return null
    const mat4 = new Matrix4()
    const quat = new Quaternion()
    const euler = new Euler()
    const pos = new Vector3()
    const scale = new Vector3(1, 1, 1)
    const geoms = roads.map((road) => {
      const g = new BoxGeometry(ROAD_WIDTH, 0.12, 1)
      euler.set(0, road.angle, 0)
      quat.setFromEuler(euler)
      pos.set(road.x, 0, road.z)
      scale.set(1, 1, road.length)
      mat4.compose(pos, quat, scale)
      g.applyMatrix4(mat4)
      return g
    })
    return geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false)
  }, [roads])

  // Dispose the previous merged roads when they change or on unmount.
  useEffect(() => () => roadGeometry?.dispose(), [roadGeometry])

  return (
    <group>
      {city.zones.map((zone) => (
        <ZonePlatform key={zone.id} zone={zone} />
      ))}

      {roadGeometry && (
        <mesh geometry={roadGeometry} material={ROAD_MAT} receiveShadow dispose={null} />
      )}

      {dashes.length > 0 && (
        <Instances limit={dashes.length} receiveShadow raycast={NO_RAYCAST} material={DASH_MAT} dispose={null}>
          <boxGeometry args={[0.3, 0.05, 1.9]} />
          {dashes.map((dash, i) => (
            <Instance
              key={i}
              position={[dash.x, 0.1, dash.z]}
              rotation={[0, dash.angle, 0]}
            />
          ))}
        </Instances>
      )}
    </group>
  )
}
