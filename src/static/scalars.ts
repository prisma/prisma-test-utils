import { DMMF } from '@prisma/photon/runtime/dmmf-types'

/**
 * A list of types and their matching DMMF types.
 */
export const Scalar = {
  string: 'String',
  bool: 'Boolean',
  int: 'Int',
  float: 'Float',
  date: 'DateTime',
}

/**
 * Determines whether a field scalar type is supported by default or not.
 * @param field
 */
export function isSupportedScalar(field: DMMF.Field): boolean {
  return Object.values(Scalar).some(s => s === field.type)
}

/**
 * Determines whether a field is a scalar.
 * @param field
 */
export function isScalar(field: DMMF.Field): boolean {
  return field.kind === 'scalar'
}
