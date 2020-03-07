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
  return xs.map(f).filter(notNull)
}

/**
 * Determines whether a values is null.
 * @param val
 */
export function notNull<T>(val: T | null): val is T {
  return val !== null
}

/**
 * Negates the boolean function.
 * @param fn
 */
export function not<T, TS extends Array<T>>(
  fn: (...params: TS) => boolean,
): (...params: TS) => boolean {
  return (...params) => !fn(...params)
}

/**
 * Filters keys from an object.
 * @param dict
 * @param fn
 */
export function filterKeys<T>(
  dict: { [key: string]: T },
  fn: (key: string, value: T) => boolean,
): { [key: string]: T } {
  return Object.keys(dict)
    .filter(key => fn(key, dict[key]))
    .reduce((acc, key) => ({ ...acc, [key]: dict[key] }), {})
}
