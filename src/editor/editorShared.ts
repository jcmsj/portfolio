import type { BuildingKind } from '@/scene/archetypes'

/**
 * Tiny mutable state shared between the DOM overlay (EditorOverlay) and the
 * in-canvas drag layer (DragLayer). React state cannot reach across the
 * Canvas boundary cheaply, so the drag-relevant knobs live here.
 */
export const editorShared = {
  /** Grid snap for drag positioning: 0 = off, otherwise world units. */
  snap: 0.5 as 0 | 0.5 | 1,
  /** Timestamp until which click-select is suppressed after a real drag. */
  justDraggedUntil: 0,
}

export interface SnapOption {
  value: 0 | 0.5 | 1
  label: string
}

export const SNAP_OPTIONS: SnapOption[] = [
  { value: 0, label: 'Off' },
  { value: 0.5, label: '0.5' },
  { value: 1, label: '1' },
]

/** Snap a world coordinate to the shared grid (and kill float dust). */
export function applySnap(value: number): number {
  const snap = editorShared.snap
  if (snap <= 0) return Math.round(value * 100) / 100
  return Math.round(value / snap) * snap
}

export const round1 = (value: number): number => Math.round(value * 10) / 10

/** Human names for the building archetypes, shown as "campus → Campus Hall". */
export const BUILDING_LABELS: Record<BuildingKind, string> = {
  house: 'Cottage',
  tower: 'Tower',
  campus: 'Campus Hall',
  workshop: 'Workshop',
  harbor: 'Harbor Works',
  billboard: 'Billboard',
  monument: 'Monument',
  radio: 'Radio Mast',
  postoffice: 'Post Office',
  hall: 'Community Hall',
  startup: 'Startup Office',
  lab: 'Research Lab',
}

export const buildingLabel = (kind: BuildingKind): string =>
  `${kind} → ${BUILDING_LABELS[kind]}`

const PASTEL_COLORS = [
  '#7dd3fc',
  '#fda4af',
  '#86efac',
  '#fcd34d',
  '#c4b5fd',
  '#f9a8d4',
  '#5eead4',
  '#fdba74',
  '#a5b4fc',
  '#bef264',
]

/** First pastel not already used by a zone; falls back to cycling the palette. */
export function pickZoneColor(usedColors: string[], n: number): string {
  const used = new Set(usedColors.map((color) => color.toLowerCase()))
  return PASTEL_COLORS.find((color) => !used.has(color)) ?? PASTEL_COLORS[n % PASTEL_COLORS.length]
}

/**
 * A free spot for a new zone: the point on a circle of `ringRadius` around
 * the origin that maximizes the distance to all existing anchors.
 */
export function findFreeZoneSpot(
  existing: { position: readonly [number, number] }[],
  ringRadius = 60,
): [number, number] {
  const STEPS = 72
  let best: [number, number] = [ringRadius, 0]
  let bestScore = -Infinity
  for (let i = 0; i < STEPS; i++) {
    const angle = (i / STEPS) * Math.PI * 2
    const x = Math.round(Math.cos(angle) * ringRadius)
    const z = Math.round(Math.sin(angle) * ringRadius)
    let score = Infinity
    for (const zone of existing) {
      const dist = Math.hypot(zone.position[0] - x, zone.position[1] - z)
      if (dist < score) score = dist
    }
    if (score > bestScore) {
      bestScore = score
      best = [x, z]
    }
  }
  return best
}

/**
 * Generate an id like `<base><suffix><n>` that is unique within `taken` and
 * fits the schema's 40-char limit (truncating the base when needed).
 */
export function uniqueId(base: string, suffix: string, taken: Iterable<string>): string {
  const takenSet = new Set(taken)
  for (let n = 1; ; n++) {
    const tail = `${suffix}${n}`
    const id = base.slice(0, Math.max(1, 40 - tail.length)) + tail
    if (!takenSet.has(id)) return id
  }
}
