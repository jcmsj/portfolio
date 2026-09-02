import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ComponentType } from 'react'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { BuildingKind } from './archetypes'
import { PALETTE, mulberry32, shade } from './util'

/**
 * The 12 building archetypes, each a flat-shaded primitive composition.
 * Every mesh casts + receives shadows; materials flagged with
 * `userData.accent` participate in the hover emissive pulse.
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

interface PartProps {
  p: V3
  r?: V3
  c: string
  /** Marks the material for the hover emissive pulse. */
  accent?: boolean
  /** Window glass look. */
  win?: boolean
  metal?: number
  rough?: number
}

function Box({ p, r, c, accent, win, metal, rough, size }: PartProps & { size: V3 }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={c}
        roughness={rough ?? (win ? 0.35 : 0.9)}
        metalness={metal ?? (win ? 0.15 : 0)}
        flatShading
        userData={accent ? { accent: true } : {}}
      />
    </mesh>
  )
}

function Cyl({
  p,
  r,
  c,
  accent,
  win,
  metal,
  rough,
  rt,
  rb,
  h,
  seg = 12,
  open,
  theta,
}: PartProps & { rt: number; rb: number; h: number; seg?: number; open?: boolean; theta?: number }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <cylinderGeometry
        args={[rt, rb, h, seg, 1, open ?? false, 0, theta ?? Math.PI * 2]}
      />
      <meshStandardMaterial
        color={c}
        roughness={rough ?? (win ? 0.35 : 0.9)}
        metalness={metal ?? (win ? 0.15 : 0)}
        flatShading
        userData={accent ? { accent: true } : {}}
      />
    </mesh>
  )
}

function Cone({ p, r, c, accent, rad, h, seg = 4 }: PartProps & { rad: number; h: number; seg?: number }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <coneGeometry args={[rad, h, seg]} />
      <meshStandardMaterial color={c} roughness={0.85} flatShading userData={accent ? { accent: true } : {}} />
    </mesh>
  )
}

