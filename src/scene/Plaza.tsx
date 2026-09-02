import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import { PALETTE } from './util'
import { useCityStore } from '@/state/store'

/**
 * Central plaza: paved disc, tiered fountain with animated water, lamps and
 * the city hero billboard angled at the default camera. An invisible cylinder
 * over the whole plaza makes it clickable (opens the "about" place).
 */

const PLAZA_RADIUS = 11
const PLAZA_TOP = 0.35

const LAMP_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

function Lamp({ angle }: { angle: number }) {
  const x = Math.cos(angle) * 8
  const z = Math.sin(angle) * 8
  return (
    <group position={[x, PLAZA_TOP, z]} rotation-y={-angle + Math.PI / 2}>
      <mesh position-y={1.35} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 2.7, 6]} />
        <meshStandardMaterial color="#5a5f66" roughness={0.6} metalness={0.4} flatShading />
      </mesh>
      {/* head: glass bulb in a small cap */}
      <mesh position-y={2.85} castShadow>
        <sphereGeometry args={[0.26, 10, 8]} />
        <meshStandardMaterial
          color={PALETTE.gold}
          emissive={PALETTE.gold}
          emissiveIntensity={0.45}
          roughness={0.4}
        />
      </mesh>
      <mesh position-y={3.12} castShadow>
        <coneGeometry args={[0.3, 0.32, 6]} />
        <meshStandardMaterial color="#5a5f66" roughness={0.6} metalness={0.4} flatShading />
      </mesh>
    </group>
  )
}

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
      <mesh position-y={PLAZA_TOP + 0.35} castShadow receiveShadow>
        <cylinderGeometry args={[3.4, 3.6, 0.7, 20]} />
        <meshStandardMaterial color={PALETTE.stone} roughness={0.95} flatShading />
      </mesh>
      {/* water surface + upper tier, bobbing gently */}
      <group ref={waterRef}>
        <mesh position-y={PLAZA_TOP + 0.62}>
          <cylinderGeometry args={[3.15, 3.15, 0.1, 20]} />
          <meshStandardMaterial color="#7fc4e8" transparent opacity={0.78} roughness={0.15} />
        </mesh>
        <mesh position-y={PLAZA_TOP + 1.95} castShadow>
          <cylinderGeometry args={[1.5, 1.7, 0.35, 16]} />
          <meshStandardMaterial color={PALETTE.stone} roughness={0.95} flatShading />
        </mesh>
        <mesh position-y={PLAZA_TOP + 2.14}>
          <cylinderGeometry args={[1.3, 1.3, 0.08, 16]} />
          <meshStandardMaterial color="#7fc4e8" transparent opacity={0.78} roughness={0.15} />
        </mesh>
        {/* center spout */}
        <mesh position-y={PLAZA_TOP + 1.25} castShadow>
          <cylinderGeometry args={[0.28, 0.42, 1.3, 10]} />
          <meshStandardMaterial color={PALETTE.stone} roughness={0.95} flatShading />
        </mesh>
        <mesh position-y={PLAZA_TOP + 2.5} castShadow>
          <sphereGeometry args={[0.3, 10, 8]} />
          <meshStandardMaterial color={PALETTE.gold} metalness={0.7} roughness={0.25} flatShading />
        </mesh>
      </group>
    </group>
  )
}

function HeroBillboard({ name, tagline }: { name: string; tagline: string }) {
  return (
    <group position={[6, PLAZA_TOP, 6]} rotation-y={Math.PI / 4}>
      {/* wooden posts */}
      <mesh position={[-4.4, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 3.8, 8]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={1} flatShading />
      </mesh>
      <mesh position={[4.4, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 3.8, 8]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={1} flatShading />
      </mesh>
      {/* diagonal braces */}
      <mesh position={[-1.6, 3.5, -0.15]} rotation={[0, 0, -0.55]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 2.1, 6]} />
        <meshStandardMaterial color={PALETTE.woodDark} roughness={1} flatShading />
      </mesh>
      <mesh position={[1.6, 3.5, -0.15]} rotation={[0, 0, 0.55]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 2.1, 6]} />
        <meshStandardMaterial color={PALETTE.woodDark} roughness={1} flatShading />
      </mesh>
      {/* panel: frame + front face */}
      <group position={[0, 4.65, 0]} rotation={[-0.05, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[11, 5, 0.35]} />
          <meshStandardMaterial color={PALETTE.wood} roughness={1} flatShading />
        </mesh>
        <mesh position={[0, 0, 0.17]}>
          <boxGeometry args={[10.2, 4.2, 0.14]} />
          <meshStandardMaterial color={PALETTE.white} roughness={0.9} flatShading />
        </mesh>
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
      <mesh position={[px, PLAZA_TOP / 2, pz]} castShadow receiveShadow>
        <cylinderGeometry args={[PLAZA_RADIUS, PLAZA_RADIUS + 0.35, PLAZA_TOP, 48]} />
        <meshStandardMaterial color="#d9cfc0" roughness={1} flatShading />
      </mesh>
      {/* inset paving rings */}
      <mesh rotation-x={-Math.PI / 2} position={[px, PLAZA_TOP + 0.012, pz]} receiveShadow>
        <ringGeometry args={[5.4, 5.7, 48]} />
        <meshStandardMaterial color="#c9bda9" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[px, PLAZA_TOP + 0.012, pz]} receiveShadow>
        <ringGeometry args={[9.4, 9.7, 48]} />
        <meshStandardMaterial color="#c9bda9" roughness={1} />
      </mesh>

      {/* fixtures ride on the plaza disc, wherever it is configured */}
      <group position={[px, 0, pz]}>
        <Fountain />
        {LAMP_ANGLES.map((angle) => (
          <Lamp key={angle} angle={angle} />
        ))}
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
