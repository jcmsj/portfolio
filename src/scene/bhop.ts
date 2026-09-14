/**
 * Source-flavored movement physics (Counter-Strike / Crossfire bunny hop),
 * extracted as a pure module so the model can be exercised headlessly.
 *
 * Why it feels like CS: velocity is not a force — every fixed 128 Hz tick the
 * engine adds a *tiny* amount of speed (AIR_ACCEL × AIR_CAP × dt) along the
 * wishdir your keys + current yaw describe. Gains only register when the
 * wishdir is nearly perpendicular to your velocity, i.e. when you turn the
 * mouse while holding the matching strafe key. Ground friction never runs on
 * the tick you jump, so jumping on the landing tick chains speed hop to hop
 * (the CS 1.6 / Crossfire "hold space or scroll" era — deliberately generous:
 * this is a portfolio toy, not a competitive server).
 *
 * Constants are CS:GO values scaled into city units (RUN_SPEED 16 ≈ 250 u/s).
 */

export const WALK_SPEED = 9
export const RUN_SPEED = 16
/** Simulation granularity — CS servers ran 64–128 tick; 128 keeps timing crisp. */
export const BHOP_TICK = 1 / 128

const GRAVITY = 51.2 // CS 800 u/s² × 0.064 → jump height ≈ 1.4 u (~0.7 × eye height)
const JUMP_VEL = 12 // u/s; air time ≈ 0.47 s
const FRICTION = 5.2 // CS sv_friction
const STOP_SPEED = 6.4 // CS 100 u/s × 0.064
const ACCEL = 5.7 // CS sv_accelerate
const AIR_ACCEL = 12 // CS sv_airaccelerate
const AIR_CAP = 1.92 // CS 30 u/s air wishspeed cap × 0.064 — the bhop dial
/** Sanity ceiling so camera/prop resolution stay tractable: 3 × run. */
export const SOFT_CAP = 48
/** A jump pressed up to this long before landing still counts (buffering). */
const JUMP_BUFFER_MS = 120

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface BhopInput {
  /** Forward axis, -1..1. */
  fwd: number
  /** Strafe axis, -1..1 (right positive). */
  strafe: number
  /** Shift held → run speed. */
  run: boolean
  /** Space / jump button currently held (enables hold-to-autobhop). */
  jumpHeld: boolean
}

export interface BhopEnv {
  /** Absolute ground height (plaza lift, district platforms, …). */
  groundAt: (x: number, z: number) => number
  /**
   * Push `pos` out of solids (island rim, buildings, props) and remove the
   * velocity component pointing into them. Mutates both.
   */
  collide: (pos: Vec3Like, vel: Vec3Like) => void
}

export interface BhopState {
  /** Feet position. */
  pos: Vec3Like
  vel: Vec3Like
  onGround: boolean
  /** Successful chained jumps since walk entry — drives paw punches + HUD. */
  hops: number
  /** Horizontal speed of the last touchdown, for landing dip. */
  lastLandSpeed: number
  /** performance.now() of the last queued jump press (buffer). */
  jumpQueuedAt: number
  /** Unconsumed queue flag (wheel spam / mobile button set this). */
  jumpQueued: boolean
  /** Fixed-timestep remainder carried across frames. */
  acc: number
}

export function createBhopState(x: number, y: number, z: number): BhopState {
  return {
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    onGround: true,
    hops: 0,
    lastLandSpeed: 0,
    jumpQueuedAt: -1e9,
    jumpQueued: false,
    acc: 0,
  }
}

export function queueJump(st: BhopState, now = performance.now()) {
  st.jumpQueued = true
  st.jumpQueuedAt = now
}

/** Horizontal speed — what the HUD speedometer and paw rig read. */
export function horizontalSpeed(st: BhopState): number {
  return Math.hypot(st.vel.x, st.vel.z)
}

