import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import YAML from 'yaml'
import { CityConfigSchema } from '../src/city/schema.ts'
import type { CityConfig, MdPayload } from '../src/city/schema.ts'

/**
 * Dev-only middleware backing the visual city editor.
 *
 * The editor POSTs the current draft city config + structured markdown to
 * /__city/save; this middleware validates it against the same zod schema the
 * app loads with, then writes the files straight into the repo so the changes
 * show up as ordinary git diffs. Only mounted during `vite dev` — production
 * builds never see it.
 */

const ROOT = path.resolve(import.meta.dirname, '..')

function serializeMd(md: MdPayload): string {
  const lines: string[] = ['---']
  const frontmatter: Record<string, unknown> = {}
  if (md.period) frontmatter.period = md.period
  if (md.links && md.links.length > 0) {
    frontmatter.links = md.links.map((l) => ({ label: l.label, url: l.url }))
  }
  lines.push(YAML.stringify(frontmatter).trimEnd())
  lines.push('---', '')
  const body = md.body.trimEnd()
  lines.push(body, '')
  return lines.join('\n')
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) throw new Error('Empty request body')
  return JSON.parse(raw)
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function handleSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await readJsonBody(req)) as { city?: unknown; md?: Record<string, MdPayload> }
    if (!body.city) {
      sendJson(res, 400, { ok: false, errors: ['Missing "city" in payload'] })
      return
    }

    const parsed = CityConfigSchema.safeParse(body.city)
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      )
      sendJson(res, 422, { ok: false, errors })
      return
    }
    const city: CityConfig = parsed.data

    const written: string[] = []
    await fs.writeFile(
      path.join(ROOT, 'src/city/city.json'),
      JSON.stringify(city, null, 2) + '\n',
      'utf-8',
    )
    written.push('src/city/city.json')

    for (const [placeId, md] of Object.entries(body.md ?? {})) {
      if (placeId !== placeId.toLowerCase() || !/^[a-z0-9-]+$/.test(placeId)) {
        sendJson(res, 400, { ok: false, errors: [`Invalid place id: ${placeId}`] })
        return
      }
      const file = path.join(ROOT, `src/content/places/${placeId}.md`)
      await fs.writeFile(file, serializeMd(md), 'utf-8')
      written.push(`src/content/places/${placeId}.md`)
    }

    sendJson(res, 200, { ok: true, written })
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
    })
  }
}

export function citySavePlugin(): Plugin {
  return {
    name: 'city-save-middleware',
    configureServer(server) {
      server.middlewares.use('/__city/save', (req, res) => {
        void handleSave(req, res)
      })
    },
  }
}
