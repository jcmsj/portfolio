/**
 * Mutable walk input shared between the mobile HUD joystick and WalkControls.
 * Written every pointer frame — no React state, no re-renders.
 */
export const walkInput = {
  /** Strafe, -1..1 (right positive). */
  x: 0,
  /** Forward, -1..1 (stick up = forward). */
  y: 0,
  /** After a look-drag, swallow the following scene click. */
  suppressClickUntil: 0,
  /** JUMP button held — hold-to-autobhop on coarse pointers. */
  jumpHeld: false,
  /** performance.now() of the last JUMP press; edge-detected by WalkControls. */
  jumpQueuedAt: -Infinity,
}

/** Press the on-screen JUMP button. */
export function pressWalkJump() {
  walkInput.jumpHeld = true
  walkInput.jumpQueuedAt = performance.now()
}

/** Release the on-screen JUMP button. */
export function releaseWalkJump() {
  walkInput.jumpHeld = false
}

export function suppressSceneClick(ms = 80) {
  walkInput.suppressClickUntil = performance.now() + ms
}

export function sceneClickSuppressed() {
  return performance.now() < walkInput.suppressClickUntil
}

export function resetWalkInput() {
  walkInput.x = 0
  walkInput.y = 0
  walkInput.jumpHeld = false
}
