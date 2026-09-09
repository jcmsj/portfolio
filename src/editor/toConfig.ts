import type { CityConfig, Place } from '@/city/schema'
import type { CityData } from '@/city/load'

/**
 * Strip the runtime-only `content` key from every place so the payload
 * matches CityConfigSchema (a strictObject — extra keys are rejected by the
 * save middleware).
 */
export function toConfig(city: CityData): CityConfig {
  const placeOf = (place: Place): Place => ({
    id: place.id,
    zone: place.zone,
    name: place.name,
    subtitle: place.subtitle,
    building: place.building,
    position: place.position,
    rotationY: place.rotationY,
    scale: place.scale,
    label: place.label,
  })

  return {
    meta: { ...city.meta },
    plaza: { ...city.plaza },
    zones: city.zones.map((zone) => ({ ...zone })),
    places: city.places.map((place) => placeOf(place)),
    props: city.props.map((prop) => ({ ...prop })),
  }
}
