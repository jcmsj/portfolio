import { useCityStore } from '@/state/store'
import { useMediaQuery, usePrefersReducedMotion } from './hooks'

/**
 * First-run (and on-demand) "how to explore" modal. `open` combines the
 * store's persisted `helpDismissed` flag with Hud's help-button state.
 */

interface HelpOverlayProps {
  open: boolean
  onClose: () => void
}

const kbdClass =
  'inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200'

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  const cityName = useCityStore((s) => s.city.meta.cityName)
  const reduceMotion = usePrefersReducedMotion()
  const coarse = useMediaQuery('(pointer: coarse)')

  if (!open) return null

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`How to explore ${cityName}`}
        className={`panel-glass max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl p-5 sm:p-6 ${
          reduceMotion ? '' : 'animate-pop-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">Exploring {cityName}</h2>
        <ul className="mt-3 space-y-2.5 text-sm leading-snug text-slate-600">
          {coarse ? (
            <>
              <li>
                <strong className="font-semibold text-slate-800">Drag</strong> to look around,{' '}
                <strong className="font-semibold text-slate-800">pinch</strong> to zoom in Orbit.
              </li>
              <li>
                <strong className="font-semibold text-slate-800">Tap a building</strong> to read
                its story.
              </li>
              <li>
                Switch to <strong className="font-semibold text-slate-800">Walk</strong>, then use
                the <strong className="font-semibold text-slate-800">joystick</strong> to move and
                drag to look. Tap the ground to walk there.
              </li>
              <li>
                Tap the <strong className="font-semibold text-slate-800">minimap</strong> to fly
                straight to a district.
              </li>
              <li>
                Tap the <strong className="font-semibold text-slate-800">fullscreen</strong>{' '}
                button (top right) for a more immersive view.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong className="font-semibold text-slate-800">Drag</strong> to orbit,{' '}
                <strong className="font-semibold text-slate-800">scroll</strong> to zoom.
              </li>
              <li>
                <strong className="font-semibold text-slate-800">Click a building</strong> to read
                its story in the side panel.
              </li>
              <li>
                Press <kbd className={kbdClass}>V</kbd> or use the toggle to switch to{' '}
                <strong className="font-semibold text-slate-800">Walk</strong> mode, then move with{' '}
                <kbd className={kbdClass}>WASD</kbd>.
              </li>
              <li>
                <kbd className={kbdClass}>Esc</kbd> closes panels and exits Walk.
              </li>
              <li>
                Press <kbd className={kbdClass}>F</kbd> to toggle fullscreen for a fully
                immersive view.
              </li>
              <li>
                Click the <strong className="font-semibold text-slate-800">minimap</strong> to fly
                straight to a district.
              </li>
            </>
          )}
        </ul>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-5 w-full cursor-pointer rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
