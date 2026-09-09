import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { easing } from 'maath'
import { ARCHETYPES } from './buildingKinds'
import { getFootprint } from './archetypes'
import { hashString, shade } from './util'
import { sceneClickSuppressed } from './walkInput'
import { useCityStore } from '@/state/store'
import type { LoadedPlace } from '@/city/load'
import type { Zone } from '@/city/schema'

/**
 * One building per place: a group pinned to its district platform top
 * (y = 0.5), oriented + scaled from the city config, wrapped in hover /
 * select interactions with a pulsing selection ring and a floating label.
 */

const HOVER_BOOST = 1.06
const LABEL_HIDE_DIST = 120

interface BuildingEntry {
  place: LoadedPlace
  zone: Zone
  accent: string
  soft: string
  seed: number
  baseY: number
  labelY: number
  ringRadius: number
}

function Building({ entry }: { entry: BuildingEntry }) {
  const { place, zone, accent, soft, seed, baseY, labelY, ringRadius } = entry
  const Archetype = ARCHETYPES[place.building]

  const hovered = useCityStore((s) => s.hoveredId === place.id)
  const selected = useCityStore((s) => s.selectedId === place.id)

  const scaleRef = useRef<Group>(null)
  const labelRef = useRef<Group>(null)
  const ringRef = useRef<Mesh>(null)
  const ringMatRef = useRef<MeshBasicMaterial>(null)

  useFrame((state, delta) => {
    // Hover/scale pulse — damped toward the target, never per-frame setState.
    const group = scaleRef.current
    if (group) {
      const s = place.scale * (hovered || selected ? HOVER_BOOST : 1)
      easing.damp3(group.scale, [s, s, s], 0.12, delta)
    }

    // Labels: gently grow when active, fade out of existence when far away.
    const label = labelRef.current
    if (label) {
      const ls = hovered || selected ? 1.14 : 1
      easing.damp3(label.scale, [ls, ls, ls], 0.12, delta)
      const cam = state.camera.position
      const dx = cam.x - place.position[0]
      const dy = cam.y - (baseY + labelY)
      const dz = cam.z - place.position[1]
      label.visible = dx * dx + dy * dy + dz * dz < LABEL_HIDE_DIST * LABEL_HIDE_DIST
    }

    // Selection ring pulse.
    const ring = ringRef.current
    const ringMat = ringMatRef.current
    if (ring && ringMat) {
      const t = state.clock.elapsedTime
      ring.scale.setScalar(1 + 0.05 * Math.sin(t * 3.4))
      ringMat.opacity = 0.55 + 0.25 * Math.sin(t * 3.4)
    }
  })

  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (useCityStore.getState().editing) return
    event.stopPropagation()
    useCityStore.getState().setHovered(place.id)
    document.body.style.cursor = 'pointer'
  }

  const onPointerOut = () => {
    if (useCityStore.getState().hoveredId === place.id) {
      useCityStore.getState().setHovered(null)
    }
    document.body.style.cursor = ''
  }

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (useCityStore.getState().editing) return
    if (sceneClickSuppressed()) return
    useCityStore.getState().select(place.id)
  }

  return (
    <group
      position={[place.position[0], baseY, place.position[1]]}
      rotation-y={place.rotationY}
      userData={{ placeId: place.id }}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      {/* Damped scale target: rests at place.scale, eases to 1.06x on hover */}
      <group ref={scaleRef}>
        <Archetype accent={accent} soft={soft} seed={seed} />
      </group>

      <Billboard position={[0, labelY, 0]}>
        <group ref={labelRef}>
          <Text
            fontSize={1.5}
            color="#1f2937"
            outlineWidth={0.14}
            outlineColor="#ffffff"
            anchorY="bottom"
            position={[0, 0.45, 0]}
            maxWidth={16}
            textAlign="center"
          >
            {place.name}
          </Text>
          {place.label && (
            <Text
              fontSize={0.9}
              color="#475569"
              outlineWidth={0.08}
              outlineColor="#ffffff"
              anchorY="top"
              position={[0, 0.2, 0]}
              maxWidth={16}
              textAlign="center"
            >
              {place.label}
            </Text>
          )}
        </group>
      </Billboard>

      {selected && (
        <mesh
          ref={ringRef}
          rotation-x={-Math.PI / 2}
          position={[0, 0.06, 0]}
          renderOrder={2}
        >
          <ringGeometry args={[ringRadius + 0.6, ringRadius + 1.4, 40]} />
          <meshBasicMaterial
            ref={ringMatRef}
            color={zone.color}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

export function Buildings() {
  const city = useCityStore((s) => s.city)

  const entries = useMemo<BuildingEntry[]>(
    () =>
      city.places.map((place) => {
        const zone =
          city.zones.find((zn) => zn.id === place.zone) ?? city.zones[0]
        const fp = getFootprint(place.building)
        // Buildings sit on the platform lid (y = 0.5) when inside their zone.
        const inZone =
          Math.hypot(
            place.position[0] - zone.position[0],
            place.position[1] - zone.position[1],
          ) <= zone.radius
        return {
          place,
          zone,
          accent: shade(zone.color, -0.25),
          soft: shade(zone.color, 0.45),
          seed: hashString(place.id),
          baseY: inZone ? 0.5 : 0,
          labelY: fp.height * place.scale + 2.5,
          ringRadius: fp.radius * place.scale,
        }
      }),
    [city],
  )

  return (
    <group>
      {entries.map((entry) => (
        <Building key={entry.place.id} entry={entry} />
      ))}
    </group>
  )
}
