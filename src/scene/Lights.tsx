import { Sky } from '@react-three/drei'

/** Daytime lighting rig + sky dome. Shadows come from a single sun. */
export function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#bfe3ff', '#9ec97f', 0.45]} />
      <directionalLight
        position={[40, 60, 20]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={10}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
      />
      <Sky sunPosition={[80, 35, -60]} />
    </>
  )
}
