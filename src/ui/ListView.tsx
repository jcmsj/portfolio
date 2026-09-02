import { useCityStore } from '@/state/store'
import { usePrefersReducedMotion } from './hooks'

/**
 * Keyboard-friendly index of the whole city: plaza first, then every zone
 * with its places. This is the fully accessible path through the site —
 * real buttons, visible focus rings, no canvas required.
 */

const PLAZA_ACCENT = '#d97706'

const rowClass =
  'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

const chipClass =
  'shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500'

export function ListView() {
  const city = useCityStore((s) => s.city)
  const listOpen = useCityStore((s) => s.listOpen)
  const toggleList = useCityStore((s) => s.toggleList)
  const select = useCityStore((s) => s.select)
  const reduceMotion = usePrefersReducedMotion()

  if (!listOpen) return null

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
      onClick={() => toggleList()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`All places in ${city.meta.cityName}`}
        className={`panel-glass flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl ${
          reduceMotion ? '' : 'animate-pop-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/70 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">All places</h2>
            <p className="text-xs text-slate-500">{city.meta.cityName}</p>
          </div>
          <button
            type="button"
            autoFocus
            aria-label="Close list"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={() => toggleList()}
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* plaza */}
          <button type="button" className={rowClass} onClick={() => select(city.plaza.contentId)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PLAZA_ACCENT }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-slate-800">City Center</span>
              <span className="block truncate text-xs text-slate-500">About me</span>
            </span>
            <span className={chipClass}>start here</span>
          </button>

          {city.zones.map((zone) => {
            const zonePlaces = city.places.filter((p) => p.zone === zone.id)
            if (zonePlaces.length === 0) return null
            return (
              <section key={zone.id} className="mt-5">
                <h3 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: zone.color }} />
                  {zone.name}
                </h3>
                {zone.blurb && <p className="mt-0.5 px-1 text-xs text-slate-400">{zone.blurb}</p>}
                <div className="mt-1.5 space-y-1">
                  {zonePlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      className={rowClass}
                      onClick={() => select(place.id)}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: zone.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {place.name}
                        </span>
                        {place.subtitle && (
                          <span className="block truncate text-xs text-slate-500">
                            {place.subtitle}
                          </span>
                        )}
                      </span>
                      {place.label && <span className={chipClass}>{place.label}</span>}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
