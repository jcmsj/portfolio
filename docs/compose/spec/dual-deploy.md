---
feature: dual-deploy
status: delivered
updated: 2026-09-10
branch: feat/dual-deploy
commits: 65912dd..177d104
---

# Dual deployment (Cloudflare Pages + GitHub Pages)

> **Superseded in part (2026-09-10):** the Cloudflare side has since moved
> from Pages to a Workers static-assets deployment — see
> [`workers-static-assets.md`](workers-static-assets.md) and the README
> "Deploying" section. The GitHub Pages side of this spec still applies
> unchanged.

## Report

**What was built** — Dual deployment without touching the existing Cloudflare Pages project: CF stays dashboard-owned and builds `pnpm build` → `dist` at `/`. A new in-repo workflow (`.github/workflows/deploy-gh-pages.yml`) deploys every `main` push (and manual dispatch) to GitHub Pages project site `https://jcmsj.github.io/portfolio/` with `BASE_PATH=/portfolio`, frozen lockfile install, pnpm `10.11.1` (pinned in both `packageManager` and `pnpm/action-setup`), and `actions/deploy-pages`. README documents the dual-host table, CF keep-as-is settings, and the one-time Pages **Source: GitHub Actions** step. App code needed no changes — Vite `BASE_PATH` / `BASE_URL` already support subpath bases.

**Verification** — `pnpm check:city` PASS; `pnpm typecheck` PASS; root `pnpm build` PASS (`/assets/…` URLs); `BASE_PATH=/portfolio pnpm build` PASS (`/portfolio/assets/…` URLs). Reviewer APPROVE (no CRITICAL/MAJOR); minor Corepack redundancy and doc nits applied before finalize.

**Journey log** —
- Cloudflare Pages must stay Git-dashboard-owned; adding Wrangler for Pages was explicitly out of scope to avoid fighting the existing project.
- Dual bases are the same Vite config: no env flag beyond `BASE_PATH`; GH-only on the Pages job.
- Pin `packageManager` and workflow `pnpm/action-setup` version together (`10.11.1`) so GH matches Cloudflare’s pnpm major.
- GitHub Pages still needs a one-time repo Settings → Source: GitHub Actions; the workflow cannot flip that alone.

## [S1] Problem

The portfolio is a static Vite build. Cloudflare Pages is already connected to the GitHub repo and auto-deploys `main` after the recent pnpm workspace fix. There is no second production host, and no in-repo automation for GitHub Pages. The goal is dual deployment: keep Cloudflare Pages as-is, and also publish every `main` push to a GitHub Pages project site at `https://jcmsj.github.io/portfolio/`.

## [S2] Design

### Hosting contract

| Host | URL | Base path | Who builds | Trigger |
|------|-----|-----------|------------|---------|
| Cloudflare Pages | existing Pages project (dashboard Git connection) | `/` | Cloudflare (`pnpm install` + `pnpm build`, output `dist`) | every push to `main` (already configured — **no repo change to keep this working**) |
| GitHub Pages | `https://jcmsj.github.io/portfolio/` | `/portfolio` | GitHub Actions in this repo | every push to `main` (and workflow_dispatch) |

Cloudflare must remain dashboard-owned. Do not add a Wrangler/`wrangler.toml` deploy path for Pages; changing the CF project to “Workers” or dual-connecting Wrangler would risk the existing site.

### GitHub Pages workflow

Add `.github/workflows/deploy-gh-pages.yml`:

- **Triggers:** `push` to `main`, plus `workflow_dispatch`.
- **Permissions:** `contents: read`, `pages: write`, `id-token: write`.
- **Concurrency:** group `github-pages`, `cancel-in-progress: false` (never cancel a live Pages deploy mid-flight).
- **Job environment:** `github-pages` (required by `actions/deploy-pages`).
- **Steps:**
  1. `actions/checkout@v4`
  2. Enable Corepack / ensure `pnpm@10` (same major family Cloudflare uses). Prefer `corepack enable` + relying on pnpm from the lockfile tooling; pin via a documented version in the workflow if Corepack needs an explicit `packageManager` (see below).
  3. `pnpm install --frozen-lockfile`
  4. `BASE_PATH=/portfolio pnpm build` — Vite already reads `process.env.BASE_PATH` in `vite.config.ts`.
  5. Upload artifact: `actions/upload-pages-artifact` with path `dist`.
  6. `actions/deploy-pages@v4`.

- **Artifact name:** fixed `github-pages` (matches deploy-pages expectation when not customized).

