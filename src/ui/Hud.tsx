import { useEffect, useState } from 'react'
import { useCityStore } from '@/state/store'
import { HelpOverlay } from './HelpOverlay'
import { ListView } from './ListView'
import { LoadingScreen } from './LoadingScreen'
import { Minimap } from './Minimap'
import { MobileWalkControls } from './MobileWalkControls'
import { PlacePanel } from './PlacePanel'
import { useMediaQuery } from './hooks'

/**
 * 2D UI layer over the 3D city: identity chip, minimap, mode toggle,
 * slide-over place panel, list & help overlays and the loading screen.
 *
 * The root is `pointer-events-none` so the scene keeps receiving drags;
 * every interactive surface opts back in with `pointer-events-auto`.
 */

const iconButtonClass =
  'panel-glass flex h-10 w-10 cursor-pointer select-none items-center justify-center rounded-full text-base text-slate-600 transition hover:scale-105 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

const modeButtonClass = (active: boolean) =>
  `cursor-pointer select-none rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
  }`

/** Don't hijack keys while the user is typing somewhere. */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

export function Hud() {
  const cityName = useCityStore((s) => s.city.meta.cityName)
  const tagline = useCityStore((s) => s.city.meta.tagline)
  const mode = useCityStore((s) => s.mode)
  const setMode = useCityStore((s) => s.setMode)
  const toggleMode = useCityStore((s) => s.toggleMode)
  const selectedId = useCityStore((s) => s.selectedId)
  const select = useCityStore((s) => s.select)
  const listOpen = useCityStore((s) => s.listOpen)
  const toggleList = useCityStore((s) => s.toggleList)
  const helpDismissed = useCityStore((s) => s.helpDismissed)
  const dismissHelp = useCityStore((s) => s.dismissHelp)
  const editing = useCityStore((s) => s.editing)

  const [helpOpen, setHelpOpen] = useState(false)
  const coarse = useMediaQuery('(pointer: coarse)')

  // Never pop help over the visual editor, whatever its state is.
  const helpVisible = !editing && (helpOpen || !helpDismissed)
  const closeHelp = () => {
    setHelpOpen(false)
    dismissHelp()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (isEditableTarget(e.target)) return

      if (e.key === 'Escape') {
        if (helpVisible) closeHelp()
        else if (listOpen) toggleList()
        else if (selectedId) select(null)
        else if (mode === 'walk') setMode('orbit')
      } else if (e.key === 'v' || e.key === 'V') {
        toggleMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, helpVisible, listOpen, selectedId, mode, select, setMode, toggleList, toggleMode, dismissHelp])

  const hint =
    mode === 'orbit'
      ? 'Drag to orbit · scroll to zoom · click a building'
      : coarse
        ? 'Joystick to move · drag to look · tap ground to walk'
        : 'WASD to walk · Esc to exit'

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {/* Top-left: city identity (non-interactive — drags pass through to the scene) */}
      <div className="panel-glass absolute left-3 top-3 max-w-[70vw] select-none rounded-2xl px-4 py-3 sm:left-4 sm:top-4">
        <h1 className="text-lg font-bold leading-tight text-slate-800">{cityName}</h1>
        <p className="text-xs text-slate-500">{tagline}</p>
      </div>

      {/* Top-right: minimap + actions (parked while the visual editor is open) */}
      <div
        className={`absolute right-3 top-3 flex flex-col items-end gap-2 select-none sm:right-4 sm:top-4 ${
          editing ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        <Minimap />
        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            type="button"
            aria-label="Browse all places"
            className={iconButtonClass}
            disabled={editing}
            onClick={toggleList}
          >
            ☰
          </button>
          <button
            type="button"
            aria-label="Show help"
            className={iconButtonClass}
            disabled={editing}
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>
      </div>

      {/* Bottom-center: camera mode + contextual hint */}
      {!editing && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 select-none sm:bottom-4">
          <div className="panel-glass pointer-events-auto flex rounded-full p-1" role="group" aria-label="Camera mode">
            <button
              type="button"
              className={modeButtonClass(mode === 'orbit')}
              aria-pressed={mode === 'orbit'}
              onClick={() => setMode('orbit')}
            >
              🗺 Orbit
            </button>
            <button
              type="button"
              className={modeButtonClass(mode === 'walk')}
              aria-pressed={mode === 'walk'}
              onClick={() => setMode('walk')}
            >
              🚶 Walk
            </button>
          </div>
          <p className="pointer-events-none rounded-full bg-white/55 px-3 py-0.5 text-xs text-slate-600 backdrop-blur-sm">
            {hint}
          </p>
        </div>
      )}

      <PlacePanel />
      <MobileWalkControls />
      <ListView />
      <HelpOverlay open={helpVisible} onClose={closeHelp} />
      <LoadingScreen />
    </div>
  )
}
