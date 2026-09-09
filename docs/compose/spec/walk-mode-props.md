---
feature: walk-mode-props
status: delivered
updated: 2026-09-03
branch: feat/threejs-city
commits: ff74978..(uncommitted working tree)
---

# Walk-mode nearby props: render + collide

## Report

**What was built** — Decorative props (trees, pines, lamps, benches, hydrants) now stay visible in walk mode even when the camera turns away from the island center, and they block the walker like solid objects. Placement was extracted to `src/scene/propSpots.ts` so the visual layer and walk collisions share one deterministic scatter. Island-wide `Instances` batches (props + road dashes) set `frustumCulled={false}` to bypass the InstancedMesh bounding-sphere pitfall. `WalkControls` merges `buildPropObstacles(city)` into its existing building/fountain resolve list.

**Verification** — `pnpm typecheck` PASS; `pnpm build` PASS (tsc + vite); `pnpm check:city` PASS (0 errors, 0 warnings). Placement parity with `git show HEAD:src/scene/Props.tsx` confirmed by reading both scatter implementations side by side (same mulberry32 seeds 1337/4242, same sample order, same constants).

**Journey log** —
- Root cause: drei `Instances` → `InstancedMesh.boundingSphere` is computed once when null; first-frame instance `matrixWorld` is still identity, so the sphere is a tiny origin ball. Orbit always looks at center (never bites); walk mode culls the whole batch when origin leaves the frustum.
- Fix is `frustumCulled={false}` on ~12 island-wide batches, not per-frame sphere recompute.
- Two independent reviewer subagents (default + `xiaomi/mimo-x-flash-preview`) both failed with APIError; final review was done in-session against the pre-change Props scatter.
- Collision radii already include ~0.4 player clearance; trees use trunk-only radius so canopy stays walkable under.

## [S1] Problem

In walk mode, decorative props (trees, pines, lamps, benches, hydrants) disappear
when the player turns away from the island center — even when those props are
standing right next to the camera. They reappear only when the city origin is
back inside the view frustum. Separately, props have no walk collisions, so the
player can walk through solid objects when they do render.

Root cause of the disappearances: drei `Instances` builds one `InstancedMesh`
per part type. Three.js frustum-culls an `InstancedMesh` using
`object.boundingSphere`, which is computed **once** the first time it is `null`.
On that first frame each `Instance`'s `matrixWorld` is still identity (the scene
graph has not yet run `updateMatrixWorld`), so the sphere is a tiny ball at the
origin. Orbit mode always looks at the center, so the sphere stays in-frustum
and every instance draws. Walk mode looks around freely; once the origin leaves
the frustum the whole batch is culled and nearby props vanish.

Walk collisions (`WalkControls`) only list building footprints and the fountain.

## [S2] Design

1. **Always draw island-wide instanced batches.** Set `frustumCulled={false}` on
   every Props `Instances` part and on the zone road-dash `Instances`. Cost is
   ~12 extra draw calls when those batches would have been culled; the geometry
   is already tiny and the island is small. This is the standard fix for the
   drei Instances bounding-sphere pitfall and does not change visuals.
2. **One shared prop placement module.** Extract spot sampling from `Props.tsx`
   into `src/scene/propSpots.ts`. It owns:
   - `buildPropSpots(city)` — the existing deterministic scatter (mulberry32 1337)
   - `buildPropObstacles(city)` — `{x, z, r}` circles for walk collision
   - per-kind obstacle radii (final radius including player clearance)
3. **Walk collisions for every prop kind.** `WalkControls` appends
   `buildPropObstacles(city)` to its existing building/fountain obstacle list.
   Radii (world units, already include ~0.4 player clearance):
   - tree `0.75`, pine `0.70`, lamp `0.40`, bench `1.00`, hydrant `0.35`
   Custom city `props` (when `city.props` is non-empty) use the same radii.

No change to building collisions, fountain collision, ground height, or orbit
mode. No change to prop visual placement (same seed → same spots).

## [S3] Out of Scope

- Recomputing InstancedMesh bounding spheres per frame
- Height-based / non-circular prop colliders
- Collisions for zone platforms, roads, or clouds
- LOD or distance-based prop fading

## Tasks
- [x] T1: Extract `src/scene/propSpots.ts` with `buildPropSpots` + `buildPropObstacles`; `Props.tsx` consumes spots from it — acceptance: props render in the same places as before; typecheck passes (covers: S2)
- [x] T2: Set `frustumCulled={false}` on Props part meshes and zone dashes — acceptance: turning away from origin in walk mode keeps nearby props visible (covers: S2)
- [x] T3: Merge prop obstacles into `WalkControls` resolve list — acceptance: walking into a tree/lamp/bench/hydrant is blocked; buildings still block (covers: S2)
- [x] T4: Verify typecheck + production build — acceptance: `pnpm typecheck` and `pnpm build` succeed (covers: S2; depends: T1, T2, T3)
