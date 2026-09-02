import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { mdRawById, parsePlaceMd } from '@/city/load'
import type { PlaceContent } from '@/city/load'
import { useCityStore } from '@/state/store'
import { usePrefersReducedMotion } from './hooks'

/**
 * Right slide-over showing the story of the selected place — or, when the
 * plaza is selected, the "about me" page rendered straight from its
 * frontmattered markdown.
 */

const PLAZA_ACCENT = '#d97706'
const FALLBACK_ACCENT = '#64748b'

const closeBtnClass =
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

const navBtnClass =
  'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900 disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

const pillClass =
  'inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

const primaryPillClass =
  'inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

/** External markdown links open in a new tab; images get card styling. */
const mdComponents: Components = {
  a: ({ href, children }) => {
    const external =
      typeof href === 'string' && (/^https?:\/\//i.test(href) || href.startsWith('//'))
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {children}
      </a>
    )
  },
  img: ({ src, alt, title }) => (
    <img
      src={src}
      alt={alt ?? ''}
      title={title}
      loading="lazy"
      className="my-2 max-h-52 w-auto rounded-xl object-cover"
    />
  ),
}

export function PlacePanel() {
  const city = useCityStore((s) => s.city)
  const selectedId = useCityStore((s) => s.selectedId)
  const select = useCityStore((s) => s.select)
  const editing = useCityStore((s) => s.editing)
  const reduceMotion = usePrefersReducedMotion()

  const isPlaza = selectedId !== null && selectedId === city.plaza.contentId
  const place =
    selectedId !== null && !isPlaza
      ? (city.places.find((p) => p.id === selectedId) ?? null)
      : null
  // While the visual editor is open, selection drives its inspector — the
  // content panel must stay out of the way.
  const open = !editing && (isPlaza || place !== null)

  const zone = place ? (city.zones.find((z) => z.id === place.zone) ?? null) : null

  // The plaza's about markdown is not attached to any place, so parse it raw.
  let content: PlaceContent | null = null
  if (isPlaza) {
    const raw = mdRawById[city.plaza.contentId]
    content = raw === undefined ? null : parsePlaceMd(raw)
  } else if (place) {
    content = place.content
  }

  // Prev/next cycle through the places of the same zone, in city order.
  const zonePlaces = place ? city.places.filter((p) => p.zone === place.zone) : []
  const zoneIndex = place ? zonePlaces.findIndex((p) => p.id === place.id) : -1
  const prevPlace =
    zonePlaces.length > 1 && zoneIndex >= 0
      ? zonePlaces[(zoneIndex - 1 + zonePlaces.length) % zonePlaces.length]
      : null
  const nextPlace =
    zonePlaces.length > 1 && zoneIndex >= 0
      ? zonePlaces[(zoneIndex + 1) % zonePlaces.length]
      : null

  const title = isPlaza ? city.meta.cityName : (place?.name ?? '')
  const subtitle = isPlaza ? city.meta.tagline : place?.subtitle
  const period = content?.period ?? place?.label ?? null
  const accent = isPlaza ? PLAZA_ACCENT : (zone?.color ?? FALLBACK_ACCENT)
  const zoneLabel = isPlaza ? 'City Center' : (zone?.name ?? '')
  const ariaLabel = isPlaza ? `About ${city.meta.cityName}` : `${title} — story`
  // The plaza's own markdown may repeat the resume URL that also gets the
  // dedicated primary pill — don't render it twice.
  const links =
    content && !(isPlaza && city.meta.resumeUrl)
      ? content.links.filter((link) => link.url !== city.meta.resumeUrl)
      : (content?.links ?? [])

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      inert={!open}
      className={`panel-glass fixed right-0 top-0 z-40 flex h-full w-full flex-col rounded-l-2xl sm:w-[min(420px,92vw)] ${
        open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full'
      } ${reduceMotion ? '' : 'transition-transform duration-300 ease-out'}`}
    >
      {/* header */}
      <header className="flex items-start justify-between gap-3 border-b border-white/70 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200/70">
            <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
            {zoneLabel}
          </span>
          <h2 className="mt-1.5 truncate text-2xl font-bold text-slate-800">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          {period && (
            <span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {period}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close panel"
          className={closeBtnClass}
          onClick={() => select(null)}
        >
          ✕
        </button>
      </header>

      {/* story body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {content ? (
          <>
            <div className="md-body">
              <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {content.body}
              </Markdown>
            </div>
            {(links.length > 0 || (isPlaza && city.meta.resumeUrl)) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/60 pt-4">
                {isPlaza && city.meta.resumeUrl && (
                  <a
                    href={city.meta.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={primaryPillClass}
                  >
                    📄 Resume
                  </a>
                )}
                {links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className={pillClass}
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">No story written for this place yet.</p>
        )}
      </div>

      {/* same-zone prev / next */}
      {place && (
        <footer className="flex items-center justify-between gap-2 border-t border-white/70 px-4 py-3">
          <button
            type="button"
            className={navBtnClass}
            disabled={!prevPlace}
            onClick={() => prevPlace && select(prevPlace.id)}
          >
            ◀ Prev
          </button>
          <span className="text-xs text-slate-400">
            {zonePlaces.length > 0 ? `${zoneIndex + 1} / ${zonePlaces.length}` : ''}
          </span>
          <button
            type="button"
            className={navBtnClass}
            disabled={!nextPlace}
            onClick={() => nextPlace && select(nextPlace.id)}
          >
            Next ▶
          </button>
        </footer>
      )}
    </aside>
  )
}
