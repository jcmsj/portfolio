# New San Juan — an interactive career city

A portfolio reimagined as a low-poly 3D city built with **Three.js** (via
React Three Fiber). Every building is a chapter of JC's career: orbit the
island, click a building to fly in and read its story, or toggle **Walk mode**
and stroll the roads. Thematic districts (Campus, Harbor, Innovation Park,
Trophy Row, Community, Post Office) sit around a central plaza.

No backend, no CMS, no database — the deployed site is 100 % static.

## Stack

- Vite + React 19 + TypeScript (strict)
- `three`, `@react-three/fiber`, `@react-three/drei` — 3D scene (all geometry procedural, no binary assets)
- Tailwind CSS v4 — HUD, panels, overlays
- zustand — app state
- zod — validates the city config at load *and* on every editor save
- react-markdown — renders each place's story

## Commands

```bash
pnpm install        # setup
pnpm dev            # dev server (visual editor available here)
pnpm build          # typecheck + production build → dist/
pnpm preview        # serve the production build locally
pnpm check:city     # validate city.json ↔ markdown consistency (CI-friendly)
```

## Editing the city

Two files tell the city what to show:

1. **`src/city/city.json`** — the layout: city meta, plaza, zones
   (id, name, position, radius, color) and places (id, zone, building type,
   position, rotation, links). Building types are the keys in
   `src/scene/archetypes.ts`.
2. **`src/content/places/<id>.md`** — the story shown in the side panel for
   the place with that id. Optional frontmatter: `period`, `links`
   (`- label: …` / `url: …`). The plaza's story is `about.md` (set via
   `plaza.contentId`).

Both hot-reload while `pnpm dev` runs. Everything is validated by a zod
schema (`src/city/schema.ts`) — malformed edits surface as clear console
warnings in dev and fail `pnpm check:city` in CI.

### Visual editor (dev only)

Press **`E`** (or the ✏️ button) while `pnpm dev` is running to open the
**City Editor**:

- **Layout** — click a building to edit its name/subtitle/zone/building type,
  **drag buildings and zone anchors directly in the 3D view** (grid-snap
  included), add/duplicate/delete places and zones.
- **Content** — edit a place's markdown (period, links, body) with a live
  preview.
- **City** — city name, tagline, resume link.

**Save** (⌘/Ctrl+S or the button) writes straight back into
`src/city/city.json` and the markdown files via a localhost-only Vite
middleware (`plugins/citySave.ts`), so your changes appear as ordinary git
diffs. The editor is compiled out of production builds entirely — the
deployed site never ships it.

## Deploying

The site is dual-deployed: the same static `dist/` is published to Cloudflare Pages and GitHub Pages on every push to `main`.

| Host | URL | Base path | How it builds |
|------|-----|-----------|----------------|
| Cloudflare Pages | existing Pages project (Git-connected) | `/` | Dashboard: `pnpm install` + `pnpm build` → `dist` |
| GitHub Pages | `https://jcmsj.github.io/portfolio/` | `/portfolio` | `.github/workflows/deploy-gh-pages.yml` |

### Cloudflare Pages (keep as-is)

1. Push / merge to `main`.
2. Cloudflare → **Workers & Pages** → this project → build settings: framework preset **Vite** (or none), command `pnpm build`, output `dist`.
3. Do **not** set `BASE_PATH` on Cloudflare — the site is served from the root.
4. Every push to the production branch auto-deploys; PRs can get preview URLs if enabled in the dashboard.

### GitHub Pages

1. One-time: GitHub → repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. On every push to `main`, the `Deploy GitHub Pages` workflow installs with a frozen lockfile, builds with `BASE_PATH=/portfolio`, and deploys `dist/` via `actions/deploy-pages`.
3. No `gh-pages` branch. PRs do not publish to GitHub Pages.
4. After the first green run, open `https://jcmsj.github.io/portfolio/` and confirm assets load under `/portfolio/assets/…`. The workflow uses Node 24.

Local verification of the Pages base path:

```bash
BASE_PATH=/portfolio pnpm build   # asset URLs under /portfolio/
pnpm build                        # Cloudflare-style root build
```

Any static host (Netlify, S3…) works the same way: upload `dist/`.
