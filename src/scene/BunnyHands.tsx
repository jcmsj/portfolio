import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { RUN_SPEED, walkTelemetry } from './bhop'
import { walkInput } from './walkInput'
import { useCityStore } from '@/state/store'

/**
 * First-person pompom-bunny costume: two fluffy pom-poms (not skeletal FPS
 * hands) glued to the camera while walking, each wearing floppy plush ears.
 * Idle breathing, alternating punches while moving, "ears-up" pose in the
 * air, and a punch + carrot puff on every chained bunny hop.
 *
 * Geometry is a deterministic cluster of flat-shaded spheres so the silhouette
 * reads as soft fluff and matches the city's low-poly look. Children sit past
 * the near plane with depthTest off so scene geometry never slices the puffs.
 */

const FUR = '#fbf5f0'
const FUR_SHADE = '#f3e8e1'
const FUR_WARM = '#fff7f2'
const INNER_EAR = '#f2a7c3'
const CARROT = '#f59e0b'

const PUNCH_DECAY = 6
const AIR_LERP = 10
const CARROT_POOL = 10
const CARROT_LIFE = 0.5

/**
 * One pompom = center ball + offset lobes. Offsets are fixed (not random)
 * so the fluff silhouette is stable across remounts.
 */
const PUFF_LOBES: [number, number, number, number][] = [
  [0, 0, 0, 1.0],
  [0.075, 0.035, 0.02, 0.72],
  [-0.07, 0.045, 0.015, 0.7],
  [0.01, 0.085, -0.03, 0.68],
  [0.03, -0.05, 0.06, 0.66],
  [-0.04, -0.055, 0.04, 0.64],
  [0.06, 0.01, -0.07, 0.58],
  [-0.055, 0.02, -0.065, 0.56],
  [0.0, -0.02, -0.09, 0.55],
  [0.05, 0.06, 0.05, 0.5],
  [-0.045, 0.065, 0.045, 0.48],
  [0.0, 0.02, 0.08, 0.52],
]

function Puff({ tone = 0 }: { tone?: 0 | 1 }) {
  return (
    <group>
      {PUFF_LOBES.map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} scale={s} renderOrder={999}>
          <sphereGeometry args={[0.115, 12, 10]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? FUR_WARM : i % 3 === 1 ? FUR : FUR_SHADE}
            flatShading
            depthTest={false}
          />
        </mesh>
      ))}
      {/* soft pink under-fluff — only peeks from below, not a "pad bean" */}
      <mesh position={[0, -0.07, 0.01]} scale={[0.85, 0.45, 0.7]} renderOrder={998}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial
          color={tone ? '#f7c4d6' : INNER_EAR}
          flatShading
          depthTest={false}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  )
}

/** Floppy plush ear: three stacked ellipsoids, thicker at the base. */
function Ear() {
  return (
    <group>
      <mesh position={[0, 0, 0]} scale={[1, 0.75, 1.55]} renderOrder={998}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color={FUR} flatShading depthTest={false} />
      </mesh>
      <mesh position={[0, 0.01, -0.07]} scale={[0.9, 0.7, 1.5]} renderOrder={998}>
        <sphereGeometry args={[0.038, 10, 8]} />
        <meshStandardMaterial color={FUR_WARM} flatShading depthTest={false} />
      </mesh>
      <mesh position={[0, 0.005, -0.12]} scale={[0.75, 0.55, 1.2]} renderOrder={998}>
        <sphereGeometry args={[0.028, 8, 6]} />
        <meshStandardMaterial color={INNER_EAR} flatShading depthTest={false} />
      </mesh>
    </group>
  )
}

