/**
 * Сверка точки отметки с филиалом. Та же логика, что в админке
 * (`components/map/shared.ts`) и в функции hickvision (`isRemoteMark`): решает
 * сервер, здесь — только чтобы вовремя спросить причину.
 */

type Coords = { lat: number; lon: number }

// Порог по умолчанию, пока у филиала не задан свой радиус.
const DEFAULT_OFFICE_RADIUS_M = 200

/** Поле MAP в ucode — строка «широта,долгота». */
function parseCoords(value: unknown): Coords | null {
  if (typeof value !== 'string') return null
  const parts = value.split(',')
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null
  const lat = Number(parts[0])
  const lon = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

// ponytail: гаверсинус на сфере — на сотнях метров точнее, чем GPS телефона.
function distanceMeters(from: Coords, to: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(to.lat - from.lat)
  const dLon = toRad(to.lon - from.lon)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export type OfficeMiss = { title: string; distanceM: number; radiusM: number }

/**
 * Насколько отметка вышла за радиус филиала; null — в пределах или сверять не с
 * чем (филиала нет, у него нет точки, координаты отметки не получены).
 */
export function officeMiss(location: string, branch: Record<string, unknown> | null | undefined): OfficeMiss | null {
  const office = parseCoords(branch?.coordinates)
  const point = parseCoords(location)
  if (!office || !point) return null

  const radius = Number(branch?.radius)
  const radiusM = Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_OFFICE_RADIUS_M
  const distanceM = distanceMeters(point, office)
  if (distanceM <= radiusM) return null

  return { title: typeof branch?.title === 'string' ? branch.title : '', distanceM, radiusM }
}
