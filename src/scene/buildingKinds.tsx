import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ComponentType } from 'react'
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import type { BuildingKind } from './archetypes'
import { getStandardMaterial } from './materials'
import { PALETTE, mulberry32, shade } from './util'

/**
 * The 12 building archetypes as flat-shaded primitive compositions.
 *
 * Perf model: every archetype is described as a list of part specs (identical
 * shapes/transforms/colors to the old JSX tree). `MergedParts` bakes the
 * transforms into the geometries, groups parts by shared material and renders
 * ONE merged mesh per material bucket (~4-8 per building instead of 10-30).
 * Materials come from the shared cache in ./materials; merged geometries are
 * memoized per (kind, seed, accent, soft) so identical buildings share them.
 *
 * Animated parts stay separate: workshop smoke puffs, the harbor crane jib
 * (merged inside its rotating group) and the radio mast beacon.
 *
 * Local space: y = 0 is the platform surface, buildings face +z.
 */

type V3 = [number, number, number]

export interface ArchetypeProps {
  /** Zone-derived accent (zone color darkened ~20%). */
  accent: string
  /** Zone-derived secondary tint (lighter). */
  soft: string
  /** Deterministic per-place seed for silhouette variation. */
  seed: number
}

/* ------------------------------------------------------------------ */
/* Part specs + merging machinery                                      */
/* ------------------------------------------------------------------ */

export interface PartSpec {
  shape: 'box' | 'cyl' | 'cone' | 'sph' | 'ico' | 'ring'
  /** Color; the tokens 'accent'/'soft' resolve via the tint props. */
  c: string
  p: V3
  r?: V3
  /** box */
  size?: V3
  /** cyl */
  rt?: number
  rb?: number
  h?: number
  /** segment count (cyl default 12, cone 4, sph 10, ring 48) */
  seg?: number
  open?: boolean
  theta?: number
  /** cone/sph/ico radius; ring outer radius */
  rad?: number
  /** ring inner radius */
  innerR?: number
  /** ico subdivision detail (default 1) */
  detail?: number
  /** Resolved material params (the shape helpers fill per-shape defaults). */
  rough?: number
  metal?: number
  flat?: boolean
  transparent?: boolean
  opacity?: number
  emissive?: string
  emissiveIntensity?: number
  side?: 0 | 2
  /** Stamps userData.accent on the shared material (hover-pulse hook). */
  accent?: boolean
  /** Original window-glass flag (already folded into rough/metal defaults). */
  win?: boolean
  /** castShadow — substantial volume parts only (default: detail parts skip it). */
  cast?: boolean
  /** receiveShadow (default true). */
  receive?: boolean
}

type PartX = Partial<PartSpec>

/** Box with the JSX default material params (window glass when win). */
export const box = (c: string, size: V3, p: V3, x: PartX = {}): PartSpec => ({
  ...x,
  shape: 'box',
  c,
  size,
  p,
  rough: x.rough ?? (x.win ? 0.35 : 0.9),
  metal: x.metal ?? (x.win ? 0.15 : 0),
  flat: x.flat ?? true,
})

/** Cylinder with the JSX default material params. */
export const cyl = (c: string, rt: number, rb: number, h: number, p: V3, x: PartX = {}): PartSpec => ({
  ...x,
  shape: 'cyl',
  c,
  rt,
  rb,
  h,
  p,
  seg: x.seg ?? 12,
  rough: x.rough ?? (x.win ? 0.35 : 0.9),
  metal: x.metal ?? (x.win ? 0.15 : 0),
  flat: x.flat ?? true,
})

/** Cone (pyramid) — the old JSX pinned roughness at 0.85. */
export const cone = (c: string, rad: number, h: number, p: V3, x: PartX = {}): PartSpec => ({
  ...x,
  shape: 'cone',
  c,
  rad,
  h,
  p,
  seg: x.seg ?? 4,
  rough: x.rough ?? 0.85,
  metal: x.metal ?? 0,
  flat: x.flat ?? true,
})

/** Sphere with the JSX default material params. */
export const sph = (c: string, rad: number, p: V3, x: PartX = {}): PartSpec => ({
  ...x,
  shape: 'sph',
  c,
  rad,
  p,
  seg: x.seg ?? 10,
  rough: x.rough ?? 0.9,
  metal: x.metal ?? 0,
  flat: x.flat ?? true,
})