function Sph({ p, c, accent, rad, seg = 10, metal, rough }: PartProps & { rad: number; seg?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <sphereGeometry args={[rad, seg, Math.max(6, seg - 2)]} />
      <meshStandardMaterial
        color={c}
        roughness={rough ?? 0.9}
        metalness={metal ?? 0}
        flatShading
        userData={accent ? { accent: true } : {}}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Archetypes                                                          */
/* ------------------------------------------------------------------ */

/** box + pyramid roof + door + windows */
function House({ accent, seed }: ArchetypeProps) {
  const rng = mulberry32(seed)
  const doorSide = rng() < 0.5 ? -1 : 1
  return (
    <group>
      <Box size={[4.2, 2.6, 3.4]} p={[0, 1.3, 0]} c={PALETTE.walls} />
      <Cone rad={3.3} h={1.9} seg={4} p={[0, 3.55, 0]} r={[0, Math.PI / 4, 0]} c={accent} accent />
      <Box size={[0.9, 1.5, 0.14]} p={[doorSide * 0.95, 0.75, 1.77]} c={PALETTE.woodDark} />
      <Box size={[0.75, 0.75, 0.12]} p={[-doorSide * 0.8, 1.55, 1.76]} c={PALETTE.window} win />
      <Box size={[0.75, 0.75, 0.12]} p={[-doorSide * 1.75, 1.55, 1.76]} c={PALETTE.window} win />
      <Box size={[0.12, 0.75, 0.9]} p={[2.16, 1.55, 0]} c={PALETTE.window} win />
      <Box size={[0.12, 0.75, 0.9]} p={[-2.16, 1.55, 0]} c={PALETTE.window} win />
      <Box size={[0.4, 1.5, 0.4]} p={[1.25, 3.1, -0.85]} c={shade(PALETTE.wood, -0.2)} />
    </group>
  )
}

/** 3 stacked tapering boxes with window strips + antenna mast */
function Tower({ accent }: ArchetypeProps) {
  const levels: Array<[number, number, number]> = [
    [4.8, 5.5, 0],
    [4.0, 5.0, 5.5],
    [3.2, 4.5, 10.5],
  ]
  return (
    <group>
      {levels.map(([w, h, base], i) => (
        <group key={i}>
          <Box size={[w, h, w]} p={[0, base + h / 2, 0]} c={PALETTE.walls} />
          {[0.26, 0.52, 0.78].map((f, j) => (
            <Box
              key={j}
              size={[w + 0.1, 0.45, w + 0.1]}
              p={[0, base + h * f, 0]}
              c={PALETTE.window}
              win
            />
          ))}
        </group>
      ))}
      <Box size={[1.7, 2.0, 0.14]} p={[0, 1.0, 2.47]} c={PALETTE.woodDark} />
      <Cone rad={2.3} h={1.3} seg={4} p={[0, 15.65, 0]} r={[0, Math.PI / 4, 0]} c={accent} accent />
      <Cyl rt={0.07} rb={0.11} h={2.0} seg={6} p={[0, 17.3, 0]} c={PALETTE.metal} />
      <Sph rad={0.14} seg={8} p={[0, 18.35, 0]} c={accent} accent />
    </group>
  )
}

/** wide hall + colonnade + central clock tower */
function Campus({ accent }: ArchetypeProps) {
  const columns = [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75]
  return (
    <group>
      <Box size={[9, 3.2, 5]} p={[0, 1.6, 0]} c={PALETTE.walls} />
      <Box size={[9.7, 0.45, 5.7]} p={[0, 3.42, 0]} c={accent} accent />
      {columns.map((x) => (
        <Cyl key={x} rt={0.26} rb={0.3} h={2.9} seg={10} p={[x, 1.45, 2.85]} c={PALETTE.white} />
      ))}
      <Box size={[5.2, 0.3, 1.3]} p={[0, 0.15, 3.15]} c={PALETTE.stone} />
      <Box size={[2.4, 5.2, 2.4]} p={[0, 6.25, 0]} c={PALETTE.walls} />
      <Cone rad={1.95} h={1.4} seg={4} p={[0, 9.55, 0]} r={[0, Math.PI / 4, 0]} c={accent} accent />
      <Cyl rt={0.78} rb={0.78} h={0.14} seg={18} p={[0, 7.4, 1.26]} r={[Math.PI / 2, 0, 0]} c={PALETTE.white} />
      <Box size={[0.08, 0.55, 0.05]} p={[0, 7.68, 1.36]} c="#334155" />
      <Box size={[0.4, 0.08, 0.05]} p={[0.15, 7.45, 1.36]} c="#334155" />
      {[-3, -1, 1, 3].map((x) => (
        <Box key={x} size={[1.1, 1.15, 0.12]} p={[x, 1.75, 2.56]} c={PALETTE.window} win />
      ))}
    </group>
  )
}

/** box + sawtooth roof + chimney with puffing smoke */
function Workshop({ accent, seed }: ArchetypeProps) {
  const rng = mulberry32(seed)
  const chimneyX = rng() < 0.5 ? -2.5 : 2.5
  return (
    <group>
      <Box size={[7, 2.8, 4.6]} p={[0, 1.4, 0]} c={PALETTE.walls} />
      {[-2.33, 0, 2.33].map((cx) => (
        <group key={cx}>
          <Box size={[0.14, 1.15, 4.55]} p={[cx - 1.1, 3.32, 0]} c={PALETTE.window} win />
          <Box size={[2.45, 0.16, 4.65]} p={[cx + 0.05, 3.42, 0]} r={[0, 0, 0.42]} c={accent} accent />
        </group>
      ))}
      <Cyl rt={0.3} rb={0.4} h={2.2} seg={10} p={[chimneyX, 3.7, -1.3]} c={shade(PALETTE.wood, -0.25)} />
      <Cyl rt={0.42} rb={0.42} h={0.18} seg={10} p={[chimneyX, 4.85, -1.3]} c={accent} accent />
      <Smoke p={[chimneyX, 5.05, -1.3]} />
      <Box size={[1.3, 1.7, 0.14]} p={[-chimneyX * 0.6, 0.85, 2.37]} c={PALETTE.woodDark} />
      <Box size={[1.0, 0.95, 0.12]} p={[1.2, 1.7, 2.36]} c={PALETTE.window} win />
      <Box size={[1.0, 0.95, 0.12]} p={[2.6, 1.7, 2.36]} c={PALETTE.window} win />
    </group>
  )
}

function Smoke({ p }: { p: V3 }) {
  const a = useRef<Mesh>(null)
  const b = useRef<Mesh>(null)
  const c = useRef<Mesh>(null)
  const puffs = [a, b, c]
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
        <mesh key={i} ref={ref} position={p}>
          <sphereGeometry args={[0.3, 8, 6]} />
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

/** dock platform + container stacks + crane */
function Harbor({ accent, soft, seed }: ArchetypeProps) {
  const jib = useRef<Group>(null)
  const stacks = useMemo(() => {
    const r = mulberry32(seed ^ 0x9e37)
    const colors = [accent, soft, ...CONTAINER_COLORS]
    const list: { p: V3; c: string; ry: number }[] = []
    for (const zx of [-1.7, 0, 1.7]) {
      for (const xx of [-3.7, -1.4, 0.9]) {
        list.push({
          p: [xx, 1.45, zx],
          c: colors[Math.floor(r() * colors.length)],
          ry: (r() - 0.5) * 0.12,
        })
        if (r() < 0.45) {
          list.push({
            p: [xx + 0.1, 2.95, zx],
            c: colors[Math.floor(r() * colors.length)],
            ry: (r() - 0.5) * 0.12,
          })
        }
      }
    }
    return list
  }, [seed, accent, soft])

  useFrame((state) => {
    if (jib.current) jib.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.5
  })

  return (
    <group>
      <Box size={[11, 0.7, 6.5]} p={[0, 0.35, 0]} c={PALETTE.wood} />
      {stacks.map((s, i) => (
        <Box key={i} size={[2.0, 1.5, 1.5]} p={s.p} r={[0, s.ry, 0]} c={s.c} />
      ))}
      {/* crane */}
      <Box size={[1.4, 0.5, 1.4]} p={[3.9, 0.95, 1.9]} c={PALETTE.stone} />
      <Cyl rt={0.2} rb={0.26} h={6.4} seg={8} p={[3.9, 4.4, 1.9]} c={PALETTE.metal} />
      <group ref={jib} position={[3.9, 7.7, 1.9]}>
        <Box size={[5.6, 0.32, 0.5]} p={[-0.9, 0, 0]} c={accent} accent />
        <Box size={[0.9, 0.7, 0.75]} p={[2.3, -0.15, 0]} c={accent} accent />
        <Cyl rt={0.035} rb={0.035} h={1.7} seg={4} p={[-3.4, -1.0, 0]} c={PALETTE.metal} />
        <Box size={[1.05, 0.9, 1.05]} p={[-3.4, -2.25, 0]} c={soft} />
      </group>
      {/* bollards */}
      <Cyl rt={0.12} rb={0.14} h={0.5} seg={8} p={[-5.0, 0.95, -2.4]} c={PALETTE.metal} />
      <Cyl rt={0.12} rb={0.14} h={0.5} seg={8} p={[-5.0, 0.95, 2.4]} c={PALETTE.metal} />
    </group>
  )
}

/** two posts + large slanted panel + support struts */
function BillboardAd({ accent }: ArchetypeProps) {
  return (
    <group>
      <Cyl rt={0.2} rb={0.26} h={4.8} seg={8} p={[-2.3, 2.4, 0]} c={PALETTE.wood} />
      <Cyl rt={0.2} rb={0.26} h={4.8} seg={8} p={[2.3, 2.4, 0]} c={PALETTE.wood} />
      <group position={[0, 5.7, 0]} rotation={[-0.16, 0, 0]}>
        <Box size={[6.6, 3.5, 0.3]} p={[0, 0, 0]} c={accent} accent />
        <Box size={[6.15, 3.05, 0.14]} p={[0, 0, 0.2]} c={PALETTE.white} />
      </group>
      <Cyl rt={0.09} rb={0.09} h={2.0} seg={6} p={[-1.5, 4.4, -0.12]} r={[0, 0, -0.55]} c={PALETTE.woodDark} />
      <Cyl rt={0.09} rb={0.09} h={2.0} seg={6} p={[1.5, 4.4, -0.12]} r={[0, 0, 0.55]} c={PALETTE.woodDark} />
    </group>
  )
}

/** stepped pedestal + obelisk + gold finial */
function Monument({ accent }: ArchetypeProps) {
  return (
    <group>
      <Cyl rt={2.4} rb={2.6} h={0.4} seg={24} p={[0, 0.2, 0]} c={PALETTE.stone} />
      <Cyl rt={1.9} rb={2.1} h={0.4} seg={24} p={[0, 0.6, 0]} c={PALETTE.stone} />
      <Cyl rt={1.4} rb={1.6} h={0.4} seg={24} p={[0, 1.0, 0]} c={PALETTE.stone} />
      <Box size={[1.25, 0.85, 1.25]} p={[0, 1.62, 0]} c={PALETTE.white} />
      <Cyl rt={0.26} rb={0.62} h={5.4} seg={4} p={[0, 4.72, 0]} r={[0, Math.PI / 4, 0]} c={PALETTE.wallsAlt} />
      <Cone rad={0.4} h={0.7} seg={4} p={[0, 7.77, 0]} r={[0, Math.PI / 4, 0]} c={accent} accent />
      <Sph rad={0.27} seg={10} p={[0, 8.4, 0]} c={PALETTE.gold} metal={0.7} rough={0.25} accent />
    </group>
  )
}

/** tapered lattice-ish mast + 2 dishes + blinking beacon */
function RadioMast({ accent }: ArchetypeProps) {
  const beacon = useRef<MeshStandardMaterial>(null)
  useFrame((state) => {
    if (beacon.current) {
      beacon.current.emissiveIntensity =
        0.5 + 2.2 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4))
    }
  })
  const segs = [0.44, 0.37, 0.3, 0.23, 0.16]
  return (
    <group>
      <Cyl rt={0.7} rb={0.85} h={0.25} seg={8} p={[0, 0.125, 0]} c={PALETTE.stone} />
      {segs.map((r0, i) => {
        const r1 = segs[i + 1] ?? 0.1
        const base = i * 2.7
        return (
          <group key={i}>
            <Cyl rt={r1} rb={r0} h={2.7} seg={6} p={[0, base + 1.35, 0]} c={PALETTE.metal} />
            <Cyl rt={r0 + 0.08} rb={r0 + 0.08} h={0.16} seg={6} p={[0, base, 0]} c={accent} accent />
          </group>
        )
      })}
      <Cyl rt={0.95} rb={0.95} h={0.14} seg={14} p={[0.62, 5.6, 0]} r={[0, 0, -Math.PI / 3]} c={PALETTE.white} />
      <Cyl rt={0.75} rb={0.75} h={0.12} seg={14} p={[-0.55, 8.7, 0.15]} r={[0.5, 0, Math.PI / 2.6]} c={PALETTE.white} />
      <Box size={[1.9, 1.25, 1.5]} p={[1.15, 0.62, 0.9]} c={PALETTE.walls} />
      <Box size={[0.7, 1.0, 0.12]} p={[1.15, 0.5, 1.68]} c={PALETTE.woodDark} />
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

/** box + arched (half-cylinder) roof + flag pole */
function PostOffice({ accent }: ArchetypeProps) {
  return (
    <group>
      <Box size={[6, 2.9, 4]} p={[0, 1.45, 0]} c={PALETTE.walls} />
      <Cyl
        rt={2.06}
        rb={2.06}
        h={6.2}
        seg={14}
        theta={Math.PI}
        p={[0, 2.9, 0]}
        r={[0, 0, Math.PI / 2]}
        c={accent}
        accent
      />
      <Box size={[1.25, 1.95, 0.14]} p={[-1.6, 0.98, 2.07]} c={PALETTE.woodDark} />
      <Cyl rt={0.62} rb={0.62} h={0.12} seg={12} p={[-1.6, 1.95, 2.07]} r={[Math.PI / 2, 0, 0]} c={PALETTE.woodDark} />
      <Box size={[1.05, 1.05, 0.12]} p={[0.4, 1.7, 2.06]} c={PALETTE.window} win />
      <Box size={[1.05, 1.05, 0.12]} p={[1.8, 1.7, 2.06]} c={PALETTE.window} win />
      <Box size={[2.2, 0.28, 1.0]} p={[-1.6, 0.14, 2.5]} c={PALETTE.stone} />
      <Cyl rt={0.05} rb={0.07} h={3.1} seg={6} p={[2.5, 1.55, 2.6]} c={PALETTE.metal} />
      <Box size={[0.85, 0.52, 0.06]} p={[2.95, 2.85, 2.6]} c={accent} accent />
    </group>
  )
}

/** long low hall + entrance portico + 3 flag poles */
function Hall({ accent, soft }: ArchetypeProps) {
  const flagColors = [accent, soft, PALETTE.stone]
  return (
    <group>
      <Box size={[9.5, 3.0, 4.6]} p={[0, 1.5, 0]} c={PALETTE.walls} />
      <Box size={[10, 0.42, 5.1]} p={[0, 3.2, 0]} c={accent} accent />
      {[-1.6, -0.55, 0.55, 1.6].map((x) => (
        <Cyl key={x} rt={0.2} rb={0.22} h={2.35} seg={10} p={[x, 1.18, 2.9]} c={PALETTE.white} />
      ))}
      <Box size={[4.0, 0.32, 1.7]} p={[0, 2.5, 2.9]} c={accent} accent />
      <Box size={[1.7, 2.15, 0.15]} p={[0, 1.08, 2.37]} c={PALETTE.woodDark} />
      {[-3.4, -2.0, 2.0, 3.4].map((x) => (
        <Box key={x} size={[1.05, 1.05, 0.12]} p={[x, 1.75, 2.36]} c={PALETTE.window} win />
      ))}
      {[-2.9, 0, 2.9].map((x, i) => (
        <group key={x}>
          <Cyl rt={0.05} rb={0.07} h={3.7} seg={6} p={[x, 1.85, 3.9]} c={PALETTE.metal} />
          <Box size={[0.8, 0.46, 0.06]} p={[x + 0.43, 3.4, 3.9]} c={flagColors[i]} />
        </group>
      ))}
    </group>
  )
}

/** 2-story box + glass front strip + rooftop water tank or solar panel */
function Startup({ accent, seed }: ArchetypeProps) {
  const rng = mulberry32(seed)
  const waterTank = rng() < 0.5
  return (
    <group>
      <Box size={[5.2, 4.6, 4.0]} p={[0, 2.3, 0]} c={PALETTE.walls} />
      <Box size={[3.3, 1.5, 0.14]} p={[0.6, 1.45, 2.07]} c={PALETTE.window} win metal={0.25} />
      <Box size={[4.6, 1.5, 0.14]} p={[0, 3.45, 2.07]} c={PALETTE.window} win metal={0.25} />
      <Box size={[1.15, 2.0, 0.14]} p={[-1.85, 1.0, 2.07]} c={PALETTE.woodDark} />
      <Box size={[5.6, 0.38, 4.4]} p={[0, 4.79, 0]} c={accent} accent />
      {waterTank ? (
        <group position={[1.7, 0, 0.9]}>
          {[
            [-0.4, -0.4],
            [0.4, -0.4],
            [-0.4, 0.4],
            [0.4, 0.4],
          ].map(([lx, lz], i) => (
            <Box key={i} size={[0.1, 0.7, 0.1]} p={[lx, 5.3, lz]} c={PALETTE.woodDark} />
          ))}
          <Cyl rt={0.85} rb={0.85} h={1.1} seg={10} p={[0, 6.2, 0]} c={PALETTE.wood} />
          <Cone rad={0.9} h={0.42} seg={10} p={[0, 6.96, 0]} c={accent} accent />
        </group>
      ) : (
        <group position={[-1.3, 0, 0.7]}>
          <Box size={[2.5, 0.1, 1.7]} p={[0, 5.25, 0]} r={[-0.42, 0, 0]} c="#3d6fa8" metal={0.4} rough={0.35} />
          <Box size={[2.6, 0.08, 1.8]} p={[0, 5.17, 0]} r={[-0.42, 0, 0]} c={PALETTE.metal} />
        </group>
      )}
    </group>
  )
}

/** box + curved (half-cylinder) roof + satellite dish */
function Lab({ accent }: ArchetypeProps) {
  return (
    <group>
      <Box size={[7, 2.6, 4.4]} p={[0, 1.3, 0]} c={PALETTE.walls} />
      <Cyl
        rt={2.26}
        rb={2.26}
        h={7.2}
        seg={14}
        theta={Math.PI}
        p={[0, 2.6, 0]}
        r={[0, 0, Math.PI / 2]}
        c={accent}
        accent
      />
      <Box size={[5.2, 0.95, 0.12]} p={[-0.6, 1.75, 2.26]} c={PALETTE.window} win />
      <Box size={[1.0, 1.85, 0.14]} p={[2.8, 0.93, 2.27]} c={PALETTE.woodDark} />
      <Box size={[0.9, 0.7, 0.9]} p={[-2.2, 4.4, -1.0]} c={PALETTE.metal} />
      {/* satellite dish on the grass beside the hall */}
      <group position={[2.9, 0, -2.6]}>
        <Cyl rt={0.1} rb={0.13} h={1.4} seg={6} p={[0, 0.7, 0]} c={PALETTE.metal} />
        <Cyl rt={0.95} rb={0.95} h={0.13} seg={14} p={[0, 1.65, 0]} r={[0.95, 0, -0.5]} c={PALETTE.white} />
      </group>
    </group>
  )
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
