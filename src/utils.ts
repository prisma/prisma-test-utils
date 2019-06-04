/**
 * Fallbacks to default value if expression returns undefined or null.
 *
 * @param fallback
 */
export function withDefault<T>(fallback: T): (val: T | undefined) => T {
  return val => {
    if (val === undefined || val === null) return fallback
    return val
  }
}

/**
 * Follows a path and falls back if it cannot get to the bottom.
 * @param path
 * @param fallback
 */
export function withDefaultIn<T>(
  path: string[],
  fallback: T,
): (val: object) => T {
  return val =>
    path.reduce((acc, chunk) => {
      if (acc[chunk]) return acc[chunk]
      return fallback
    }, val)
}
