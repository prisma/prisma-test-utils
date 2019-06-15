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
