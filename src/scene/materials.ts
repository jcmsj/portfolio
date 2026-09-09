import { DoubleSide, FrontSide, MeshStandardMaterial } from 'three'

/**
 * Module-level cache for MeshStandardMaterials.
 *
 * The scene used to create one `meshStandardMaterial` instance per mesh
 * (~300 materials, ~14 shader programs, heavy per-material JS overhead).
 * Materials here are keyed by every visual option, so meshes that would
 * render identically share ONE material instance. Nothing that is mutated
 * per frame (workshop smoke puffs, the radio mast beacon) may go through
 * this cache.
 */

export interface StandardMaterialOptions {
  color?: string
  roughness?: number
  metalness?: number
  flatShading?: boolean
  transparent?: boolean
  opacity?: number
  emissive?: string
  emissiveIntensity?: number
  /** THREE.FrontSide (0, default) or THREE.DoubleSide (2). */
  side?: 0 | 2
  /** Extra metadata stamped on the material (kept out of render params). */
  userData?: Record<string, unknown>
}

const cache = new Map<string, MeshStandardMaterial>()

/** Stable serialization for the userData option (sorted keys). */
function serializeUserData(data: Record<string, unknown>): string {
  const entries = Object.entries(data)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

export function getStandardMaterial(opts: StandardMaterialOptions = {}): MeshStandardMaterial {
  const key = [
    opts.color ?? '#ffffff',
    opts.roughness ?? 1,
    opts.metalness ?? 0,
    opts.flatShading ?? false,
    opts.transparent ?? false,
    opts.opacity ?? 1,
    opts.emissive ?? '#000000',
    opts.emissiveIntensity ?? 1,
    opts.side ?? 0,
    opts.userData ? serializeUserData(opts.userData) : '',
  ].join('|')

  let material = cache.get(key)
  if (!material) {
    material = new MeshStandardMaterial({
      color: opts.color ?? '#ffffff',
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
      flatShading: opts.flatShading ?? false,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side === 2 ? DoubleSide : FrontSide,
    })
    if (opts.userData) Object.assign(material.userData, opts.userData)
    cache.set(key, material)
  }
  return material
}
