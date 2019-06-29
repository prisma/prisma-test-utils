/**
 * Fallbacks to default if undefined.
 *
 * @param fallback
 * @param val
 */
export function withDefault<T>(fallback: T, val: T | undefined): T {
  if (val !== undefined && val !== null) return val
  return fallback
}

/**
 * Maps values and filters nulls.
 *
 * @param f
 * @param xs
 */
export function filterMap<T, Y>(xs: T[], f: (x: T) => Y | null): Y[] {
  return xs.map(f).filter(x => x !== null)
}
