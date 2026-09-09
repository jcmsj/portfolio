import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { DragLayer } from '@/editor/DragLayer'
import { useCityStore } from '@/state/store'
import { Lights } from './Lights'
import { SceneRoot } from './SceneRoot'
import { ShadowTick } from './ShadowTick'

/**
 * The 3D viewport: a fixed daytime camera rig around the low-poly island.
 * Fog + background share one sky tone so the horizon melts into the sky.
 *
 * DPR is intentionally STATIC: a PerformanceMonitor-driven adaptive dpr was
 * tried and reverted — every dpr step reallocates the antialiased drawing
 * buffer, and that churn wedged the macOS compositor into a ~1Hz frame
 * cadence. Static resolution + the draw-call reduction keeps 60fps.
 */

export function CityCanvas() {
  const editing = useCityStore((s) => s.editing)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, position: [70, 55, 70], near: 0.5, far: 600 }}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        // The sun is fixed and the city static: bake the shadow map on demand
        // (ShadowTick re-arms it) instead of re-rendering it every frame.
        gl.shadowMap.autoUpdate = false
        gl.shadowMap.needsUpdate = true
        // Dev-only: expose renderer stats for perf tuning via `window.__cityGL`.
        if (import.meta.env.DEV) {
          ;(window as unknown as Record<string, unknown>).__cityGL = gl
        }
      }}
    >
      <color attach="background" args={['#cfe8f7']} />
      <fog attach="fog" args={['#cfe8f7', 130, 420]} />
      <Suspense fallback={null}>
        <Lights />
        <ShadowTick />
        <SceneRoot />
        <Preload all />
        {editing && <DragLayer />}
      </Suspense>
    </Canvas>
  )
}
