/**
 * Fallbacks to default value if expression returns undefined or null.
 *
 * @param fallback
 */
export function withDefault<T>(fallback: T, val: T | undefined): T {
  if (val === undefined || val === null) return fallback
  return val
}
