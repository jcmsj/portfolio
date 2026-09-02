import { z } from 'zod'
import { BUILDING_KINDS, type BuildingKind } from '../scene/archetypes.ts'

/**
 * The city configuration contract.
 *
 * `src/city/city.json` is the single layout source of truth — the scene,
 * the UI and the dev-only visual editor all read and write through this
 * schema. Long-form prose lives in `src/content/places/<id>.md`.
 */

const Vec2 = z.tuple([z.number(), z.number()])
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color')
const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, numbers and dashes only')
  .min(2)
  .max(40)

export const BuildingKindSchema = z.enum(
  BUILDING_KINDS as [BuildingKind, ...BuildingKind[]],
)

export const MetaSchema = z.strictObject({
  cityName: z.string().min(1).max(60),
  tagline: z.string().max(140),
  /** Optional "resume" call to action rendered on the plaza panel. */
  resumeUrl: z.string().url().optional(),
})

export const PlazaSchema = z.strictObject({
  position: Vec2,
  /** Place id whose markdown is shown when the plaza is selected. */
  contentId: Id,
})

export const ZoneSchema = z.strictObject({
  id: Id,
  name: z.string().min(1).max(60),
  /** One-line description shown in the minimap tooltip / list view. */
  blurb: z.string().max(160).optional(),
  position: Vec2,
  /** Radius of the district platform, in world units. */
  radius: z.number().min(6).max(40),
  color: Hex,
})

export const PlaceSchema = z.strictObject({
  id: Id,
  /** Zone id this place belongs to. */
  zone: Id,
  name: z.string().min(1).max(80),
  /** Short subtitle under the name (role / degree / one-liner). */
  subtitle: z.string().max(120).optional(),
  building: BuildingKindSchema,
  position: Vec2,
  rotationY: z.number().default(0),
  scale: z.number().min(0.5).max(2.5).default(1),
  /** Small timeline chip (e.g. "2021 — 2025") on the label & panel. */
  label: z.string().max(40).optional(),
})

export const PropSchema = z.strictObject({
  kind: z.enum(['tree', 'pine', 'lamp', 'bench', 'hydrant']),
  position: Vec2,
  rotationY: z.number().default(0),
})

export const CityConfigSchema = z.strictObject({
  meta: MetaSchema,
  plaza: PlazaSchema,
  zones: z.array(ZoneSchema).min(1),
  places: z.array(PlaceSchema),
  /** Leave empty to let the scene auto-scatter decorations. */
  props: z.array(PropSchema).default([]),
})

export type CityConfig = z.infer<typeof CityConfigSchema>
export type Meta = z.infer<typeof MetaSchema>
export type Plaza = z.infer<typeof PlazaSchema>
export type Zone = z.infer<typeof ZoneSchema>
export type Place = z.infer<typeof PlaceSchema>
export type Prop = z.infer<typeof PropSchema>

/** Structured markdown payload the editor sends to the save middleware. */
export interface MdPayload {
  period?: string
  links?: { label: string; url: string }[]
  body: string
}
