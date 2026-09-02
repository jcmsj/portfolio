import { DoubleSide } from 'three'

/**
 * Circular grass island, sand rim and surrounding water.
 * Island top sits exactly at y = 0.
 */
export function Ground() {
  return (
    <group>
      {/* Island: grass top cap + dirt sides via cylinder material groups */}
      <mesh position-y={-1} receiveShadow>
        <cylinderGeometry args={[85, 85, 2, 48]} />
        <meshStandardMaterial attach="material-0" color="#b58a5f" roughness={1} flatShading />
        <meshStandardMaterial attach="material-1" color="#9ec97f" roughness={1} flatShading />
        <meshStandardMaterial attach="material-2" color="#a87f56" roughness={1} flatShading />
      </mesh>

      {/* Sand ring at the rim */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} receiveShadow>
        <ringGeometry args={[84.8, 87.6, 64]} />
        <meshStandardMaterial color="#e8d5a3" roughness={1} side={DoubleSide} />
      </mesh>

      {/* Water */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.35}>
        <circleGeometry args={[400, 64]} />
        <meshStandardMaterial color="#6db3d5" roughness={0.35} />
      </mesh>
    </group>
  )
}
