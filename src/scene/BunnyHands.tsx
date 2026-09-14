import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { RUN_SPEED, walkTelemetry } from './bhop'
import { walkInput } from './walkInput'
import { useCityStore } from '@/state/store'

/**
 * First-person bunny-paw costume: a pair of procedural low-poly paws glued
 * to the camera while walking. Idle breathing bob, alternating paw-punches
 * while moving, "ears-up" pose in the air and a punch + carrot puff on every
 * successfully chained bunny hop (walkTelemetry.lastHopAt edge).
 *
 * The rig copies the camera transform each frame and keeps its children in
 * camera space, sitting past the near plane (0.5) and drawn last with
 * depthTest off, so scene geometry never slices through the paws.
 */

const FUR = '#fbf6f2'
const PAD_PINK = '#f2a7c3'
const INNER_EAR = '#f6b8cf'
const CARROT = '#f59e0b'

const PUNCH_DECAY = 6
const AIR_LERP = 10
const CARROT_POOL = 10
const CARROT_LIFE = 0.5

function Paw() {
  return (
    <group>
      {/* wrist cuff */}
      <mesh position={[0, 0, 0.16]} rotation-x={Math.PI / 2} renderOrder={999}>
        <cylinderGeometry args={[0.115, 0.135, 0.16, 14]} />
        <meshStandardMaterial color={FUR} flatShading depthTest={false} />
      </mesh>
      {/* palm */}
      <mesh scale={[1, 0.72, 1.3]} renderOrder={999}>
        <sphereGeometry args={[0.1, 14, 12]} />
        <meshStandardMaterial color={FUR} flatShading depthTest={false} />
      </mesh>
      {/* four toes in a shallow arc, pink beans at the tips */}
      {[-0.069, -0.023, 0.023, 0.069].map((tx, i) => (
        <group key={i} position={[tx, 0.012 - Math.abs(tx) * 0.18, -0.115]}>
          <mesh rotation-x={Math.PI / 2} renderOrder={999}>
            <capsuleGeometry args={[0.026, 0.05, 3, 8]} />
            <meshStandardMaterial color={FUR} flatShading depthTest={false} />
          </mesh>
          <mesh position={[0, 0, -0.045]} renderOrder={999}>
            <sphereGeometry args={[0.02, 10, 8]} />
            <meshStandardMaterial color={PAD_PINK} flatShading depthTest={false} />
          </mesh>
        </group>
      ))}
      {/* big palm bean */}
      <mesh position={[0, -0.035, -0.02]} renderOrder={999}>
        <sphereGeometry args={[0.038, 10, 8]} />
        <meshStandardMaterial color={PAD_PINK} flatShading depthTest={false} />
      </mesh>
    </group>
  )
}

function Ear({ inner }: { inner?: boolean }) {
  return (
    <mesh rotation-x={Math.PI / 2} renderOrder={998}>
      <capsuleGeometry args={inner ? [0.02, 0.14, 3, 8] : [0.035, 0.17, 3, 8]} />
      <meshStandardMaterial
        color={inner ? INNER_EAR : FUR}
        flatShading
        depthTest={false}
        transparent={inner}
      />
    </mesh>
  )
}

export function BunnyHands() {
  const mode = useCityStore((s) => s.mode)
  const showPaws = useCityStore((s) => s.showPaws)
  const camera = useThree((s) => s.camera)

  const follow = useRef<Group>(null)
  const leftPaw = useRef<Group>(null)
  const rightPaw = useRef<Group>(null)
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

    const bob = Math.sin(t * 1.8) * 0.008
    const sway = walkInput.x * 0.12
    const lift = a.air * 0.1
    const punchZ = a.punch * 0.085
    const moveAmt = Math.min(1, hs / RUN_SPEED)

    for (const [paw, side, phase] of [
      [leftPaw.current, -1, 0],
      [rightPaw.current, 1, Math.PI],
    ] as const) {
      if (!paw) continue
      const stride = Math.sin(a.stride + phase) * moveAmt * (1 - a.air)
      paw.position.set(
        side * 0.33 + sway * -side * 0.4,
        -0.3 + bob + lift + Math.abs(stride) * 0.015,
        -0.9 + stride * 0.05 + punchZ * (side < 0 ? 1 : 0.85),
      )
      paw.rotation.set(
        0.3 - a.air * 0.55 + a.punch * 0.18 + stride * 0.06,
        side * -0.18 + sway * 0.5,
        side * (0.12 + sway * 0.6),
      )
    }
    for (const ear of [leftEar.current, rightEar.current]) {
      if (!ear) continue
      ear.rotation.x = -0.25 + a.earTilt + a.air * 0.35 + Math.sin(t * 6) * 0.04 * Math.min(1, hs / RUN_SPEED)
      ear.rotation.z = Math.sin(t * 3.1) * 0.05 * (1 + Math.min(1.5, hs / RUN_SPEED))
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
      {/* tiny camera light so the paws read regardless of sun angle */}
      <pointLight position={[0, 0.35, 0.1]} intensity={2.2} distance={2.4} decay={2} />
      <group ref={leftPaw}>
        <Paw />
        <group ref={leftEar} position={[-0.045, 0.1, 0.22]}>
          <Ear />
          <mesh position={[0, 0, -0.018]} renderOrder={998}>
            <capsuleGeometry args={[0.018, 0.13, 3, 8]} />
            <meshStandardMaterial color={INNER_EAR} flatShading depthTest={false} />
          </mesh>
        </group>
      </group>
      <group ref={rightPaw}>
        <Paw />
        <group ref={rightEar} position={[0.045, 0.1, 0.22]}>
          <Ear />
          <mesh position={[0, 0, -0.018]} renderOrder={998}>
            <capsuleGeometry args={[0.018, 0.13, 3, 8]} />
            <meshStandardMaterial color={INNER_EAR} flatShading depthTest={false} />
          </mesh>
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
