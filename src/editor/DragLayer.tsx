import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { DoubleSide, type Object3D } from 'three'
import { useCityStore } from '@/state/store'
import { getFootprint } from '@/scene/archetypes'
import { applySnap, editorShared } from './editorShared'

/**
 * In-canvas drag layer, mounted by the scene only while the editor is active.
 *
 * A huge invisible plane slightly above the ground catches every press on the
 * island: the nearest place (by x/z footprint distance) is grabbed and then
 * follows the pointer each animation frame (throttled through a ref + useFrame
 * so updateCity's structuredClone runs at most once per frame). Zone anchors
 * are rendered as small draggable discs in the zone color.
 */

interface Grab {
  kind: 'place' | 'zone'
  id: string
  moved: boolean
  startX: number
  startY: number
}

/** Extra grab reach around a place's footprint, in world units. */
const GRAB_PAD = 2
/** Pointer travel (px) before a press counts as a drag instead of a click. */
const CLICK_SLOP_PX = 3
/** How long click-select stays suppressed after a real drag. */
const CLICK_SUPPRESS_MS = 250

export function DragLayer() {
  const zones = useCityStore((s) => s.city.zones)

  const grab = useRef<Grab | null>(null)
  const pending = useRef<{ x: number; z: number } | null>(null)
  const releaseTimer = useRef(0)

  function beginGrab(kind: 'place' | 'zone', id: string, event: ThreeEvent<PointerEvent>) {
    grab.current = {
      kind,
      id,
      moved: false,
      startX: event.nativeEvent.clientX,
      startY: event.nativeEvent.clientY,
    }
    window.clearTimeout(releaseTimer.current)
    const store = useCityStore.getState()
    store.setDragging(true)
    store.select(id)
    document.body.style.cursor = 'grabbing'
  }

  function finishDrag() {
    const grabbed = grab.current
    if (!grabbed) return
    grab.current = null
    pending.current = null
    document.body.style.cursor = ''
    if (grabbed.moved) {
      // Keep `dragging` (and justDraggedUntil) briefly past the pointerup so
      // the click that follows the drag is swallowed instead of re-selecting.
      editorShared.justDraggedUntil = performance.now() + CLICK_SUPPRESS_MS
      window.clearTimeout(releaseTimer.current)
      releaseTimer.current = window.setTimeout(() => {
        if (!grab.current) useCityStore.getState().setDragging(false)
      }, CLICK_SUPPRESS_MS + 50)
    } else {
      useCityStore.getState().setDragging(false)
    }
  }

  useEffect(() => {
    const onPointerUp = () => finishDrag()
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.clearTimeout(releaseTimer.current)
      if (grab.current) {
        grab.current = null
        useCityStore.getState().setDragging(false)
      }
      document.body.style.cursor = ''
    }
  }, [])

  // Apply the latest pointer position at most once per animation frame.
  useFrame(() => {
    const grabbed = grab.current
    const point = pending.current
    if (!grabbed || !point) return
    pending.current = null
    const x = applySnap(point.x)
    const z = applySnap(point.z)
    useCityStore.getState().updateCity((draft) => {
      if (grabbed.kind === 'place') {
        const place = draft.places.find((p) => p.id === grabbed.id)
        if (place) place.position = [x, z]
      } else {
        const zone = draft.zones.find((zn) => zn.id === grabbed.id)
        if (zone) zone.position = [x, z]
      }
    })
  })

  /** Walk up the scene graph to find a building group tagged by the scene. */
  function findTaggedPlaceId(object: Object3D): string | null {
    let o: Object3D | null = object
    while (o) {
      if (typeof o.userData?.placeId === 'string') return o.userData.placeId
      o = o.parent
    }
    return null
  }

  const onPlanePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (grab.current) return
    const store = useCityStore.getState()
    if (!store.editing) return

    // Direct grab when the press lands on a building's body (the ray through
    // a tall building would otherwise hit the ground plane far behind it).
    for (const hit of event.intersections) {
      const placeId = findTaggedPlaceId(hit.object)
      if (placeId && store.city.places.some((p) => p.id === placeId)) {
        event.stopPropagation()
        beginGrab('place', placeId, event)
        return
      }
    }

    const x = event.point.x
    const z = event.point.z
    let best: { id: string; dist: number } | null = null
    for (const place of store.city.places) {
      const reach = getFootprint(place.building).radius * place.scale + GRAB_PAD
      const dist = Math.hypot(place.position[0] - x, place.position[1] - z)
      if (dist <= reach && (!best || dist < best.dist)) best = { id: place.id, dist }
    }
    // Empty ground: leave the press to the orbit controls.
    if (!best) return
    event.stopPropagation()
    beginGrab('place', best.id, event)
  }

  const onPlanePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const grabbed = grab.current
    if (!grabbed) return
    if (!grabbed.moved) {
      const dx = event.nativeEvent.clientX - grabbed.startX
      const dy = event.nativeEvent.clientY - grabbed.startY
      if (Math.hypot(dx, dy) > CLICK_SLOP_PX) grabbed.moved = true
    }
    if (grabbed.moved) {
      pending.current = { x: event.point.x, z: event.point.z }
      event.stopPropagation()
    }
  }

  const onPointerUpWhileGrabbed = (event: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return
    event.stopPropagation()
    finishDrag()
  }

  const grabZone = (id: string) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (grab.current) return
    beginGrab('zone', id, event)
  }

  const discHover = (over: boolean) => () => {
    if (grab.current) return
    document.body.style.cursor = over ? 'grab' : ''
  }

  return (
    <group>
      {/* Invisible interaction plane: visible-but-transparent so raycasts hit
          it, slightly above the ground, low renderOrder. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.55, 0]}
        renderOrder={-10}
        onPointerDown={onPlanePointerDown}
        onPointerMove={onPlanePointerMove}
        onPointerUp={onPointerUpWhileGrabbed}
        onPointerLeave={finishDrag}
        onClick={(event) => {
          // Swallow the click that trails a real drag.
          if (performance.now() < editorShared.justDraggedUntil) event.stopPropagation()
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Zone anchor discs — grabbable markers at each zone center. */}
      {zones.map((zone) => (
        <mesh
          key={zone.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[zone.position[0], 0.62, zone.position[1]]}
          renderOrder={5}
          onPointerDown={grabZone(zone.id)}
          onPointerUp={onPointerUpWhileGrabbed}
          onPointerOver={discHover(true)}
          onPointerOut={discHover(false)}
        >
          <ringGeometry args={[1.15, 1.6, 48]} />
          <meshBasicMaterial
            color={zone.color}
            transparent
            opacity={0.85}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
