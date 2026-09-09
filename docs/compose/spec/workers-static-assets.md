---
feature: workers-static-assets
status: delivered
updated: 2026-09-10
branch: main
commits: a387047..HEAD
supersedes: dual-deploy.md (Cloudflare side only)
---

# Cloudflare Workers static-assets deployment (Pages → Workers)

## Report

**What was built** — The Cloudflare half of the dual deploy moved from a
Git-connected Cloudflare **Pages** project to a **Workers** deployment
serving static assets. A committed `wrangler.jsonc` defines an assets-only
Worker (`portfolio`, no `main` script): `assets.directory: ./dist` with
`not_found_handling: single-page-application`, so every request is served as
a static asset (unknown paths fall back to `index.html` with 200) and no
Worker invocations are billable. `wrangler` was added as a devDependency
(v4) with `deploy:workers` / `preview:workers` scripts; `.wrangler/` joined
`.gitignore`; `workerd` joined the pnpm build approvals so local
`wrangler dev` works. README's Deploying section now documents the Workers
setup. GitHub Pages deployment is unchanged.

**Why the dashboard build failed** — Workers Builds' framework detection
guessed a monorepo: it generated build command
`pnpm --filter portfolio-city... run build` and a `wrangler.jsonc` missing
`assets.directory`. The filter fails because this is a single-package repo
(`packages: ['.']` — the root package *is* `portfolio-city`); pnpm 10.11.1
matches no projects for any `--filter` in that shape (reproduced locally on
the pinned version). The fix on both counts: commit a real `wrangler.jsonc`
(detection is skipped whenever a config file exists) and use build command
`pnpm build`.

**Verification** — `pnpm build` (runs `check:city` + `tsc -b` + vite build)
PASS; `wrangler deploy --dry-run` validates the assets-only config and
upload manifest. Dashboard steps recorded in README: set build command to
`pnpm build` (deploy command `npx wrangler deploy`), redeploy, then
optionally delete the old Pages project.

**Journey log** —
- Committing `wrangler.jsonc` is the load-bearing fix: Workers Builds'
  autoconfig never runs when a `wrangler.toml/json/jsonc` exists in the repo,
  so the dashboard-generated config can't come back.
- The build image ships pnpm 10.11.1 and Node 24, matching `packageManager`
  and the GH Pages workflow — no version overrides needed.
- Assets-only Workers need no `main`, `binding`, or `@cloudflare/vite-plugin`
  (that plugin is for Workers with server code; this site is a pure SPA).
- pnpm 10 blocks `workerd`'s postinstall by default; without approving it,
  `wrangler dev` breaks locally while remote deploys still work.

## [S1] Problem

Cloudflare Pages is being retired for this site. A new Workers project
(`portfolio`, Git-connected via Workers Builds) fails on every push with two
errors: `pnpm --filter portfolio-city... run build` → "No projects matched
the filters", and `The assets property in your configuration is missing the
required directory property` (from the dashboard-generated `wrangler.jsonc`).

## [S2] Design

- **`wrangler.jsonc`** (repo root, committed): `name: portfolio`,
  `compatibility_date: 2026-09-08`, `observability.enabled: true`,
  `assets: { directory: ./dist, not_found_handling:
  single-page-application }`. No `main`. `directory` is relative to the
  config file; Vite's default `outDir` already emits `dist/` at the root.
- **Workers Builds settings** (dashboard, manual): build command
  `pnpm build`; deploy command `npx wrangler deploy` (default). Automatic
  dependency install; no `BASE_PATH`; repo root as build root.
- **Local parity**: `deploy:workers` = `pnpm build && wrangler deploy`,
  `preview:workers` = `pnpm build && wrangler dev`. Existing
  `preview` (`vite preview`) untouched.
- **Base path contract unchanged**: Cloudflare builds at `/`, GitHub Pages
  builds with `BASE_PATH=/portfolio` in its own workflow.
- **Docs**: README Deploying rewritten for Workers; `dual-deploy.md` carries
  a dated supersession note pointing here.

## [S3] Out of Scope

- Custom domain / DNS for the workers.dev URL.
- Workers with server-side code (SSR, redirects file, `_headers`, KV/R2).
- Deleting the old Cloudflare Pages project (user's manual cleanup).
- PR preview deployments.
- Any change to the GitHub Pages workflow or app code.

## Tasks

- [x] T1: Commit `wrangler.jsonc` (assets-only, SPA fallback) — acceptance:
  `wrangler deploy --dry-run` validates config against a fresh `dist/`
- [x] T2: Add `wrangler` devDependency + `deploy:workers`/`preview:workers`
  scripts; approve `workerd` build script; ignore `.wrangler/` — acceptance:
  `pnpm exec wrangler --version` works and `wrangler dev` has its runtime
  binary
- [x] T3: Update README Deploying section + supersession note in
  `dual-deploy.md` + this spec — acceptance: docs match the committed config
  and list the dashboard build-command fix
- [x] T4: Verify locally — acceptance: `pnpm build` passes and produces
  root-relative asset URLs in `dist/`