### Build base-path contract

- **Cloudflare build:** no `BASE_PATH` (default `/`). Existing dashboard command stays `pnpm build`.
- **GitHub build:** `BASE_PATH=/portfolio` only on the Pages job. Never bake `/portfolio` into the default local/Cloudflare build.
- Existing `vite.config.ts` `base: process.env.BASE_PATH || '/'` remains the single source of base resolution.
- Existing `PlacePanel.resolveAssetUrl` already prefixes root-relative markdown/public images with `import.meta.env.BASE_URL`. No app code change expected unless verification finds a hard-coded absolute URL outside that helper.

### packageManager (optional hardening)

Today Cloudflare detects pnpm from the environment (`pnpm@10.11.1`). Local is pnpm 11. For CI stability, **add** `"packageManager": "pnpm@10.11.1"` (or another explicit 10.x) to root `package.json` so both Cloudflare and the GH workflow resolve the same major/minor when Corepack is enabled. If that version pin conflicts with local developers on pnpm 11, drop the pin and instead pin only inside the workflow setup step. Decide at implement time by testing Corepack in the workflow; the delivered workflow must not silently run a different package manager than Cloudflare’s major without reason.

### Repo docs

Update README “Deploying” section:

- Dual hosts table (CF Pages root + GH Pages project site).
- Note that CF remains a Git-connected Pages project (dashboard settings: build `pnpm build`, output `dist`, no `BASE_PATH`).
- Note that GH Pages is `.github/workflows/deploy-gh-pages.yml` with `BASE_PATH=/portfolio`.
- Note GitHub repo settings requirement: **Settings → Pages → Source = GitHub Actions** (must be enabled once in the UI; not automatable from the workflow alone).

### Out-of-repo / one-time manual steps

These are **not** code; record them in README so delivery can be verified:

1. GitHub → repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Confirm Cloudflare Pages project still builds from `main` with output `dist` (unchanged).
3. After first green Actions run, open `https://jcmsj.github.io/portfolio/` and confirm assets load under `/portfolio/assets/…`.

### Failure behavior

- If `pnpm install --frozen-lockfile` fails on GH (same class of pnpm workspace bug already fixed), the workflow fails; CF is unaffected.
- If Pages source is still “Deploy from a branch”, `actions/deploy-pages` fails with a clear permissions/source error — document that in README rather than inventing a branch-publish fallback (no `gh-pages` branch).
- Preview deploys: Cloudflare PR previews (if enabled in the dashboard) stay CF-only. GitHub Pages is production-`main` only; no PR Pages.

## [S3] Out of Scope

- Changing or scriptifying the existing Cloudflare Pages project (no Wrangler Pages deploys, no CF Workers migration).
- Custom domains, CNAME, or apex DNS for either host.
- A `gh-pages` branch or “deploy from branch” Pages setup.
- Splitting or code-splitting the Vite bundle (chunk size warning is unrelated).
- Netlify/other hosts.
- PR preview builds on GitHub Pages.
- In-app analytics or host-specific feature flags.

## Tasks

- [x] T1: Add `.github/workflows/deploy-gh-pages.yml` for `main` + `workflow_dispatch` that installs with frozen lockfile, builds with `BASE_PATH=/portfolio`, and deploys `dist` via `actions/deploy-pages` — acceptance: workflow file exists; YAML valid; build step uses frozen install and `BASE_PATH=/portfolio`; deploy uses `actions/deploy-pages`; permissions/concurrency/environment match S2 (covers: S2)
- [x] T2: Align package manager pin for CI (either `packageManager` in `package.json` or explicit setup in the workflow) so the GH job uses pnpm 10.x consistent with Cloudflare — acceptance: chosen pin is present in the repo and the workflow enables Corepack/`pnpm` without mutating the lockfile (covers: S2; depends: T1 is not hard; pin can land with T1)
- [x] T3: Update README dual-deploy docs (CF stays dashboard-owned; GH Pages workflow + `BASE_PATH`; one-time “Pages source = GitHub Actions” step) — acceptance: README dual-host table and manual setup steps are present and match the workflow (covers: S2)
- [x] T4: Verify dual-base builds locally — acceptance: `pnpm install --frozen-lockfile && pnpm build` produces `dist/` with root-relative asset URLs; `BASE_PATH=/portfolio pnpm build` produces asset URLs under `/portfolio/`; `pnpm check:city` and `pnpm typecheck` pass (covers: S2)