export function BunnyHands() {
  const mode = useCityStore((s) => s.mode)
  const showPaws = useCityStore((s) => s.showPaws)
  const camera = useThree((s) => s.camera)

  const follow = useRef<Group>(null)
  const leftPuff = useRef<Group>(null)
  const rightPuff = useRef<Group>(null)
  const leftEar = useRef<Group>(null)
  const rightEar = useRef<Group>(null)
  const carrotRefs = useRef<(Mesh | null)[]>([])
  const anim = useRef({
    air: 0,
    punch: 0,
    earTilt: 0,
    stride: 0,
    lastHop: walkTelemetry.lastHopAt,
    carrots: Array.from({ length: CARROT_POOL }, () => ({
      life: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    })),
  })

  const visible = mode === 'walk' && showPaws

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const g = follow.current
    if (!visible || !g) return

    const a = anim.current
    const t = performance.now() / 1000
    const hs = walkTelemetry.speed
    const airbornenow = walkTelemetry.airborne

    // Hop edge → punch + carrot puff.
    if (walkTelemetry.lastHopAt !== a.lastHop) {
      a.lastHop = walkTelemetry.lastHopAt
      a.punch = 1
      for (let n = 0; n < 3; n++) {
        const c = a.carrots.find((c) => c.life <= 0)
        if (!c) break
        const mesh = carrotRefs.current[a.carrots.indexOf(c)]
        if (mesh) {
          mesh.position.set((Math.random() - 0.5) * 0.5, -0.26 + Math.random() * 0.08, -0.85)
        }
        c.life = 1
        c.vx = (Math.random() - 0.5) * 0.7
        c.vy = 0.7 + Math.random() * 0.7
        c.vz = -0.5 - Math.random() * 0.9
      }
    }

    a.punch *= Math.exp(-PUNCH_DECAY * dt)
    a.air += ((airbornenow ? 1 : 0) - a.air) * Math.min(1, AIR_LERP * dt)
    // Ears flop back with speed (spring toward target).
    const earTarget = -Math.max(0, Math.min(1, (hs - RUN_SPEED) / RUN_SPEED)) * 0.9
    a.earTilt += (earTarget - a.earTilt) * Math.min(1, 6 * dt)
    // Stride only while grounded and actually moving.
    if (!airbornenow) a.stride += dt * (2.2 + hs * 0.55)

    // Rig follows the camera exactly.
    g.position.copy(camera.position)
    g.quaternion.copy(camera.quaternion)

    const bob = Math.sin(t * 1.8) * 0.01
    const sway = walkInput.x * 0.12
    const lift = a.air * 0.12
    const punchZ = a.punch * 0.1
    const moveAmt = Math.min(1, hs / RUN_SPEED)
    // Soft squash-and-stretch on the punch so the pompom feels plush.
    const sq = 1 + a.punch * 0.2

    for (const [puff, side, phase] of [
      [leftPuff.current, -1, 0],
      [rightPuff.current, 1, Math.PI],
    ] as const) {
      if (!puff) continue
      const stride = Math.sin(a.stride + phase) * moveAmt * (1 - a.air)
      puff.position.set(
        side * 0.34 + sway * -side * 0.35,
        -0.28 + bob + lift + Math.abs(stride) * 0.02,
        -0.88 + stride * 0.05 + punchZ * (side < 0 ? 1 : 0.85),
      )
      puff.rotation.set(
        0.22 - a.air * 0.5 + a.punch * 0.22 + stride * 0.06,
        side * -0.2 + sway * 0.5,
        side * (0.1 + sway * 0.6),
      )
      puff.scale.set(1 / sq, 1 / sq, sq)
    }
    for (const ear of [leftEar.current, rightEar.current]) {
      if (!ear) continue
      ear.rotation.x =
        -0.55 + a.earTilt + a.air * 0.55 + Math.sin(t * 6) * 0.05 * Math.min(1, hs / RUN_SPEED)
      ear.rotation.z = Math.sin(t * 3.1) * 0.06 * (1 + Math.min(1.5, hs / RUN_SPEED))
      // Drop ears with speed so they stream behind like plush flaps.
      ear.position.y = -0.02 + a.earTilt * 0.04
    }

    // Carrot particles (camera-space emission).
    a.carrots.forEach((c, i) => {
      const mesh = carrotRefs.current[i]
      if (!mesh) return
      if (c.life <= 0) {
        mesh.scale.setScalar(0)
        return
      }
      c.life -= dt / CARROT_LIFE
      c.vy -= 2.6 * dt
      mesh.position.x += c.vx * dt
      mesh.position.y += c.vy * dt
      mesh.position.z += c.vz * dt
      mesh.rotation.x += dt * 7
      mesh.rotation.z += dt * 5
      mesh.scale.setScalar(Math.max(0.001, c.life) * 1.4)
    })
  })

  if (!visible) return null

  return (
    <group ref={follow}>
      {/* tiny camera light so the fluff reads regardless of sun angle */}
      <pointLight position={[0, 0.35, 0.1]} intensity={2.2} distance={2.4} decay={2} />
      <group ref={leftPuff}>
        <Puff />
        {/* ears hang off the back of the pompom, not as antennae */}
        <group ref={leftEar} position={[-0.06, 0.06, 0.12]} rotation-x={-0.55}>
          <Ear />
        </group>
      </group>
      <group ref={rightPuff}>
        <Puff tone={1} />
        <group ref={rightEar} position={[0.06, 0.06, 0.12]} rotation-x={-0.55}>
          <Ear />
        </group>
      </group>
      {Array.from({ length: CARROT_POOL }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            carrotRefs.current[i] = m
          }}
          scale={0}
          renderOrder={997}
        >
          <coneGeometry args={[0.022, 0.07, 6]} />
          <meshStandardMaterial color={CARROT} flatShading depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}
