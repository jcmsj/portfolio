import { useState } from 'react'
import { useCityStore } from '@/state/store'

/**
 * Round bird's-eye SVG map of the island. Zones are translucent districts,
 * places are dots you can click to open, and clicking a zone asks the
 * camera to fly there. World x → map right, world z → map down.
 */

const SIZE = 170
const C = SIZE / 2
const WORLD_ISLAND_RADIUS = 85
const MAP_ISLAND_RADIUS = 77
const SCALE = MAP_ISLAND_RADIUS / WORLD_ISLAND_RADIUS
const PLAZA_ACCENT = '#d97706'

export function Minimap() {
  const zones = useCityStore((s) => s.city.zones)
  const places = useCityStore((s) => s.city.places)
  const plaza = useCityStore((s) => s.city.plaza)
  const hoveredId = useCityStore((s) => s.hoveredId)
  const select = useCityStore((s) => s.select)
  const requestFocus = useCityStore((s) => s.requestFocus)
  const editing = useCityStore((s) => s.editing)
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)

  const toMapX = (x: number) => C + x * SCALE
  const toMapY = (z: number) => C + z * SCALE

  const hoveredZone = zones.find((z) => z.id === hoveredZoneId) ?? null

  return (
    <div
      aria-hidden={editing || undefined}
      className={`relative h-[136px] w-[136px] sm:h-[170px] sm:w-[170px] ${
        editing ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      <div className="panel-glass absolute inset-0 rounded-full" aria-hidden="true" />
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="City map"
        className="absolute inset-0 h-full w-full"
      >
        {/* island */}
        <circle
          cx={C}
          cy={C}
          r={MAP_ISLAND_RADIUS}
          fill="#9ec97f"
          stroke="#e8d5a3"
          strokeWidth={6}
        />

        {/* districts */}
        {zones.map((zone) => (
          <circle
            key={zone.id}
            cx={toMapX(zone.position[0])}
            cy={toMapY(zone.position[1])}
            r={Math.max(8, zone.radius * SCALE)}
            fill={zone.color}
            fillOpacity={hoveredZoneId === zone.id ? 0.55 : 0.35}
            stroke={zone.color}
            strokeWidth={1.5}
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHoveredZoneId(zone.id)}
            onMouseLeave={() => setHoveredZoneId((id) => (id === zone.id ? null : id))}
            onClick={() => requestFocus(zone.position[0], zone.position[1])}
          >
            <title>{zone.name}</title>
          </circle>
        ))}

        {/* places */}
        {places.map((place) => (
          <circle
            key={place.id}
            cx={toMapX(place.position[0])}
            cy={toMapY(place.position[1])}
            r={hoveredId === place.id ? 4.5 : 3}
            fill={zones.find((z) => z.id === place.zone)?.color ?? '#64748b'}
            stroke="#ffffff"
            strokeWidth={1.5}
            className="cursor-pointer transition-all"
            onClick={(e) => {
              e.stopPropagation()
              select(place.id)
            }}
          >
            <title>{place.name}</title>
          </circle>
        ))}

        {/* plaza */}
        <circle
          cx={toMapX(plaza.position[0])}
          cy={toMapY(plaza.position[1])}
          r={5}
          fill={PLAZA_ACCENT}
          stroke="#ffffff"
          strokeWidth={2}
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            select(plaza.contentId)
          }}
        >
          <title>City Center</title>
        </circle>
      </svg>

      {/* district tooltip (flips above/below the zone, and hangs left for
          zones on the right half so it never spills off-screen) */}
      {hoveredZone && (
        <div
          className="panel-glass pointer-events-none absolute z-10 w-44 rounded-xl px-3 py-2"
          style={{
            left: `${(toMapX(hoveredZone.position[0]) / SIZE) * 100}%`,
            top: `${(toMapY(hoveredZone.position[1]) / SIZE) * 100}%`,
            transform: `translate(${
              toMapX(hoveredZone.position[0]) > C ? '-100%' : '-50%'
            }, ${
              toMapY(hoveredZone.position[1]) < C ? '14px' : 'calc(-100% - 14px)'
            })`,
          }}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hoveredZone.color }} />
            {hoveredZone.name}
          </div>
          {hoveredZone.blurb && (
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hoveredZone.blurb}</p>
          )}
        </div>
      )}
    </div>
  )
}