function accelerate(
  vel: Vec3Like,
  wx: number,
  wz: number,
  wishSpeed: number,
  accel: number,
  dt: number,
) {
  const current = vel.x * wx + vel.z * wz
  const add = wishSpeed - current
  if (add <= 0) return
  const accelSpeed = Math.min(accel * wishSpeed * dt, add)
  vel.x += accelSpeed * wx
  vel.z += accelSpeed * wz
}

function applyFriction(vel: Vec3Like, dt: number) {
  const speed = Math.hypot(vel.x, vel.z)
  if (speed < 1e-6) return
  const drop = Math.max(speed, STOP_SPEED) * FRICTION * dt
  const scale = Math.max(0, speed - drop) / speed
  vel.x *= scale
  vel.z *= scale
}

function tick(st: BhopState, input: BhopInput, yaw: number, dt: number, env: BhopEnv, now: number) {
  // Yaw basis: camera looks down -Z at yaw 0 (three.js convention).
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  const rx = Math.cos(yaw)
  const rz = -Math.sin(yaw)
  let wx = fx * input.fwd + rx * input.strafe
  let wz = fz * input.fwd + rz * input.strafe
  const mag = Math.hypot(wx, wz)
  const wishSpeed = Math.min(1, mag) * (input.run ? RUN_SPEED : WALK_SPEED)
  if (mag > 1e-6) {
    wx /= mag
    wz /= mag
  }

  const buffered = st.jumpQueued && now - st.jumpQueuedAt <= JUMP_BUFFER_MS
  if (buffered) st.jumpQueued = false
  const wantsJump = input.jumpHeld || buffered

  if (st.onGround) {
    if (wantsJump) {
      // Jump replaces the friction tick entirely — this is the whole trick.
      st.vel.y = JUMP_VEL
      st.onGround = false
      st.hops += 1
    } else {
      applyFriction(st.vel, dt)
      accelerate(st.vel, wx, wz, wishSpeed, ACCEL, dt)
    }
  } else {
    st.vel.y -= GRAVITY * dt
    // Air wishspeed is capped at AIR_CAP — tiny per-tick gains, big when synced.
    accelerate(st.vel, wx, wz, Math.min(wishSpeed, AIR_CAP), AIR_ACCEL, dt)
  }

  st.pos.x += st.vel.x * dt
  st.pos.z += st.vel.z * dt
  st.pos.y += st.vel.y * dt

  env.collide(st.pos, st.vel)

  const g = env.groundAt(st.pos.x, st.pos.z)
  if (st.pos.y <= g && st.vel.y <= 0) {
    if (!st.onGround) st.lastLandSpeed = Math.hypot(st.vel.x, st.vel.z)
    st.pos.y = g
    st.vel.y = 0
    st.onGround = true
  } else {
    st.onGround = false
  }

  const hs = Math.hypot(st.vel.x, st.vel.z)
  if (hs > SOFT_CAP) {
    const s = SOFT_CAP / hs
    st.vel.x *= s
    st.vel.z *= s
  }
}

/**
 * Advance the simulation by `dt` seconds of wall time using fixed ticks.
 * `yaw` is the camera yaw (Euler Y) *this frame*; strafe gains require the
 * player to actually turn it between ticks.
 */
export function stepBhop(
  st: BhopState,
  input: BhopInput,
  yaw: number,
  dt: number,
  env: BhopEnv,
  now = performance.now(),
) {
  // Clamp tab-switch spikes so a 2 s stall doesn't teleport the walker.
  st.acc += Math.min(dt, 0.25)
  while (st.acc >= BHOP_TICK) {
    tick(st, input, yaw, BHOP_TICK, env, now)
    st.acc -= BHOP_TICK
  }
}

/**
 * Live readouts shared with the DOM HUD and the bunny-paw viewmodel.
 * Written every frame by WalkControls; read by non-react consumers.
 */
export const walkTelemetry = {
  speed: 0,
  hops: 0,
  airborne: false,
  /** Set on touchdown, decays in WalkControls — paws squash with it. */
  landSpeed: 0,
  /** performance.now() of the last successful chained hop. */
  lastHopAt: -1e9,
}
