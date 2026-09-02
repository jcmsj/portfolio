import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useCityStore } from '@/state/store'

/**
 * On-demand shadow-map baking for the fixed daytime sun.
 *
 * The city is static geometry, so the shadow map is baked once and then
 * refreshed on a slow cadence instead of every frame (the shadow pass is
 * roughly half of all draw calls). Animated casters (smoke, crane jib,
 * fountain) are tiny, so their shadows lag a little at the idle cadence —
 * an acceptable trade. While the editor is active (or a drag is in flight)
 * buildings may move every frame, so we re-bake every frame instead.
 */

/** Re-bake the shadow map every N idle frames. */
const REFRESH_EVERY = 8

export function ShadowTick() {
  const gl = useThree((s) => s.gl)
  // New identity on every editor mutation (updateCity structuredClone) and
  // on enter/exit of the editing session — exactly the "config changed" moments.
  const city = useCityStore((s) => s.city)
  const frame = useRef(0)

  // Bake on mount and re-bake immediately whenever the city config changes,
  // so live editor edits (which also move geometry) keep correct shadows.
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
  }, [gl, city])

  useFrame(() => {
    // Imperative read: never subscribe to these flags per frame.
    const { dragging, editing } = useCityStore.getState()
    if (dragging || editing) {
      gl.shadowMap.needsUpdate = true
      return
    }
    frame.current++
    if (frame.current % REFRESH_EVERY === 0) {
      // Re-rendered on the next frame; three resets the flag afterwards.
      gl.shadowMap.needsUpdate = true
    }
  })

  return null
}
