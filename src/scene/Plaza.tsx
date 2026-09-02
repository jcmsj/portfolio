import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import { MergedParts, box, cone, cyl, ring, sph } from './buildingKinds'
import type { PartSpec } from './buildingKinds'
import { PALETTE } from './util'
import { getStandardMaterial } from './materials'
import { useCityStore } from '@/state/store'

/**
 * Central plaza: paved disc, tiered fountain with animated water, lamps and
 * the city hero billboard angled at the default camera. An invisible cylinder
 * over the whole plaza makes it clickable (opens the "about" place).
 *
 * Static parts of the lamps / fountain / billboard are merged into a few
 * meshes with shared cached materials (params mirror the old JSX exactly).
 * The click collider keeps its own mesh + raycast; the fountain water group
 * and the billboard Text keep their original transforms.
 */

const PLAZA_RADIUS = 11
const PLAZA_TOP = 0.35

const LAMP_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

const PAVE_MAT = getStandardMaterial({ color: '#d9cfc0', roughness: 1, flatShading: true })
const FOUNTAIN_STONE_MAT = getStandardMaterial({ color: PALETTE.stone, roughness: 0.95, flatShading: true })

const WATER_X = { rough: 0.15, transparent: true, opacity: 0.78, flat: false, receive: false } as const
const STONE_X = { rough: 0.95, cast: true } as const
const LAMP_POST_X = { rough: 0.6, metal: 0.4, cast: true, receive: false } as const

/** 4 lamps (posts + glass heads + caps) baked around the plaza, 2 buckets. */
const LAMP_PARTS: PartSpec[] = LAMP_ANGLES.flatMap((angle) => {
  const x = Math.cos(angle) * 8
  const z = Math.sin(angle) * 8
  return [
    cyl('#5a5f66', 0.07, 0.1, 2.7, [x, PLAZA_TOP + 1.35, z], { seg: 6, ...LAMP_POST_X }),
    // Glass bulb (the lamp group's yaw is irrelevant for Y-symmetric parts).
    sph(PALETTE.gold, 0.26, [x, PLAZA_TOP + 2.85, z], {
      seg: 10,
      rough: 0.4,
      flat: false,
      emissive: PALETTE.gold,
      emissiveIntensity: 0.45,
      cast: true,
      receive: false,
    }),
    cone('#5a5f66', 0.3, 0.32, [x, PLAZA_TOP + 3.12, z], { seg: 6, ...LAMP_POST_X }),
  ]
})

/** Inset paving rings (positions are local to the plaza fixtures group). */
const RING_PARTS: PartSpec[] = [
  ring('#c9bda9', 5.4, 5.7, [0, PLAZA_TOP + 0.012, 0], { seg: 48, r: [-Math.PI / 2, 0, 0], rough: 1, flat: false }),
  ring('#c9bda9', 9.4, 9.7, [0, PLAZA_TOP + 0.012, 0], { seg: 48, r: [-Math.PI / 2, 0, 0], rough: 1, flat: false }),
]

/** Tier + upper water + spout + finial that ride the bobbing water group. */
const FOUNTAIN_TOP_PARTS: PartSpec[] = [
  cyl('#7fc4e8', 3.15, 3.15, 0.1, [0, PLAZA_TOP + 0.62, 0], { seg: 20, ...WATER_X }),
  cyl(PALETTE.stone, 1.5, 1.7, 0.35, [0, PLAZA_TOP + 1.95, 0], { seg: 16, ...STONE_X }),
  cyl('#7fc4e8', 1.3, 1.3, 0.08, [0, PLAZA_TOP + 2.14, 0], { seg: 16, ...WATER_X }),
  cyl(PALETTE.stone, 0.28, 0.42, 1.3, [0, PLAZA_TOP + 1.25, 0], { seg: 10, ...STONE_X }),
  sph(PALETTE.gold, 0.3, [0, PLAZA_TOP + 2.5, 0], {
    seg: 10,
    metal: 0.7,
    rough: 0.25,
    cast: true,
    receive: false,
  }),
]

