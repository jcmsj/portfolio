/**
 * Standalone sanity check for the city's data files — CI-safe, no Vite, no
 * path aliases (imports the zod schema relatively; tsx handles the TS).
 *
 *   pnpm check:city
 *
 * Validates src/city/city.json against CityConfigSchema, parses every
 * src/content/places/*.md frontmatter, then cross-checks the two sources:
 * missing/orphan markdown, duplicate ids, places drifting outside their zone
 * and anything placed beyond the island radius. Exits 1 on errors, 0 when at
 * most warnings remain.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { CityConfigSchema } from '../src/city/schema'
import type { CityConfig } from '../src/city/schema'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CITY_JSON = path.join(ROOT, 'src/city/city.json')
const PLACES_DIR = path.join(ROOT, 'src/content/places')

/** Island radius — anything positioned beyond it warns. */
const ISLAND_RADIUS = 80
/** Slack around a zone platform a place may sit in without warning. */
const ZONE_SLACK = 6

const ok: string[] = []
const warns: string[] = []
const errors: string[] = []

function fail(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

/* --- 1. city.json --------------------------------------------------------- */

if (!existsSync(CITY_JSON)) fail(`missing ${path.relative(ROOT, CITY_JSON)}`)

let raw: unknown
try {
  raw = JSON.parse(readFileSync(CITY_JSON, 'utf-8'))
} catch (err) {
  fail(`city.json is not valid JSON — ${err instanceof Error ? err.message : String(err)}`)
}

const parsed = CityConfigSchema.safeParse(raw)
if (!parsed.success) {
  console.error('✖ city.json fails CityConfigSchema:')
  for (const issue of parsed.error.issues) {
    console.error(`    ${issue.path.join('.') || '(root)'}: ${issue.message}`)
  }
  process.exit(1)
}
const city: CityConfig = parsed.data
ok.push(
  `city.json valid — ${city.zones.length} zones, ${city.places.length} places, plaza content "${city.plaza.contentId}"`,
)

/* --- 2. markdown files ---------------------------------------------------- */

if (!existsSync(PLACES_DIR)) fail(`missing ${path.relative(ROOT, PLACES_DIR)}`)

const mdFiles = readdirSync(PLACES_DIR).filter((f) => f.endsWith('.md')).sort()
const mdIds = new Set<string>()

for (const file of mdFiles) {
  const id = file.replace(/\.md$/, '')
  mdIds.add(id)
  const contents = readFileSync(path.join(PLACES_DIR, file), 'utf-8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(contents)
  if (!match) continue // no frontmatter — the app treats that as fine
  try {
    const frontmatter: unknown = parseYaml(match[1])
    if (frontmatter !== null && (typeof frontmatter !== 'object' || Array.isArray(frontmatter))) {
      errors.push(`${file}: frontmatter must be a YAML mapping (got ${Array.isArray(frontmatter) ? 'an array' : typeof frontmatter})`)
    }
  } catch (err) {
    errors.push(
      `${file}: frontmatter YAML does not parse — ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
ok.push(`markdown — ${mdFiles.length} files in ${path.relative(ROOT, PLACES_DIR)}`)

/* --- 3a. markdown coverage ------------------------------------------------- */

const missingMd = city.places.filter((p) => !mdIds.has(p.id))
for (const place of missingMd) {
  errors.push(
    `place "${place.id}" has no markdown file (expected src/content/places/${place.id}.md)`,
  )
}
if (missingMd.length === 0) ok.push(`markdown coverage — all ${city.places.length} places have a story`)

if (!mdIds.has(city.plaza.contentId)) {
  warns.push(`plaza contentId "${city.plaza.contentId}" has no markdown file`)
}

const knownIds = new Set([city.plaza.contentId, ...city.places.map((p) => p.id)])
for (const id of mdIds) {
  if (!knownIds.has(id)) warns.push(`orphan markdown "${id}.md" — no place or plaza contentId matches`)
}

/* --- 3b. duplicate / colliding ids ----------------------------------------- */

function checkDuplicates(label: string, ids: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate ${label} id "${id}"`)
    seen.add(id)
  }
}
checkDuplicates('place', city.places.map((p) => p.id))
checkDuplicates('zone', city.zones.map((z) => z.id))

const zoneIds = new Set(city.zones.map((z) => z.id))
for (const place of city.places) {
  if (zoneIds.has(place.id)) errors.push(`place id "${place.id}" collides with a zone id`)
}
if (errors.every((e) => !e.includes('duplicate') && !e.includes('collides'))) {
  ok.push('ids — unique across zones, places and markdown files')
}

/* --- 3c. placement: places inside their zones ------------------------------- */

let strayPlaces = 0
for (const place of city.places) {
  const zone = city.zones.find((z) => z.id === place.zone)
  if (!zone) {
    errors.push(`place "${place.id}" references unknown zone "${place.zone}"`)
    continue
  }
  const dist = Math.hypot(place.position[0] - zone.position[0], place.position[1] - zone.position[1])
  if (dist > zone.radius + ZONE_SLACK) {
    strayPlaces++
    warns.push(
      `place "${place.id}" is ${Math.round(dist)} units from its zone "${zone.id}" (radius ${zone.radius} + ${ZONE_SLACK} slack)`,
    )
  }
}
if (strayPlaces === 0) ok.push(`placement — every place sits within its zone radius + ${ZONE_SLACK}`)

/* --- 3d. placement: island bounds ------------------------------------------- */

const outside: string[] = []
for (const place of city.places) {
  if (Math.hypot(place.position[0], place.position[1]) > ISLAND_RADIUS) {
    outside.push(`place "${place.id}"`)
  }
}
for (const zone of city.zones) {
  const dist = Math.hypot(zone.position[0], zone.position[1])
  if (dist > ISLAND_RADIUS || dist + zone.radius > ISLAND_RADIUS) {
    outside.push(`zone "${zone.id}" (platform reaches ${Math.round(dist + zone.radius)})`)
  }
}
for (const entry of outside) warns.push(`${entry} extends beyond the island radius ${ISLAND_RADIUS}`)
if (outside.length === 0) ok.push(`island — every position stays within radius ${ISLAND_RADIUS}`)

/* --- report ----------------------------------------------------------------- */

console.log(`city check · ${city.meta.cityName}`)
for (const line of ok) console.log(`  ✔ ${line}`)
for (const line of warns) console.log(`  ⚠ ${line}`)
for (const line of errors) console.log(`  ✖ ${line}`)

const parts = [`${errors.length} error${errors.length === 1 ? '' : 's'}`, `${warns.length} warning${warns.length === 1 ? '' : 's'}`]
console.log(`\nresult: ${parts.join(', ')}`)
if (errors.length > 0) process.exit(1)
