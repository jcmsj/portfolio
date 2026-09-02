import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useCityStore } from '@/state/store'
import { usePrefersReducedMotion } from './hooks'

/**
 * Intro card while the scene streams in. Drei's `useProgress` tracks real
 * assets, but the city has none — so a safety timer force-finishes after a
 * couple of seconds and the whole screen renders nothing at all if loading
 * was already done on the first frame.
 */

type Phase = 'shown' | 'fading' | 'gone'

const FADE_MS = 500
const SAFETY_TIMEOUT_MS = 2500

export function LoadingScreen() {
  const { active, progress } = useProgress()
  const cityName = useCityStore((s) => s.city.meta.cityName)
  const tagline = useCityStore((s) => s.city.meta.tagline)
  const reduceMotion = usePrefersReducedMotion()

  const [phase, setPhase] = useState<Phase>(() =>
    active || progress < 100 ? 'shown' : 'gone',
  )
  const [forcedDone, setForcedDone] = useState(false)

  const done = forcedDone || (!active && progress >= 100)

  useEffect(() => {
    const t = window.setTimeout(() => setForcedDone(true), SAFETY_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (done && phase === 'shown') setPhase('fading')
  }, [done, phase])

  useEffect(() => {
    if (phase !== 'fading') return
    const t = window.setTimeout(() => setPhase('gone'), reduceMotion ? 0 : FADE_MS)
    return () => window.clearTimeout(t)
  }, [phase, reduceMotion])

  if (phase === 'gone') return null

  // No real assets → progress stays at 0; show a gentle pseudo-bar instead.
  const pct = done ? 100 : progress > 0 ? Math.min(progress, 95) : 12

  return (
    <div
      aria-hidden={phase === 'fading'}
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-b from-sky-100 via-white/95 to-sky-50 transition-opacity ${
        reduceMotion ? '' : 'duration-500'
      } ${phase === 'fading' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div className="panel-glass flex w-[min(320px,85vw)] flex-col items-center rounded-2xl px-6 py-7 text-center">
        <div className="text-2xl font-bold tracking-tight text-slate-800">{cityName}</div>
        <p className="mt-1 text-xs text-slate-500">{tagline}</p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
          <div
            className={`h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out ${
              !done && progress === 0 && !reduceMotion ? 'animate-pulse' : ''
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
