/**
 * Fallbacks to default value if expression returns undefined or null.
 *
 * @param fallback
 */
export function withDefault<T>(fallback: T, val: T | undefined): T {
  if (val === undefined || val === null) return fallback
  return val
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

/**
 * Recursively sorts elements topologically using accessor method "acc".
 * Assumes that all mentioned nodes exist. If they don't the sorting will repeat
 * indefinitely and result in crash. Assumes that there cannot be circular dependencies.
 *
 * TODO!
 *
 * @param acc
 * @param xs
 */
export function topologicalSort<T>(
  acc: (x: T, y: T) => boolean,
  els: T[],
): T[] {
  switch (els.length) {
    case 0: {
      return els
    }
    case 1: {
      return els
    }
    default: {
      const [x, ...xs] = els

      if (xs.some(_x => acc(x, _x))) {
        /* If the pool still includes relations, then we should not yet execute it. */
        return topologicalSort(acc, [...xs, x])
      } else {
        /* Once the pool no longer includes relations, we know, because of presumption, that all
          dependencies already inhabit the result. */
        return [x, ...topologicalSort(acc, xs)]
      }
    }
  }
}

/**
 * Helper xor function.
 *
 * @param a
 * @param b
 */
export function xor(a: boolean, b: boolean): boolean {
  return (a || b) && !(a && b)
}