/** Icosahedron puff (clouds). */
export const ico = (c: string, rad: number, p: V3, x: PartX = {}): PartSpec => ({
  ...x,
  shape: 'ico',
  c,
  rad,
  p,
  detail: x.detail ?? 1,
  rough: x.rough ?? 1,
  metal: x.metal ?? 0,
  flat: x.flat ?? true,
})

/** Flat ring (RingGeometry) — paving rings etc. */
export const ring = (c: string, innerR: number, outerR: number, p: V3, x: PartX = {}): PartSpec => ({
  ...x,
  shape: 'ring',
  c,
  innerR,
  rad: outerR,
  p,
  seg: x.seg ?? 48,
  rough: x.rough ?? 1,
  metal: x.metal ?? 0,
  flat: x.flat ?? true,
})

const _pq = new Quaternion()
const _lq = new Quaternion()
const _qq = new Quaternion()
const _lp = new Vector3()
const _le = new Euler()

/**
 * World transform of a part nested inside a positioned/rotated group:
 * composes parent T·R with the local transform (same math as nested meshes).
 */
export function nest(parent: { p: V3; r?: V3 }, p: V3, r?: V3): { p: V3; r: V3 } {
  _pq.setFromEuler(_le.set(parent.r?.[0] ?? 0, parent.r?.[1] ?? 0, parent.r?.[2] ?? 0))
  _lq.setFromEuler(_le.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0))
  _qq.copy(_pq).multiply(_lq)
  _lp.set(p[0], p[1], p[2]).applyQuaternion(_pq)
  const e = new Euler().setFromQuaternion(_qq, 'XYZ')
  return {
    p: [parent.p[0] + _lp.x, parent.p[1] + _lp.y, parent.p[2] + _lp.z],
    r: [e.x, e.y, e.z],
  }
}

const _mat4 = new Matrix4()
const _quat = new Quaternion()
const _euler = new Euler()
const _pos = new Vector3()
const _unit = new Vector3(1, 1, 1)

function partGeometry(spec: PartSpec): BufferGeometry {
  let g: BufferGeometry
  switch (spec.shape) {
    case 'box':
      g = new BoxGeometry(spec.size![0], spec.size![1], spec.size![2])
      break
    case 'cyl':
      g = new CylinderGeometry(
        spec.rt!,
        spec.rb!,
        spec.h!,
        spec.seg ?? 12,
        1,
        spec.open ?? false,
        0,
        spec.theta ?? Math.PI * 2,
      )
      break
    case 'cone':
      g = new ConeGeometry(spec.rad!, spec.h!, spec.seg ?? 4)
      break
    case 'sph':
      g = new SphereGeometry(spec.rad!, spec.seg ?? 10, Math.max(6, (spec.seg ?? 10) - 2))
      break
    case 'ico':
      g = new IcosahedronGeometry(spec.rad!, spec.detail ?? 1)
      break
    case 'ring':
      g = new RingGeometry(spec.innerR!, spec.rad!, spec.seg ?? 48)
      break
  }
  // Rotation THEN translation — matches <mesh position rotation> semantics.
  _euler.set(spec.r?.[0] ?? 0, spec.r?.[1] ?? 0, spec.r?.[2] ?? 0)
  _quat.setFromEuler(_euler)
  _pos.set(spec.p[0], spec.p[1], spec.p[2])
  _mat4.compose(_pos, _quat, _unit)
  g.applyMatrix4(_mat4)
  return g
}

function resolveColor(c: string, accent?: string, soft?: string): string {
  if (accent !== undefined && c === 'accent') return accent
  if (soft !== undefined && c === 'soft') return soft
  return c
}

function specMaterial(spec: PartSpec, accent?: string, soft?: string): MeshStandardMaterial {
  const material = getStandardMaterial({
    color: resolveColor(spec.c, accent, soft),
    roughness: spec.rough ?? 1,
    metalness: spec.metal ?? 0,
    flatShading: spec.flat ?? false,
    transparent: spec.transparent,
    opacity: spec.opacity,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    side: spec.side,
  })
  if (spec.accent) material.userData.accent = true
  return material
}

interface Bucket {
  geometry: BufferGeometry
  material: MeshStandardMaterial
  cast: boolean
  receive: boolean
}

