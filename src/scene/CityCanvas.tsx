import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { DragLayer } from '@/editor/DragLayer'
import { useCityStore } from '@/state/store'
import { Lights } from './Lights'
import { SceneRoot } from './SceneRoot'

/**
 * The 3D viewport: a fixed daytime camera rig around the low-poly island.
 * Fog + background share one sky tone so the horizon melts into the sky.
 */
export function CityCanvas() {
  const editing = useCityStore((s) => s.editing)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, position: [70, 55, 70], near: 0.5, far: 600 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#cfe8f7']} />
      <fog attach="fog" args={['#cfe8f7', 130, 420]} />
      <Suspense fallback={null}>
        <Lights />
        <SceneRoot />
        {editing && <DragLayer />}
      </Suspense>
    </Canvas>
  )
}
