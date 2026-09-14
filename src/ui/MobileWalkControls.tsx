import { useCallback, useRef, useState } from 'react'
import { pressWalkJump, releaseWalkJump, resetWalkInput, walkInput } from '@/scene/walkInput'
import { useCityStore } from '@/state/store'
import { useMediaQuery } from './hooks'

/**
 * Coarse-pointer walk HUD: translucent left-thumb joystick. Drag look is
 * handled on the canvas by WalkControls; this only feeds analog move input.
 */

const PAD = 104
const KNOB = 44
const DEAD = 0.15

export function MobileWalkControls() {
  const mode = useCityStore((s) => s.mode)
  const coarse = useMediaQuery('(pointer: coarse)')
  const active = mode === 'walk' && coarse

  const padRef = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [engaged, setEngaged] = useState(false)

  const applyStick = useCallback((clientX: number, clientY: number) => {
    const el = padRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = (clientX - cx) / (rect.width / 2)
    let dy = (clientY - cy) / (rect.height / 2)
    const raw = Math.hypot(dx, dy)
    // Unit direction from the raw vector; saturate outside the pad.
    if (raw > 1e-6) {
      dx /= raw
      dy /= raw
    }
    const strength = raw < DEAD ? 0 : Math.min(1, (raw - DEAD) / (1 - DEAD))
    if (strength === 0) {
      walkInput.x = 0
      walkInput.y = 0
      setKnob({ x: 0, y: 0 })
      return
    }
    const nx = dx * strength
    const ny = dy * strength
    walkInput.x = nx
    // Stick up (negative client dy) = forward.
    walkInput.y = -ny
    setKnob({ x: nx * (rect.width / 2 - KNOB / 2), y: ny * (rect.height / 2 - KNOB / 2) })
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerId.current = e.pointerId
    setEngaged(true)
    applyStick(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return
    e.stopPropagation()
    applyStick(e.clientX, e.clientY)
  }
  const endStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return
    e.stopPropagation()
    pointerId.current = null
    setEngaged(false)
    resetWalkInput()
    setKnob({ x: 0, y: 0 })
  }

  if (!active) return null

  return (
    <div className="pointer-events-none fixed bottom-16 left-4 z-40 select-none sm:bottom-20 sm:left-6">
      <div
        ref={padRef}
        role="presentation"
        className={`pointer-events-auto relative touch-none rounded-full border border-white/40 transition ${
          engaged ? 'bg-white/30' : 'bg-white/25'
        }`}
        style={{
          width: PAD,
          height: PAD,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 24px -8px rgb(15 40 60 / 0.35)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStick}
        onPointerCancel={endStick}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-white/50 shadow-sm"
          style={{
            width: KNOB,
            height: KNOB,
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          }}
        />
      </div>
      {/* JUMP — hold to chain bunny hops (CS 1.6 / Crossfire style). */}
      <button
        type="button"
        aria-label="Jump"
        className={`pointer-events-auto absolute bottom-2 right-[-5.5rem] flex h-16 w-16 select-none items-center justify-center rounded-full border border-white/40 bg-white/25 text-[11px] font-semibold tracking-widest text-white/90 shadow-lg backdrop-blur-md active:bg-white/40`}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          pressWalkJump()
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          releaseWalkJump()
        }}
        onPointerCancel={releaseWalkJump}
      >
        JUMP
      </button>
    </div>
  )
}
