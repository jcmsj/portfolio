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
}
