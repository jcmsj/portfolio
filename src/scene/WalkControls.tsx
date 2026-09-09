import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { Euler, Mesh, Quaternion, Vector3 } from 'three'
import { getFootprint } from './archetypes'
import { buildPropObstacles } from './propSpots'
import { resetWalkInput, sceneClickSuppressed, suppressSceneClick, walkInput } from './walkInput'
import { useCityStore } from '@/state/store'
import { useMediaQuery } from '@/ui/hooks'

/**
 * Walk mode: first-person strolling.
 *  - fine pointers: pointer-lock mouse look + WASD/arrow keys (shift = run)
 *  - coarse pointers: joystick move + drag look + tap the ground to auto-walk
 *
 * The player capsule collides with building footprints, decorative props,
 * the fountain and the island rim; eye height rises on district platforms
 * and the plaza paving.
 */

const EYE_HEIGHT = 2.0
const WALK_SPEED = 9
const RUN_SPEED = 16
const ISLAND_LIMIT = 81
const FOUNTAIN_RADIUS = 3.5
const PLAZA_RADIUS = 11
const PLAZA_LIFT = 0.35
const PLATFORM_LIFT = 0.5
const KEY_DAMPING = 8
const LOOK_SENS = 0.005
const PITCH_LIMIT = 1.25
const LOOK_DRAG_PX = 8

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

interface Walker {
  pos: Vector3
  /** Camera orientation kept across walk sessions. */
  quat: Quaternion
  keys: Set<string>
  shift: boolean
  eye: number
  dest: { x: number; z: number } | null
  initialized: boolean
}

interface Obstacle {
  x: number
  z: number
  r: number
}

