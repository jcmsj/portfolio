---
feature: mobile-walk-controls
status: delivered
updated: 2026-09-09
branch: feat/threejs-city
commits: 5e669ab..(implementation + this doc)
---

# Mobile walk controls + landscape story card

## Report

**What was built** — Coarse-pointer walk mode now has a translucent left-thumb joystick (`MobileWalkControls` → `walkInput` → `WalkControls` `useFrame`) and canvas drag-look with pointer capture; tap-to-walk remains. Desktop pointer-lock + WASD is unchanged. Place stories on coarse devices (including landscape phones, which often exceed `sm:` width) render as a centered `panel-glass` card; fine pointers keep the right drawer. HUD walk hint and HelpOverlay document the mobile controls.

**Verification** — `pnpm typecheck` PASS; `pnpm check:city` PASS (0 errors, 0 warnings); `pnpm build` PASS. Reviewer found two criticals (joystick speed collapsing past the pad edge; `sm:` width used as a desktop proxy) — both fixed before delivery: unit-vector × strength math, and layout driven by `useMediaQuery('(pointer: coarse)')` / `'(pointer: fine)'`.

**Journey log** —
- Tailwind `sm:` is a width proxy, not a pointer-type proxy. Landscape phones routinely cross 640px CSS and must not inherit desktop drawer layout.
- Joystick deadzone: clamp direction and strength as separate steps; never re-divide by the pre-clamp magnitude after normalizing.
- Shared mutable `walkInput` avoids re-rendering the HUD every pointer frame; look lives on `gl.domElement` so HTML overlays naturally steal the hit target.
- Full-screen story backdrop was dropped so the joystick and look-drag stay usable while the card is open (dismiss via ✕).

## [S1] Problem

On coarse-pointer devices (phones/tablets), walk mode only supports tap-the-ground-to-auto-walk. There is no free look, so the user cannot turn in place, inspect a facade, or steer while walking. Story content was a full-width right slide-over that covered the entire landscape viewport and blocked both the city and on-screen controls. Landscape phones have scarce height and ample width, so the previous mobile story UI was unusable while exploring.

## [S2] Design

### Walk controls (coarse pointers, walk mode only)

1. **Virtual joystick (move)** — translucent circular pad fixed near the bottom-left (`pointer-events-auto`, glass lighter than `panel-glass`). Unit direction × strength; strength 0 inside a 0.15 deadzone, saturates at the pad edge (does not drop past it). Writes `walkInput.x` (strafe) / `walkInput.y` (forward). Speed = `WALK_SPEED * min(1, mag)` (no run via stick).
2. **Drag look** — while walk mode is active on coarse pointers, one-finger drag on the canvas rotates yaw/pitch (YXZ), sens `0.005` rad/px, pitch clamped to ±1.25. Uses `setPointerCapture` on `gl.domElement`. HTML HUD (joystick, chips) naturally blocks starts.
3. **Tap-to-walk remains** — drag distance ≥ 8px marks a look-drag and suppresses the following scene click (`walkInput.suppressClickUntil`); shorter taps still set `walker.dest`. Joystick activity cancels dest.
4. **Transparency** — pad `white/25`–`/30`, thumb `white/50`, light border; `touch-none` on the pad.
5. **Desktop unchanged** — pointer-lock + WASD when `(pointer: fine)` (reactive `useMediaQuery`, not a one-shot `matchMedia`).

### Place story

6. **Layout by pointer type** — `(pointer: coarse)`: centered card `w-[min(420px,92vw)] max-h-[min(78vh,100%)]`, `rounded-2xl`, `panel-glass`. `(pointer: fine)`: right slide-over drawer. Not driven by `sm:` width.
7. **Control / panel coexistence** — card is not full-bleed; joystick and look-drag stay available. Card stops pointerdown propagation. Dismiss via ✕ only (no full-screen backdrop).
8. **Hints** — coarse HUD walk hint + HelpOverlay mobile branch mention joystick / drag look / tap ground.

### Contracts

- `useMediaQuery('(pointer: coarse)' | '(pointer: fine)')` from `src/ui/hooks.ts`.
- Analog input: module singleton `src/scene/walkInput.ts` (no React state per frame).
- Look mutates `camera.quaternion` (YXZ Euler).
- No new dependencies.

## [S3] Out of Scope

- Touch controls in orbit mode (OrbitControls already handles pinch/drag).
- Landscape orientation lock / resize UX beyond the existing viewport.
- Virtual action buttons (jump, interact).
- Gamepad support.
- Changing place markdown or city.json layout.

## Tasks
- [x] T1: Analog move input in `WalkControls` via `walkInput` consumed in `useFrame` — acceptance: WASD path still works; stick sets non-binary fwd/strafe (covers: S2)
- [x] T2: `MobileWalkControls` joystick + canvas look-drag + tap-to-walk; walk + coarse only — acceptance: turn in place and walk with stick on coarse pointer; desktop PLC unchanged (covers: S2; depends: T1)
- [x] T3: Coarse `PlacePanel` centered card; fine pointer drawer preserved — acceptance: landscape phone shows story as centered card with city visible at edges; close works (covers: S2)
- [x] T4: Hud walk hint + HelpOverlay mobile line — acceptance: coarse walk hint mentions joystick/look (covers: S2)
- [x] T5: Verify `pnpm typecheck`, `pnpm check:city`, `pnpm build` — acceptance: all three PASS (covers: S2; depends: T1–T4)
