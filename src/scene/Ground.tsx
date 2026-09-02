import { DoubleSide } from 'three'
import { getStandardMaterial } from './materials'

/**
 * Circular grass island, sand rim and surrounding water.
 * Island top sits exactly at y = 0. Materials come from the shared cache;
 * the island cylinder keeps its three-material side/top/bottom groups.
 */

const DIRT_MAT = getStandardMaterial({ color: '#b58a5f', roughness: 1, flatShading: true })
const GRASS_MAT = getStandardMaterial({ color: '#9ec97f', roughness: 1, flatShading: true })
const CLIFF_MAT = getStandardMaterial({ color: '#a87f56', roughness: 1, flatShading: true })
const SAND_MAT = getStandardMaterial({ color: '#e8d5a3', roughness: 1, side: DoubleSide })
const WATER_MAT = getStandardMaterial({ color: '#6db3d5', roughness: 0.35 })

/** Cylinder material groups: [side, top cap, bottom cap]. */
const ISLAND_MATS = [DIRT_MAT, GRASS_MAT, CLIFF_MAT]

export function Ground() {
  return (
    <group>
      {/* Island: grass top cap + dirt sides via cylinder material groups */}
      <mesh position-y={-1} receiveShadow material={ISLAND_MATS} dispose={null}>
        <cylinderGeometry args={[85, 85, 2, 48]} />
      </mesh>

      {/* Sand ring at the rim */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} receiveShadow material={SAND_MAT} dispose={null}>
        <ringGeometry args={[84.8, 87.6, 64]} />
      </mesh>

      {/* Water */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.35} material={WATER_MAT} dispose={null}>
        <circleGeometry args={[400, 64]} />
      </mesh>
    </group>
  )
}
