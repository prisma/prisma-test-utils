import { GeneratorOptions } from '@prisma/cli'

/**
 * Returns a dedicated function name matching the specified datasource.
 *
 * @param dmmf
 */
export function generatePoolType(
  options: GeneratorOptions,
): 'getPostgreSQLPool' | 'getMySQLPool' | 'getSQLitePool' {
  const datasource = options.dataSources

  console.log(datasource)
  return 'getMySQLPool'
}
