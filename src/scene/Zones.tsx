import { useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import { useCityStore } from '@/state/store'
import { shade } from './util'
import type { Zone } from '@/city/schema'

/**
 * District platforms (raised pastel discs with a colored curb) and the
 * radial roads connecting each district back to the central plaza.
 */

const ROAD_WIDTH = 3
const ROAD_START = 13 // roads begin at this radius from the plaza center
const DASH_GAP = 4.5

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
  return (
    <group position={[zone.position[0], 0, zone.position[1]]}>
      {/* District platform */}
      <mesh position-y={0.25} castShadow receiveShadow>
        <cylinderGeometry args={[zone.radius, zone.radius, 0.5, 48]} />
        <meshStandardMaterial color={pastel} roughness={0.95} flatShading />
      </mesh>
      {/* Curb ring in the zone's full color */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.42} castShadow>
        <torusGeometry args={[zone.radius + 0.18, 0.2, 10, 64]} />
        <meshStandardMaterial color={zone.color} roughness={0.9} flatShading />
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

  return (
    <group>
      {city.zones.map((zone) => (
        <ZonePlatform key={zone.id} zone={zone} />
      ))}

      {roads.map((road, i) => (
        <mesh
          key={i}
          position={[road.x, 0, road.z]}
          rotation={[0, road.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[ROAD_WIDTH, 0.12, road.length]} />
          <meshStandardMaterial color="#6f6a5e" roughness={1} flatShading />
        </mesh>
      ))}

      {dashes.length > 0 && (
        <Instances limit={dashes.length} receiveShadow>
          <boxGeometry args={[0.3, 0.05, 1.9]} />
          <meshStandardMaterial color="#f5f0e6" roughness={0.9} />
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
