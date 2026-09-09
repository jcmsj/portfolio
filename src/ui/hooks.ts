import { useCallback, useEffect, useState } from 'react'

/**
 * Reactive matchMedia hook — used for coarse-pointer and reduced-motion
 * checks that need to update live (e.g. plugging in a mouse, or the user
 * flipping the OS "reduce motion" setting mid-session).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** True when the user asked the OS to minimize non-essential animation. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export type FullscreenMode = 'off' | 'native' | 'pseudo'

/** WebKit-prefixed Fullscreen API surface (older Safari / iPadOS). */
interface WebkitDocument {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}

function nativeElement(): Element | null {
  return (
    document.fullscreenElement ??
    (document as Document & WebkitDocument).webkitFullscreenElement ??
    null
  )
}

/**
 * Fullscreen with a graceful fallback. `native` uses the (webkit-prefixed)
 * Fullscreen API — desktop, Android, iPad. Browsers with no element
 * fullscreen at all (iPhone Safari) fall back to `pseudo`: the
 * `nsj-immersive` class on <html>, which fades out the passive HUD chrome
 * (see index.css) since the browser chrome itself can't be hidden there.
 */
export function useFullscreen(): { mode: FullscreenMode; toggle: () => void } {
  const [mode, setMode] = useState<FullscreenMode>('off')

  // Native entry/exit announces itself through fullscreenchange; mirror it.
  useEffect(() => {
    const onChange = () => setMode(nativeElement() ? 'native' : 'off')
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('nsj-immersive', mode === 'pseudo')
    return () => document.documentElement.classList.remove('nsj-immersive')
  }, [mode])

  const toggle = useCallback(() => {
    const doc = document as Document & WebkitDocument
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }

    if (nativeElement()) {
      void (document.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document)
      return // the fullscreenchange listener updates the state
    }

    if (document.documentElement.classList.contains('nsj-immersive')) {
      setMode('off')
      return
    }

    const request = el.requestFullscreen || el.webkitRequestFullscreen
    if (request) {
      try {
        // Rejected (e.g. iframe without allow="fullscreen") → pseudo fallback.
        void Promise.resolve(request.call(el)).catch(() => setMode('pseudo'))
      } catch {
        setMode('pseudo')
      }
    } else {
      // No element fullscreen API (iPhone Safari) → pseudo fallback.
      setMode('pseudo')
    }
  }, [])

  return { mode, toggle }
}
