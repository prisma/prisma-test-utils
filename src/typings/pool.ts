import { DMMF } from '@prisma/photon/runtime/dmmf-types'

/**
 * Returns a dedicated function name matching the specified datasource.
 *
 * @param dmmf
 */
export function generatePoolType(
  dmmf: DMMF.Document,
): 'getPostgreSQLPool' | 'getMySQLPool' | 'getSQLitePool' {
  const datasource = dmmf

  switch (key) {
    case value: {
      return 'getMySQLPool'
    }
  }
}