/** Billboard posts + diagonal braces (the slanted panel group stays intact). */
const BILLBOARD_FRAME_PARTS: PartSpec[] = [
  cyl(PALETTE.wood, 0.22, 0.28, 3.8, [-4.4, 1.9, 0], { seg: 8, rough: 1, cast: true, receive: false }),
  cyl(PALETTE.wood, 0.22, 0.28, 3.8, [4.4, 1.9, 0], { seg: 8, rough: 1, cast: true, receive: false }),
  cyl(PALETTE.woodDark, 0.09, 0.09, 2.1, [-1.6, 3.5, -0.15], {
    seg: 6,
    r: [0, 0, -0.55],
    rough: 1,
    cast: true,
    receive: false,
  }),
  cyl(PALETTE.woodDark, 0.09, 0.09, 2.1, [1.6, 3.5, -0.15], {
    seg: 6,
    r: [0, 0, 0.55],
    rough: 1,
    cast: true,
    receive: false,
  }),
]

/** Panel back + front face, in the slanted panel group's local space. */
const BILLBOARD_PANEL_PARTS: PartSpec[] = [
  box(PALETTE.wood, [11, 5, 0.35], [0, 0, 0], { rough: 1, cast: true, receive: false }),
  box(PALETTE.white, [10.2, 4.2, 0.14], [0, 0, 0.17], { rough: 0.9, receive: false }),
]

function Fountain() {
  const waterRef = useRef<Group>(null)

  useFrame((state, delta) => {
    const water = waterRef.current
    if (!water) return
    water.rotation.y += delta * 0.35
    water.position.y = Math.sin(state.clock.elapsedTime * 1.1) * 0.025
  })

  return (
    <group>
      {/* basin */}
      <mesh position-y={PLAZA_TOP + 0.35} castShadow receiveShadow material={FOUNTAIN_STONE_MAT} dispose={null}>
        <cylinderGeometry args={[3.4, 3.6, 0.7, 20]} />
      </mesh>
      {/* water surface + upper tier, bobbing gently */}
      <group ref={waterRef}>
        <MergedParts cacheKey="plaza-fountain-top" parts={FOUNTAIN_TOP_PARTS} />
      </group>
    </group>
  )
}

function HeroBillboard({ name, tagline }: { name: string; tagline: string }) {
  return (
    <group position={[6, PLAZA_TOP, 6]} rotation-y={Math.PI / 4}>
      <MergedParts cacheKey="plaza-billboard-frame" parts={BILLBOARD_FRAME_PARTS} />
      {/* panel: frame + front face */}
      <group position={[0, 4.65, 0]} rotation={[-0.05, 0, 0]}>
        <MergedParts cacheKey="plaza-billboard-panel" parts={BILLBOARD_PANEL_PARTS} />
        {/* faux-bold title: dark outline in the fill color thickens strokes */}
        <Text
          fontSize={2.1}
          color="#1f2937"
          outlineWidth={0.09}
          outlineColor="#1f2937"
          anchorY="bottom"
          position={[0, 0.55, 0.26]}
          maxWidth={9.6}
          textAlign="center"
        >
          {name}
        </Text>
        <Text
          fontSize={0.85}
          color="#475569"
          anchorY="top"
          position={[0, 0.3, 0.26]}
          maxWidth={9.6}
          textAlign="center"
        >
          {tagline}
        </Text>
      </group>
    </group>
  )
}

export function Plaza() {
  const city = useCityStore((s) => s.city)
  const [px, pz] = city.plaza.position

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    if (useCityStore.getState().editing) return
    event.stopPropagation()
    useCityStore.getState().setHovered(city.plaza.contentId)
    document.body.style.cursor = 'pointer'
  }

  const onOut = () => {
    const state = useCityStore.getState()
    if (state.hoveredId === city.plaza.contentId) state.setHovered(null)
    document.body.style.cursor = ''
  }

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (useCityStore.getState().editing) return
    useCityStore.getState().select(city.plaza.contentId)
  }

  return (
    <group>
      {/* paved disc */}
      <mesh position={[px, PLAZA_TOP / 2, pz]} castShadow receiveShadow material={PAVE_MAT} dispose={null}>
        <cylinderGeometry args={[PLAZA_RADIUS, PLAZA_RADIUS + 0.35, PLAZA_TOP, 48]} />
      </mesh>

      {/* fixtures ride on the plaza disc, wherever it is configured */}
      <group position={[px, 0, pz]}>
        {/* inset paving rings (merged) */}
        <MergedParts cacheKey="plaza-rings" parts={RING_PARTS} />
        <Fountain />
        <MergedParts cacheKey="plaza-lamps" parts={LAMP_PARTS} />
        <HeroBillboard name={city.meta.cityName} tagline={city.meta.tagline} />
      </group>

      {/* invisible click collider over the whole plaza */}
      <mesh
        position={[px, 1.5, pz]}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <cylinderGeometry args={[PLAZA_RADIUS, PLAZA_RADIUS, 3, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
