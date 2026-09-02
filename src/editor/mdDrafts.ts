import { mdRawById, parsePlaceMd } from '@/city/load'
import type { CityData } from '@/city/load'
import type { MdPayload } from '@/city/schema'

/** Seeded markdown body for brand-new places. */
export const seedBody = (name: string): string => `# ${name}\n\nWrite the story of this place.`

export function seedMdDraft(name: string): MdPayload {
  return { body: seedBody(name), links: [] }
}

/**
 * Canonical draft shape used both for the dirty comparison and as the save
 * payload: drops empty periods/links so the written frontmatter is stable
 * across save → reload round-trips.
 */
export function normalizeMd(draft: MdPayload): MdPayload {
  return {
    body: draft.body,
    period: draft.period ? draft.period : undefined,
    links: (draft.links ?? [])
      .filter((link) => link.label.trim() !== '' || link.url.trim() !== '')
      .map((link) => ({ label: link.label, url: link.url })),
  }
}

/**
 * Drafts for every known content id: all existing md files, every place
 * (including ones added during this session) and the plaza's about content.
 * Ids without an on-disk file get an empty draft.
 */
export function buildInitialDrafts(city: CityData): Record<string, MdPayload> {
  const drafts: Record<string, MdPayload> = {}
  const ids = new Set<string>([
    ...Object.keys(mdRawById),
    city.plaza.contentId,
    ...city.places.map((place) => place.id),
  ])
  for (const id of ids) {
    drafts[id] = normalizeMd(parsePlaceMd(mdRawById[id] ?? ''))
  }
  return drafts
}