const bucketCache = new Map<string, Bucket[]>()
/** Bounds cache growth (kind × seed × zone-tint variants across editor edits). */
const BUCKET_CACHE_CAP = 160

/** Merge same-material parts into bucket geometries, memoized by cacheKey. */
function buildBuckets(cacheKey: string, parts: PartSpec[], accent?: string, soft?: string): Bucket[] {
  const hit = bucketCache.get(cacheKey)
  if (hit) return hit

  const groups = new Map<MeshStandardMaterial, { geoms: BufferGeometry[]; cast: boolean; receive: boolean }>()
  for (const spec of parts) {
    const material = specMaterial(spec, accent, soft)
    let group = groups.get(material)
    if (!group) {
      group = { geoms: [], cast: false, receive: false }
      groups.set(material, group)
    }
    group.geoms.push(partGeometry(spec))
    group.cast = group.cast || spec.cast === true
    group.receive = group.receive || spec.receive !== false
  }

  const buckets: Bucket[] = []
  for (const [material, group] of groups) {
    const geometry = group.geoms.length === 1 ? group.geoms[0] : mergeGeometries(group.geoms, false)
    if (!geometry) continue
    buckets.push({ geometry, material, cast: group.cast, receive: group.receive })
  }

  if (bucketCache.size >= BUCKET_CACHE_CAP) {
    for (const cached of bucketCache.values()) {
      for (const bucket of cached) bucket.geometry.dispose()
    }
    bucketCache.clear()
  }
  bucketCache.set(cacheKey, buckets)
  return buckets
}

function BucketMeshes({ buckets }: { buckets: Bucket[] }) {
  return (
    <>
      {buckets.map((bucket, i) => (
        <mesh
          key={i}
          geometry={bucket.geometry}
          material={bucket.material}
          castShadow={bucket.cast}
          receiveShadow={bucket.receive}
          dispose={null}
        />
      ))}
    </>
  )
}

/** Renders static parts as one merged mesh per material bucket. */
export function MergedParts({
  cacheKey,
  parts,
  accent,
  soft,
}: {
  cacheKey: string
  parts: PartSpec[]
  accent?: string
  soft?: string
}) {
  const buckets = useMemo(() => buildBuckets(cacheKey, parts, accent, soft), [cacheKey, parts, accent, soft])
  return <BucketMeshes buckets={buckets} />
}

function BuildingParts({
  kind,
  seed,
  accent,
  soft,
  parts,
}: {
  kind: BuildingKind
  seed: number
  accent: string
  soft: string
  parts: PartSpec[]
}) {
  return <MergedParts cacheKey={`${kind}|${seed}|${accent}|${soft}`} parts={parts} accent={accent} soft={soft} />
}

/* ------------------------------------------------------------------ */
/* Archetype part lists (ported 1:1 from the old JSX trees)            */
/* ------------------------------------------------------------------ */

/** box + pyramid roof + door + windows */
function houseParts(seed: number): PartSpec[] {
  const doorSide = mulberry32(seed)() < 0.5 ? -1 : 1
  return [
    box(PALETTE.walls, [4.2, 2.6, 3.4], [0, 1.3, 0], { cast: true }),
    cone('accent', 3.3, 1.9, [0, 3.55, 0], { seg: 4, r: [0, Math.PI / 4, 0], accent: true, cast: true }),
    box(PALETTE.woodDark, [0.9, 1.5, 0.14], [doorSide * 0.95, 0.75, 1.77]),
    box(PALETTE.window, [0.75, 0.75, 0.12], [-doorSide * 0.8, 1.55, 1.76], { win: true }),
    box(PALETTE.window, [0.75, 0.75, 0.12], [-doorSide * 1.75, 1.55, 1.76], { win: true }),
    box(PALETTE.window, [0.12, 0.75, 0.9], [2.16, 1.55, 0], { win: true }),
    box(PALETTE.window, [0.12, 0.75, 0.9], [-2.16, 1.55, 0], { win: true }),
    box(shade(PALETTE.wood, -0.2), [0.4, 1.5, 0.4], [1.25, 3.1, -0.85]),
  ]
}