export function WalkControls() {
  const mode = useCityStore((s) => s.mode)
  const city = useCityStore((s) => s.city)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const active = mode === 'walk'

  const isDesktop = useMediaQuery('(pointer: fine)')

  const plcRef = useRef<ComponentRef<typeof PointerLockControls>>(null)
  const markerRef = useRef<Mesh>(null)
  const [dest, setDest] = useState<{ x: number; z: number; y: number } | null>(null)

  const walker = useRef<Walker>({
    pos: new Vector3(0, 0, 18),
    quat: new Quaternion(),
    keys: new Set(),
    shift: false,
    eye: EYE_HEIGHT,
    dest: null,
    initialized: false,
  })

  const forward = useRef(new Vector3())
  const rightV = useRef(new Vector3())
  const upV = useRef(new Vector3(0, 1, 0))
  const eulerTmp = useRef(new Euler(0, 0, 0, 'YXZ'))

  const obstacles = useMemo<Obstacle[]>(
    () => [
      ...city.places.map((p) => ({
        x: p.position[0],
        z: p.position[1],
        r: getFootprint(p.building).radius * p.scale + 1.4,
      })),
      { x: city.plaza.position[0], z: city.plaza.position[1], r: FOUNTAIN_RADIUS },
      // Trees, lamps, benches, hydrants — same deterministic spots Props draws.
      ...buildPropObstacles(city),
    ],
    [city],
  )

  const groundHeight = useMemo(() => {
    const zones = city.zones
    const [px, pz] = city.plaza.position
    return (x: number, z: number) => {
      let h = 0
      if (Math.hypot(x - px, z - pz) <= PLAZA_RADIUS) h = PLAZA_LIFT
      for (const zone of zones) {
        if (Math.hypot(x - zone.position[0], z - zone.position[1]) <= zone.radius) {
          h = Math.max(h, PLATFORM_LIFT)
          break
        }
      }
      return h
    }
  }, [city])

  /** Push the walker out of obstacles + island rim along penetration normals. */
  const resolve = (pos: Vector3) => {
    const dc = Math.hypot(pos.x, pos.z)
    if (dc > ISLAND_LIMIT) {
      pos.x *= ISLAND_LIMIT / dc
      pos.z *= ISLAND_LIMIT / dc
    }
    for (const o of obstacles) {
      const dx = pos.x - o.x
      const dz = pos.z - o.z
      const d = Math.hypot(dx, dz)
      if (d < o.r) {
        if (d < 1e-4) {
          pos.x = o.x + o.r
        } else {
          pos.x = o.x + (dx / d) * o.r
          pos.z = o.z + (dz / d) * o.r
        }
      }
    }
  }

  useFrame((state, delta) => {
    // Destination marker pulse (also runs while inactive — mesh is null then).
    const marker = markerRef.current
    if (marker) marker.scale.setScalar(1 + 0.12 * Math.sin(state.clock.elapsedTime * 4.2))
    if (!active) return

    const w = walker.current
    const k = w.keys
    const keyFwd =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const keyStrafe =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    // Joystick analog wins when non-zero; keyboard remains ±1 / diagonal.
    const fwd = walkInput.y !== 0 ? walkInput.y : keyFwd
    const strafe = walkInput.x !== 0 ? walkInput.x : keyStrafe
    const mag = Math.hypot(fwd, strafe)
    const speed = w.shift ? RUN_SPEED : WALK_SPEED
    const locked = !isDesktop || (plcRef.current?.isLocked ?? false)

    if (isDesktop && !locked) {
      // Waiting for the pointer lock click — hold position.
    } else if (mag > 1e-4) {
      if (w.dest) {
        w.dest = null
        setDest(null)
      }
      camera.getWorldDirection(forward.current)
      forward.current.y = 0
      if (forward.current.lengthSq() < 1e-6) forward.current.set(0, 0, -1)
      forward.current.normalize()
      rightV.current.crossVectors(forward.current, upV.current)
      // Unit direction * min(1, mag): keyboard diagonal isn't faster; stick scales.
      const clamped = Math.min(1, mag)
      const step = speed * clamped * delta
      w.pos.addScaledVector(forward.current, (fwd / mag) * step)
      w.pos.addScaledVector(rightV.current, (strafe / mag) * step)
    } else if (w.dest) {
      const dx = w.dest.x - w.pos.x
      const dz = w.dest.z - w.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.3) {
        w.dest = null
        setDest(null)
      } else {
        const step = Math.min(speed * delta, d)
        w.pos.x += (dx / d) * step
        w.pos.z += (dz / d) * step
        // Turn gently toward the walking direction.
        const yaw = Math.atan2(-dx, -dz)
        const e = eulerTmp.current.setFromQuaternion(camera.quaternion)
        let diff = yaw - e.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        e.y += diff * Math.min(1, KEY_DAMPING * delta)
        e.z = 0
        camera.quaternion.setFromEuler(e)
      }
    }

    resolve(w.pos)

    const targetEye = EYE_HEIGHT + groundHeight(w.pos.x, w.pos.z)
    w.eye += (targetEye - w.eye) * Math.min(1, KEY_DAMPING * delta)
    camera.position.set(w.pos.x, w.eye, w.pos.z)
  })

  // Keyboard listeners, attached only while walking.
  useEffect(() => {
    if (!active) return
    const w = walker.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (useCityStore.getState().editing) return
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') w.shift = true
      if (MOVE_KEYS.has(e.code)) {
        w.keys.add(e.code)
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') w.shift = false
      w.keys.delete(e.code)
    }
    const onBlur = () => {
      w.keys.clear()
      w.shift = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      w.keys.clear()
      w.shift = false
    }
  }, [active])

  // While pointer-locked, the browser consumes Esc to release the lock
  // without dispatching keydown, so the HUD's Esc handler never fires. A
  // lock drop while walking with a place panel open is that Esc: close the
  // panel. Focus check excludes alt-tab, which also drops the lock.
  useEffect(() => {
    if (!active || !isDesktop) return
    const onLockChange = () => {
      if (document.pointerLockElement !== null) return
      const s = useCityStore.getState()
      if (document.hasFocus() && s.mode === 'walk' && s.selectedId !== null) s.select(null)
    }
    document.addEventListener('pointerlockchange', onLockChange)
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  }, [active, isDesktop])

  // (De)activation: restore last pose on entry, save it on exit.
  useEffect(() => {
    if (!active) return
    const w = walker.current
    if (w.initialized) {
      camera.position.set(w.pos.x, w.eye, w.pos.z)
      camera.quaternion.copy(w.quat)
    } else {
      w.initialized = true
      w.pos.set(0, 0, 18)
      w.eye = EYE_HEIGHT + groundHeight(0, 18)
      camera.position.set(0, w.eye, 18)
      camera.lookAt(0, 2, 0)
    }
    return () => {
      w.quat.copy(camera.quaternion)
      w.dest = null
      setDest(null)
      resetWalkInput()
    }
  }, [active, camera, groundHeight])

  // Coarse-pointer drag look on the canvas (joystick lives in the HTML HUD).
  useEffect(() => {
    if (!active || isDesktop) return
    const el = gl.domElement
    let pointerId: number | null = null
    let lastX = 0
    let lastY = 0
    let startX = 0
    let startY = 0
    let dragging = false

    const onDown = (e: PointerEvent) => {
      if (useCityStore.getState().editing) return
      // Primary finger only; joystick uses its own overlay.
      if (e.button !== 0 && e.pointerType === 'mouse') return
      pointerId = e.pointerId
      lastX = startX = e.clientX
      lastY = startY = e.clientY
      dragging = false
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (!dragging) {
        const total = Math.hypot(e.clientX - startX, e.clientY - startY)
        if (total < LOOK_DRAG_PX) return
        dragging = true
      }
      const eul = eulerTmp.current.setFromQuaternion(camera.quaternion, 'YXZ')
      eul.y -= dx * LOOK_SENS
      eul.x -= dy * LOOK_SENS
      eul.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, eul.x))
      eul.z = 0
      camera.quaternion.setFromEuler(eul)
    }
    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return
      if (dragging) suppressSceneClick()
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      pointerId = null
      dragging = false
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [active, isDesktop, gl, camera])

  const onTap = (event: ThreeEvent<MouseEvent>) => {
    if (!active || isDesktop) return
    if (sceneClickSuppressed()) return
    const x = event.point.x
    const z = event.point.z
    const dc = Math.hypot(x, z)
    const k = dc > ISLAND_LIMIT - 2 ? (ISLAND_LIMIT - 2) / dc : 1
    const next = { x: x * k, z: z * k }
    walker.current.dest = next
    setDest({ ...next, y: groundHeight(next.x, next.z) + 0.06 })
  }

  return (
    <>
      {active && isDesktop && <PointerLockControls ref={plcRef} />}
      {active && !isDesktop && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.04} onClick={onTap}>
          <circleGeometry args={[ISLAND_LIMIT - 2, 48]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {dest && (
        <mesh
          ref={markerRef}
          rotation-x={-Math.PI / 2}
          position={[dest.x, dest.y, dest.z]}
          renderOrder={3}
        >
          <ringGeometry args={[0.55, 0.85, 24]} />
          <meshBasicMaterial color="#2e8b8b" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
