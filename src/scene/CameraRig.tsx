import { useEffect, useRef, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import { easing } from 'maath'
import { getFootprint } from './archetypes'
import { useCityStore } from '@/state/store'

/**
 * Orbit camera rig: damped orbit controls plus damped "fly-to" transitions
 * for selection changes, minimap focus requests and orbit↔walk round trips.
 *
 * While a transition runs, the controls are disabled so their internal
 * damping cannot fight the camera being written every frame; they resume
 * exactly where the camera ended up (no snap-back).
 */

const FLY_TIME = 0.4
const ARRIVAL_EPS = 0.01 // squared distance considered "arrived"

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

interface Transition {
  pos: Vector3
  look: Vector3
}

export function CameraRig() {
  const mode = useCityStore((s) => s.mode)
  const dragging = useCityStore((s) => s.dragging)
  const city = useCityStore((s) => s.city)
  const selectedId = useCityStore((s) => s.selectedId)
  const focusRequest = useCityStore((s) => s.focusRequest)
  const camera = useThree((s) => s.camera)

  const controlsRef = useRef<OrbitControlsImpl>(null)
  const transition = useRef<Transition | null>(null)
  const savedOrbit = useRef<Transition | null>(null)
  const dirTmp = useRef(new Vector3())

  /** Horizontal bearing from the current orbit target toward the camera. */
  const bearing = () => {
    const controls = controlsRef.current
    const dir = dirTmp.current.copy(camera.position)
    if (controls) dir.sub(controls.target)
    dir.y = 0
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 1)
    return dir.normalize()
  }

  // Fly to a newly selected place (or the plaza).
  useEffect(() => {
    const store = useCityStore.getState()
    if (store.editing || store.mode !== 'orbit') return
    if (!selectedId) {
      // Deselect: stop any in-flight transition, camera stays put.
      transition.current = null
      return
    }
    let tx: number
    let tz: number
    let radius: number
    let height: number
    if (selectedId === city.plaza.contentId) {
      tx = city.plaza.position[0]
      tz = city.plaza.position[1]
      radius = 11
      height = 4
    } else {
      const place = city.places.find((p) => p.id === selectedId)
      if (!place) return
      const fp = getFootprint(place.building)
      tx = place.position[0]
      tz = place.position[1]
      radius = fp.radius * place.scale
      height = fp.height * place.scale
    }
    const dir = bearing()
    const dist = radius * 2.2 + 11
    transition.current = {
      pos: new Vector3(tx + dir.x * dist, 0.5 + height * 0.9 + 5, tz + dir.z * dist),
      look: new Vector3(tx, 0.5 + height * 0.5, tz),
    }
  }, [selectedId, city, camera])

  // Fly to a minimap focus request: high overview of the requested spot.
  useEffect(() => {
    if (!focusRequest) return
    const store = useCityStore.getState()
    if (store.editing || store.mode !== 'orbit') return
    const { x, z } = focusRequest
    const dir = bearing()
    transition.current = {
      pos: new Vector3(x + dir.x * 55, 38, z + dir.z * 55),
      look: new Vector3(x, 2, z),
    }
  }, [focusRequest, camera])

  // Park the orbit camera when leaving to walk mode, restore it damped later.
  useEffect(() => {
    const controls = controlsRef.current
    if (mode === 'walk') {
      if (controls) {
        savedOrbit.current = {
          pos: camera.position.clone(),
          look: controls.target.clone(),
        }
      }
      transition.current = null
    } else {
      const saved = savedOrbit.current
      if (saved) transition.current = { pos: saved.pos.clone(), look: saved.look.clone() }
    }
  }, [mode, camera])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return
    const t = transition.current
    if (t) {
      easing.damp3(camera.position, t.pos, FLY_TIME, delta)
      easing.damp3(controls.target, t.look, FLY_TIME, delta)
      camera.lookAt(controls.target)
      if (
        camera.position.distanceToSquared(t.pos) < ARRIVAL_EPS &&
        controls.target.distanceToSquared(t.look) < ARRIVAL_EPS
      ) {
        camera.position.copy(t.pos)
        controls.target.copy(t.look)
        transition.current = null
      }
    }
    // Controls enabled only in orbit mode, outside drags and transitions.
    controls.enabled = mode === 'orbit' && !dragging && !transition.current
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={16}
      maxDistance={180}
      minPolarAngle={0.12}
      maxPolarAngle={1.34}
      target={[0, 2, 0]}
    />
  )
}
