import { useEffect, useState } from 'react'

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
