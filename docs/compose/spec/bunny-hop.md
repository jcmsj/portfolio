---
feature: bunny-hop
status: delivered
updated: 2026-09-15
implementation: 4e3e086
---

# Bunny hop (CS / Crossfire style) for walk mode + bunny-paw viewmodel

## Research summary (what "authentic bhop" actually is)

Counter-Strike bhop is an emergent property of the Source/GoldSrc air-movement code,
replicated almost 1:1 in Crossfire (same era engines, same scroll-jump culture):

1. **Per-tick air acceleration, not force.** Every simulation tick the engine computes
   `wishdir` from the keys you hold and the direction your yaw *currently* faces, then adds
   velocity *along wishdir* limited to `airaccelerate × wishspeed_cap × dt` (~2.6 u/s per
   perfect strafe in CS). Because the cap is tiny, you only gain when your wishdir is nearly
   perpendicular to your current velocity — i.e. when you turn the mouse *while* holding the
   matching strafe key.
2. **Friction-free air.** Ground friction is removed the instant you leave the ground, so
   accumulated speed survives until you touch down again.
3. **Speed is preserved on landing only if you jump again within the friction-free window.**
   Pressing jump on the exact tick you land (or holding it with `+jump` retrigger) skips
   friction entirely → speed chains hop to hop. CS2 added sub-tick penalties for imperfect
   timing; CS 1.6 / Crossfire are the "hold space or scroll wheel" golden age — that is the
   feel we target (it is a portfolio toy, it should feel generous).
4. **The loop**: run → jump → hold A + turn mouse left (gain) → land → jump tick → hold D +
   turn right → … Alternating strafes keep you going straight while stacking speed.

Canonical constants (CS:GO-like, converted to our meters where 1 m ≈ 39 u):
gravity 800 u/s², jump takeoff 268 u/s, `sv_accelerate` 5.7, `sv_airaccelerate` 12,
air wishspeed cap 30 u/s, run speed 250 u/s.

## Where it plugs in (current code)

- `src/scene/WalkControls.tsx` — owns the walk-mode position/velocity loop in `useFrame`;
  today movement is ground-locked (velocity lerp toward input dir, `next.y = groundHeight+0.06`).
  All physics moves out of it into a testable module; it keeps input, collisions and camera.
- `src/scene/walkInput.ts` — mutable shared input; gains a `jumpQueuedAt` timestamp so the
  mobile joystick / HUD button can queue jumps too.
- `src/ui/MobileWalkControls.tsx` — gains a JUMP button (coarse pointers).
- `src/ui/Hud.tsx` — speed readout (m/s + km/h) visible only while walking; turns gold above
  run speed (bhop detected).
- New: `src/scene/bhop.ts` (pure physics), `src/scene/BunnyHands.tsx` (viewmodel costume).

## Design

### 1. `bhop.ts` — fixed-timestep Source-flavored physics (pure, no three imports except Vector types)

State: `{ pos, vel, onGround, lastJumpTick, hopCount }`. Simulation runs on a fixed
128 Hz accumulator inside `useFrame(dt)`; render interpolates between the last two ticks so
low FPS does not change movement (this is the CS2 sub-tick lesson, done honestly).

Per ground tick:
- wishdir = normalize(forward·inputY + right·inputX) using current yaw
- apply ground friction (only if `onGround` **and** this tick is not a jump tick):
  `v -= v̂·min(|v|, friction·stopSpeed·dt)` with friction 5.2, stopSpeed 1.9 m/s
- accelerate toward wishdir up to max ground speed (walk 2.8 / run 5.2 m/s)

Per air tick:
- same accelerate step but with **air cap**: add at most
  `airAccel·airWishCap·dt` along wishdir (airAccel 12, airWishCap 0.76 m/s ≈ 30 u/s);
  wishdir uses full wishspeed for direction but the cap limits the *added* speed
- gravity: `vel.y -= 20·dt` (20 m/s² ≈ CS feel at our scale; jump height ≈ 0.55 m)
- jump when queued and `onGround`: `vel.y = 4.7` (= √(2·g·0.55)), set `onGround=false`,
  **skip friction this landing tick**, `hopCount++` if pressed within 100 ms of landing

Hold-to-autobhop: holding Space (or scroll wheel spam) re-jumps on the landing tick —
the CS 1.6 / Crossfire behavior. Jump buffering: queued jumps expire after 120 ms.

Horizontal speed is intentionally uncapped in the air (that is the exploit); a soft cap of
~3× run speed clamps the truly absurd so the camera does not strobe through props.

### 2. `WalkControls.tsx` rewiring

- keyboard: Space/`KeyE` = jump, mouse wheel = jump (CS players scroll — both directions),
  everything else unchanged.
- collisions stay exactly as today (island limit, building footprints, prop circles, `tryAxis`
  slide) but are applied to the *tick* position; on horizontal collision the horizontal vel
  component is killed (no wall-strafing through buildings).
- vertical: `groundHeight(x,z)+0.06` only applies when falling onto it (`pos.y <= gh` →
  land, `onGround=true`); while `vel.y>0` the camera rides `pos.y` so hops go up real stairs
  and curbs are hoppable.
- camera feel: eye height + velocity-proportional FOV (70° → up to ~86° above run speed),
  small roll tilt while strafing, landing dip on `hopCount` change. Excluded while the
  fly-to transition runs (transition ends → physics take over from final pose).

### 3. `BunnyHands.tsx` — bunny-paw costume (the bonus)

Purely procedural, no assets: per hand a palm (rounded box), 4 toe capsules, a white cuff
and inner-ear-pink paw pads; pastel white/pink palette matching the city's low-poly look.
Attached to the camera each frame (copy camera quaternion, offset ±0.22, −0.26, −0.45 in
camera space), `renderOrder` high and placed well inside the near plane so props never clip
between paws.

Animation state driven by the same physics state:
- idle: gentle breathing bob + sway lag
- walking: alternating paw punch synced to stride
- **airborne / bhop**: paws rise into "ears-up" pose; each successful chained hop adds a
  punch + a few carrot-colored particles from the paws; at >2× run speed a subtle wind
  ribbon + ear jiggle (spring on the ear bones)
- landing: squash-and-stretch dip proportional to fall speed
Only rendered in walk mode; toggleable via a HUD paw button (`showPaws` in zustand).

### 4. Verification plan

- `pnpm build` + `pnpm lint` clean.
- Physics module unit-check via a tiny node script (temp, not committed): 1000 ticks of
  perfect alternating strafes from standstill must exceed run speed by >2×; same input with
  no mouse turn must *not* gain speed (negative control); holding forward only stays ≤ run.
- Manual: pointer-lock walk → scroll jump → hold A + turn → speed HUD climbs, paws animate;
  jump into a building stays blocked; mobile JUMP button hops.

## Non-goals

No multiplayer/netcode, no real CS unit conversion (we tune for *feel* at city scale), no
air-control beyond the strafe model (W-only flying does not gain speed — authentic), no
sound assets (optional procedural hop blip later).
