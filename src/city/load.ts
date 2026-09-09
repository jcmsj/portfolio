import YAML from 'yaml'
import cityJsonRaw from './city.json'
import { CityConfigSchema, type CityConfig, type Place } from './schema'

/**
 * Loads and joins the two content sources:
 *  - `src/city/city.json`      → layout (zones, places, positions, colors)
 *  - `src/content/places/*.md` → long-form prose shown in the side panel
 *
 * Both are bundled at build time and HMR on change, so editing either file
 * (by hand or through the visual editor) updates the running city instantly.
 */

export interface Link {
  label: string
  url: string
}

export interface PlaceContent {
  body: string
  period?: string
  links: Link[]
}

export interface LoadedPlace extends Place {
  content: PlaceContent | null
}

export interface CityData extends CityConfig {
  places: LoadedPlace[]
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) return { frontmatter: {}, body: raw.trim() }
  let frontmatter: Record<string, unknown> = {}
  try {
    const parsed = YAML.parse(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>
    }
  } catch {
    console.warn('[city] failed to parse YAML frontmatter, ignoring it')
  }
  return { frontmatter, body: raw.slice(match[0].length).trim() }
}

function parseLinks(value: unknown): Link[] {
  if (!Array.isArray(value)) return []
  const links: Link[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      links.push({ label: entry, url: entry })
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).url === 'string'
    ) {
      const rec = entry as Record<string, unknown>
      links.push({
        label: typeof rec.label === 'string' ? rec.label : (rec.url as string),
        url: rec.url as string,
      })
    }
  }
  return links
}

/** Parse a place markdown file into the structured shape the editor saves. */
export function parsePlaceMd(raw: string): PlaceContent {
  const { frontmatter, body } = splitFrontmatter(raw)
  return {
    body,
    period: typeof frontmatter.period === 'string' ? frontmatter.period : undefined,
    links: parseLinks(frontmatter.links),
  }
}

// Static import so Vite bundles + HMRs it; schema validation strips unknown
// keys and gives friendly errors on hand edits.
const cityJson = CityConfigSchema.parse(cityJsonRaw)

const mdFiles = import.meta.glob('../content/places/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Raw markdown keyed by place id — reused by the visual editor. */
export const mdRawById: Record<string, string> = Object.fromEntries(
  Object.entries(mdFiles).map(([file, raw]) => [
    (file.split('/').pop() ?? file).replace(/\.md$/, ''),
    raw,
  ]),
)

const contentById: Record<string, PlaceContent> = Object.fromEntries(
  Object.entries(mdRawById).map(([id, raw]) => {
    const { frontmatter, body } = splitFrontmatter(raw)
    return [
      id,
      {
        body,
        period: typeof frontmatter.period === 'string' ? frontmatter.period : undefined,
        links: parseLinks(frontmatter.links),
      },
    ]
  }),
)

export const cityData: CityData = {
  ...cityJson,
  places: cityJson.places.map((p) => ({
    ...p,
    content: contentById[p.id] ?? null,
  })),
}

if (import.meta.env.DEV) {
  const orphanMds = Object.keys(contentById).filter(
    (id) => !cityJson.places.some((p) => p.id === id) && id !== cityJson.plaza.contentId,
  )
  if (orphanMds.length > 0) {
    console.warn(
      `[city] markdown files without a matching place in city.json: ${orphanMds.join(', ')}`,
    )
  }
  const missingMds = cityJson.places.filter((p) => !contentById[p.id]).map((p) => p.id)
  if (missingMds.length > 0) {
    console.warn(`[city] places without markdown content: ${missingMds.join(', ')}`)
  }
}