/** 3 stacked tapering boxes with window strips + antenna mast */
const TOWER_PARTS: PartSpec[] = (() => {
  const levels: Array<[number, number, number]> = [
    [4.8, 5.5, 0],
    [4.0, 5.0, 5.5],
    [3.2, 4.5, 10.5],
  ]
  const parts: PartSpec[] = []
  for (const [w, h, base] of levels) {
    parts.push(box(PALETTE.walls, [w, h, w], [0, base + h / 2, 0], { cast: true }))
    for (const f of [0.26, 0.52, 0.78]) {
      parts.push(box(PALETTE.window, [w + 0.1, 0.45, w + 0.1], [0, base + h * f, 0], { win: true }))
    }
  }
  parts.push(box(PALETTE.woodDark, [1.7, 2.0, 0.14], [0, 1.0, 2.47]))
  parts.push(cone('accent', 2.3, 1.3, [0, 15.65, 0], { seg: 4, r: [0, Math.PI / 4, 0], accent: true, cast: true }))
  parts.push(cyl(PALETTE.metal, 0.07, 0.11, 2.0, [0, 17.3, 0], { seg: 6 }))
  parts.push(sph('accent', 0.14, [0, 18.35, 0], { seg: 8, accent: true }))
  return parts
})()

/** wide hall + colonnade + central clock tower */
const CAMPUS_PARTS: PartSpec[] = (() => {
  const parts: PartSpec[] = [
    box(PALETTE.walls, [9, 3.2, 5], [0, 1.6, 0], { cast: true }),
    box('accent', [9.7, 0.45, 5.7], [0, 3.42, 0], { accent: true, cast: true }),
    box(PALETTE.stone, [5.2, 0.3, 1.3], [0, 0.15, 3.15]),
    box(PALETTE.walls, [2.4, 5.2, 2.4], [0, 6.25, 0], { cast: true }),
    cone('accent', 1.95, 1.4, [0, 9.55, 0], { seg: 4, r: [0, Math.PI / 4, 0], accent: true, cast: true }),
    cyl(PALETTE.white, 0.78, 0.78, 0.14, [0, 7.4, 1.26], { seg: 18, r: [Math.PI / 2, 0, 0] }),
    box('#334155', [0.08, 0.55, 0.05], [0, 7.68, 1.36]),
    box('#334155', [0.4, 0.08, 0.05], [0.15, 7.45, 1.36]),
  ]
  for (const x of [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75]) {
    parts.push(cyl(PALETTE.white, 0.26, 0.3, 2.9, [x, 1.45, 2.85], { seg: 10, cast: true }))
  }
  for (const x of [-3, -1, 1, 3]) {
    parts.push(box(PALETTE.window, [1.1, 1.15, 0.12], [x, 1.75, 2.56], { win: true }))
  }
  return parts
})()

/** box + sawtooth roof + chimney (puffing smoke rendered separately) */
function workshopParts(seed: number): { parts: PartSpec[]; chimneyX: number } {
  const chimneyX = mulberry32(seed)() < 0.5 ? -2.5 : 2.5
  const parts: PartSpec[] = [
    box(PALETTE.walls, [7, 2.8, 4.6], [0, 1.4, 0], { cast: true }),
    cyl(shade(PALETTE.wood, -0.25), 0.3, 0.4, 2.2, [chimneyX, 3.7, -1.3], { seg: 10 }),
    cyl('accent', 0.42, 0.42, 0.18, [chimneyX, 4.85, -1.3], { seg: 10, accent: true }),
    box(PALETTE.woodDark, [1.3, 1.7, 0.14], [-chimneyX * 0.6, 0.85, 2.37]),
    box(PALETTE.window, [1.0, 0.95, 0.12], [1.2, 1.7, 2.36], { win: true }),
    box(PALETTE.window, [1.0, 0.95, 0.12], [2.6, 1.7, 2.36], { win: true }),
  ]
  for (const cx of [-2.33, 0, 2.33]) {
    parts.push(box(PALETTE.window, [0.14, 1.15, 4.55], [cx - 1.1, 3.32, 0], { win: true }))
    parts.push(box('accent', [2.45, 0.16, 4.65], [cx + 0.05, 3.42, 0], { r: [0, 0, 0.42], accent: true, cast: true }))
  }
  return { parts, chimneyX }
}

