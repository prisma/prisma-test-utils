import { GeneratorOptions } from '@prisma/cli'

/**
 * Returns a dedicated function name matching the specified datasource.
 *
 * @param dmmf
 */
export function generatePoolType(
  options: GeneratorOptions,
): 'getPostgreSQLPool' | 'getMySQLPool' | 'getSQLitePool' {
  const [datasource] = options.dataSources

  if (!datasource) {
    throw new Error(`No defined datasource!`)
  }

  switch (datasource.connectorType) {
    case 'sqlite': {
      return 'getSQLitePool'
    }
    case 'mysql': {
      return 'getMySQLPool'
    }
    case 'postgresql': {
      return 'getPostgreSQLPool'
    }
    default: {
      throw new Error(`Unknown datasource: ${datasource.connectorType}`)
    }
  }
}