function Smoke({ p }: { p: V3 }) {
  const a = useRef<Mesh>(null)
  const b = useRef<Mesh>(null)
  const c = useRef<Mesh>(null)
  const puffs = [a, b, c]
  const puffGeometry = useMemo(() => new SphereGeometry(0.3, 8, 6), [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < puffs.length; i++) {
      const m = puffs[i].current
      if (!m) continue
      const phase = (t * 0.26 + i / puffs.length) % 1
      m.position.set(p[0] + Math.sin(phase * 5 + i * 2.1) * 0.18, p[1] + phase * 2.6, p[2])
      m.scale.setScalar(0.55 + phase * 1.15)
      const mat = m.material as MeshStandardMaterial
      mat.opacity = 0.45 * (1 - phase)
    }
  })
  return (
    <>
      {puffs.map((ref, i) => (
        <mesh key={i} ref={ref} position={p} geometry={puffGeometry}>
          {/* Per-puff material: opacity is animated per frame — never shared. */}
          <meshStandardMaterial
            color="#ffffff"
            transparent
            opacity={0.4}
            roughness={1}
            flatShading
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  )
}

const CONTAINER_COLORS = ['#d9776b', '#5fa8a0', '#e0b13f', '#7f9f6b'] as const

function containerColor(idx: number): string {
  if (idx === 0) return 'accent'
  if (idx === 1) return 'soft'
  return CONTAINER_COLORS[idx - 2]
}

/** dock platform + container stacks + crane (jib merged separately) */
function harborParts(seed: number): PartSpec[] {
  const r = mulberry32(seed ^ 0x9e37)
  const parts: PartSpec[] = [box(PALETTE.wood, [11, 0.7, 6.5], [0, 0.35, 0], { cast: true })]
  for (const zx of [-1.7, 0, 1.7]) {
    for (const xx of [-3.7, -1.4, 0.9]) {
      const c0 = containerColor(Math.floor(r() * 6))
      const ry0 = (r() - 0.5) * 0.12
      parts.push(box(c0, [2.0, 1.5, 1.5], [xx, 1.45, zx], { r: [0, ry0, 0], cast: true }))
      if (r() < 0.45) {
        const c1 = containerColor(Math.floor(r() * 6))
        const ry1 = (r() - 0.5) * 0.12
        parts.push(box(c1, [2.0, 1.5, 1.5], [xx + 0.1, 2.95, zx], { r: [0, ry1, 0], cast: true }))
      }
    }
  }
  parts.push(box(PALETTE.stone, [1.4, 0.5, 1.4], [3.9, 0.95, 1.9]))
  parts.push(cyl(PALETTE.metal, 0.2, 0.26, 6.4, [3.9, 4.4, 1.9], { seg: 8, cast: true }))
  parts.push(cyl(PALETTE.metal, 0.12, 0.14, 0.5, [-5.0, 0.95, -2.4], { seg: 8 }))
  parts.push(cyl(PALETTE.metal, 0.12, 0.14, 0.5, [-5.0, 0.95, 2.4], { seg: 8 }))
  return parts
}

/** The crane jib's 4 static parts, merged inside the rotating jib group. */
const JIB_PARTS: PartSpec[] = [
  box('accent', [5.6, 0.32, 0.5], [-0.9, 0, 0], { accent: true, cast: true }),
  box('accent', [0.9, 0.7, 0.75], [2.3, -0.15, 0], { accent: true, cast: true }),
  cyl(PALETTE.metal, 0.035, 0.035, 1.7, [-3.4, -1.0, 0], { seg: 4 }),
  box('soft', [1.05, 0.9, 1.05], [-3.4, -2.25, 0]),
]

/** two posts + large slanted panel + support struts */
const BILLBOARD_PARTS: PartSpec[] = (() => {
  const panel = { p: [0, 5.7, 0] as V3, r: [-0.16, 0, 0] as V3 }
  const face = nest(panel, [0, 0, 0.2])
  return [
    cyl(PALETTE.wood, 0.2, 0.26, 4.8, [-2.3, 2.4, 0], { seg: 8, cast: true }),
    cyl(PALETTE.wood, 0.2, 0.26, 4.8, [2.3, 2.4, 0], { seg: 8, cast: true }),
    box('accent', [6.6, 3.5, 0.3], panel.p, { r: panel.r, accent: true, cast: true }),
    box(PALETTE.white, [6.15, 3.05, 0.14], face.p, { r: face.r }),
    cyl(PALETTE.woodDark, 0.09, 0.09, 2.0, [-1.5, 4.4, -0.12], { seg: 6, r: [0, 0, -0.55] }),
    cyl(PALETTE.woodDark, 0.09, 0.09, 2.0, [1.5, 4.4, -0.12], { seg: 6, r: [0, 0, 0.55] }),
  ]
})()

/** stepped pedestal + obelisk + gold finial */
const MONUMENT_PARTS: PartSpec[] = [
  cyl(PALETTE.stone, 2.4, 2.6, 0.4, [0, 0.2, 0], { seg: 24, cast: true }),
  cyl(PALETTE.stone, 1.9, 2.1, 0.4, [0, 0.6, 0], { seg: 24, cast: true }),
  cyl(PALETTE.stone, 1.4, 1.6, 0.4, [0, 1.0, 0], { seg: 24, cast: true }),
  box(PALETTE.white, [1.25, 0.85, 1.25], [0, 1.62, 0]),
  cyl(PALETTE.wallsAlt, 0.26, 0.62, 5.4, [0, 4.72, 0], { seg: 4, r: [0, Math.PI / 4, 0], cast: true }),
  cone('accent', 0.4, 0.7, [0, 7.77, 0], { seg: 4, r: [0, Math.PI / 4, 0], accent: true }),
  sph(PALETTE.gold, 0.27, [0, 8.4, 0], { seg: 10, metal: 0.7, rough: 0.25, accent: true }),
]

/** tapered lattice-ish mast + 2 dishes (+ blinking beacon rendered separately) */
const RADIO_PARTS: PartSpec[] = (() => {
  const segs = [0.44, 0.37, 0.3, 0.23, 0.16]
  const parts: PartSpec[] = [
    cyl(PALETTE.stone, 0.7, 0.85, 0.25, [0, 0.125, 0], { seg: 8 }),
    cyl(PALETTE.white, 0.95, 0.95, 0.14, [0.62, 5.6, 0], { seg: 14, r: [0, 0, -Math.PI / 3] }),
    cyl(PALETTE.white, 0.75, 0.75, 0.12, [-0.55, 8.7, 0.15], { seg: 14, r: [0.5, 0, Math.PI / 2.6] }),
    box(PALETTE.walls, [1.9, 1.25, 1.5], [1.15, 0.62, 0.9], { cast: true }),
    box(PALETTE.woodDark, [0.7, 1.0, 0.12], [1.15, 0.5, 1.68]),
  ]
  segs.forEach((r0, i) => {
    const r1 = segs[i + 1] ?? 0.1
    const base = i * 2.7
    parts.push(cyl(PALETTE.metal, r1, r0, 2.7, [0, base + 1.35, 0], { seg: 6, cast: true }))
    parts.push(cyl('accent', r0 + 0.08, r0 + 0.08, 0.16, [0, base, 0], { seg: 6, accent: true }))
  })
  return parts
})()

/** box + arched (half-cylinder) roof + flag pole */
const POST_OFFICE_PARTS: PartSpec[] = [
  box(PALETTE.walls, [6, 2.9, 4], [0, 1.45, 0], { cast: true }),
  cyl('accent', 2.06, 2.06, 6.2, [0, 2.9, 0], {
    seg: 14,
    theta: Math.PI,
    r: [0, 0, Math.PI / 2],
    accent: true,
    cast: true,
  }),
  box(PALETTE.woodDark, [1.25, 1.95, 0.14], [-1.6, 0.98, 2.07]),
  cyl(PALETTE.woodDark, 0.62, 0.62, 0.12, [-1.6, 1.95, 2.07], { seg: 12, r: [Math.PI / 2, 0, 0] }),
  box(PALETTE.window, [1.05, 1.05, 0.12], [0.4, 1.7, 2.06], { win: true }),
  box(PALETTE.window, [1.05, 1.05, 0.12], [1.8, 1.7, 2.06], { win: true }),
  box(PALETTE.stone, [2.2, 0.28, 1.0], [-1.6, 0.14, 2.5]),
  cyl(PALETTE.metal, 0.05, 0.07, 3.1, [2.5, 1.55, 2.6], { seg: 6 }),
  box('accent', [0.85, 0.52, 0.06], [2.95, 2.85, 2.6], { accent: true }),
]

/** long low hall + entrance portico + 3 flag poles */
const HALL_PARTS: PartSpec[] = (() => {
  const flagColors = ['accent', 'soft', PALETTE.stone]
  const parts: PartSpec[] = [
    box(PALETTE.walls, [9.5, 3.0, 4.6], [0, 1.5, 0], { cast: true }),
    box('accent', [10, 0.42, 5.1], [0, 3.2, 0], { accent: true, cast: true }),
    box('accent', [4.0, 0.32, 1.7], [0, 2.5, 2.9], { accent: true }),
    box(PALETTE.woodDark, [1.7, 2.15, 0.15], [0, 1.08, 2.37]),
  ]
  for (const x of [-1.6, -0.55, 0.55, 1.6]) {
    parts.push(cyl(PALETTE.white, 0.2, 0.22, 2.35, [x, 1.18, 2.9], { seg: 10, cast: true }))
  }
  for (const x of [-3.4, -2.0, 2.0, 3.4]) {
    parts.push(box(PALETTE.window, [1.05, 1.05, 0.12], [x, 1.75, 2.36], { win: true }))
  }
  flagColors.forEach((c, i) => {
    const x = [-2.9, 0, 2.9][i]
    parts.push(cyl(PALETTE.metal, 0.05, 0.07, 3.7, [x, 1.85, 3.9], { seg: 6 }))
    parts.push(box(c, [0.8, 0.46, 0.06], [x + 0.43, 3.4, 3.9]))
  })
  return parts
})()

/** 2-story box + glass front strip + rooftop water tank or solar panel */
function startupParts(seed: number): PartSpec[] {
  const waterTank = mulberry32(seed)() < 0.5
  const parts: PartSpec[] = [
    box(PALETTE.walls, [5.2, 4.6, 4.0], [0, 2.3, 0], { cast: true }),
    box(PALETTE.window, [3.3, 1.5, 0.14], [0.6, 1.45, 2.07], { win: true, metal: 0.25 }),
    box(PALETTE.window, [4.6, 1.5, 0.14], [0, 3.45, 2.07], { win: true, metal: 0.25 }),
    box(PALETTE.woodDark, [1.15, 2.0, 0.14], [-1.85, 1.0, 2.07]),
    box('accent', [5.6, 0.38, 4.4], [0, 4.79, 0], { accent: true, cast: true }),
  ]
  if (waterTank) {
    const g = { p: [1.7, 0, 0.9] as V3 }
    for (const [lx, lz] of [
      [-0.4, -0.4],
      [0.4, -0.4],
      [-0.4, 0.4],
      [0.4, 0.4],
    ] as const) {
      parts.push(box(PALETTE.woodDark, [0.1, 0.7, 0.1], nest(g, [lx, 5.3, lz]).p))
    }
    parts.push(cyl(PALETTE.wood, 0.85, 0.85, 1.1, nest(g, [0, 6.2, 0]).p, { seg: 10 }))
    parts.push(cone('accent', 0.9, 0.42, nest(g, [0, 6.96, 0]).p, { seg: 10, accent: true }))
  } else {
    const g = { p: [-1.3, 0, 0.7] as V3 }
    const panel = nest(g, [0, 5.25, 0], [-0.42, 0, 0])
    const frame = nest(g, [0, 5.17, 0], [-0.42, 0, 0])
    parts.push(box('#3d6fa8', [2.5, 0.1, 1.7], panel.p, { r: panel.r, metal: 0.4, rough: 0.35 }))
    parts.push(box(PALETTE.metal, [2.6, 0.08, 1.8], frame.p, { r: frame.r }))
  }
  return parts
}

/** box + curved (half-cylinder) roof + satellite dish */
const LAB_PARTS: PartSpec[] = (() => {
  const dish = { p: [2.9, 0, -2.6] as V3 }
  return [
    box(PALETTE.walls, [7, 2.6, 4.4], [0, 1.3, 0], { cast: true }),
    cyl('accent', 2.26, 2.26, 7.2, [0, 2.6, 0], {
      seg: 14,
      theta: Math.PI,
      r: [0, 0, Math.PI / 2],
      accent: true,
      cast: true,
    }),
    box(PALETTE.window, [5.2, 0.95, 0.12], [-0.6, 1.75, 2.26], { win: true }),
    box(PALETTE.woodDark, [1.0, 1.85, 0.14], [2.8, 0.93, 2.27]),
    box(PALETTE.metal, [0.9, 0.7, 0.9], [-2.2, 4.4, -1.0]),
    cyl(PALETTE.metal, 0.1, 0.13, 1.4, nest(dish, [0, 0.7, 0]).p, { seg: 6 }),
    cyl(PALETTE.white, 0.95, 0.95, 0.13, nest(dish, [0, 1.65, 0]).p, { seg: 14, r: [0.95, 0, -0.5] }),
  ]
})()

/* ------------------------------------------------------------------ */
/* Archetypes                                                          */
/* ------------------------------------------------------------------ */

function House({ accent, soft, seed }: ArchetypeProps) {
  const parts = useMemo(() => houseParts(seed), [seed])
  return <BuildingParts kind="house" seed={seed} accent={accent} soft={soft} parts={parts} />
}

function Tower({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="tower" seed={seed} accent={accent} soft={soft} parts={TOWER_PARTS} />
}

function Campus({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="campus" seed={seed} accent={accent} soft={soft} parts={CAMPUS_PARTS} />
}

function Workshop({ accent, soft, seed }: ArchetypeProps) {
  const { parts, chimneyX } = useMemo(() => workshopParts(seed), [seed])
  return (
    <group>
      <BuildingParts kind="workshop" seed={seed} accent={accent} soft={soft} parts={parts} />
      <Smoke p={[chimneyX, 5.05, -1.3]} />
    </group>
  )
}

/** dock platform + container stacks + crane */
function Harbor({ accent, soft, seed }: ArchetypeProps) {
  const jib = useRef<Group>(null)
  const parts = useMemo(() => harborParts(seed), [seed])
  // Jib parts carry no seed variation: one shared cache entry per zone tint.
  const jibBuckets = useMemo(() => buildBuckets('harbor-jib', JIB_PARTS, accent, soft), [accent, soft])

  useFrame((state) => {
    if (jib.current) jib.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.5
  })

  return (
    <group>
      <BuildingParts kind="harbor" seed={seed} accent={accent} soft={soft} parts={parts} />
      {/* crane */}
      <group ref={jib} position={[3.9, 7.7, 1.9]}>
        <BucketMeshes buckets={jibBuckets} />
      </group>
    </group>
  )
}

function BillboardAd({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="billboard" seed={seed} accent={accent} soft={soft} parts={BILLBOARD_PARTS} />
}

function Monument({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="monument" seed={seed} accent={accent} soft={soft} parts={MONUMENT_PARTS} />
}

/** tapered lattice-ish mast + 2 dishes + blinking beacon */
function RadioMast({ accent, soft, seed }: ArchetypeProps) {
  const beacon = useRef<MeshStandardMaterial>(null)
  useFrame((state) => {
    if (beacon.current) {
      beacon.current.emissiveIntensity =
        0.5 + 2.2 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4))
    }
  })
  return (
    <group>
      <BuildingParts kind="radio" seed={seed} accent={accent} soft={soft} parts={RADIO_PARTS} />
      {/* Beacon: its own material, emissive-pulsed per frame — never shared. */}
      <mesh position={[0, 13.75, 0]} castShadow>
        <sphereGeometry args={[0.26, 10, 8]} />
        <meshStandardMaterial
          ref={beacon}
          color="#ff5147"
          emissive="#ff2d1f"
          emissiveIntensity={1.5}
          roughness={0.4}
        />
      </mesh>
    </group>
  )
}

function PostOffice({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="postoffice" seed={seed} accent={accent} soft={soft} parts={POST_OFFICE_PARTS} />
}

function Hall({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="hall" seed={seed} accent={accent} soft={soft} parts={HALL_PARTS} />
}

function Startup({ accent, soft, seed }: ArchetypeProps) {
  const parts = useMemo(() => startupParts(seed), [seed])
  return <BuildingParts kind="startup" seed={seed} accent={accent} soft={soft} parts={parts} />
}

function Lab({ accent, soft, seed }: ArchetypeProps) {
  return <BuildingParts kind="lab" seed={seed} accent={accent} soft={soft} parts={LAB_PARTS} />
}

/* ------------------------------------------------------------------ */

export const ARCHETYPES: Record<BuildingKind, ComponentType<ArchetypeProps>> = {
  house: House,
  tower: Tower,
  campus: Campus,
  workshop: Workshop,
  harbor: Harbor,
  billboard: BillboardAd,
  monument: Monument,
  radio: RadioMast,
  postoffice: PostOffice,
  hall: Hall,
  startup: Startup,
  lab: Lab,
}
