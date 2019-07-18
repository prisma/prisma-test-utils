import { LiftEngine, DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import _ from 'lodash'
import pg from 'pg'

import { InternalPool } from '../pool'
import { Pool, DBInstance } from '../../types'
import { migrateLift } from '../lift'

// TODO: URL parsing!

/**
 * Creates a dmmf specific Internal Pool instance.
 *
 * @param dmmf
 */
export function getPostgreSQLPool(
  dmmf: DMMF.Document,
): { new (options: PostgreSQLPoolOptions): Pool } {
  return class extends PostgreSQLPool {
    constructor(options: PostgreSQLPoolOptions) {
      super(dmmf, options)
    }
  }
}

export interface PostgreSQLConnection {
  host: string
  port: number
  user: string
  password: string
  database: string
  schema: string
}

export interface PostgreSQLPoolOptions {
  connection: (id?: string) => PostgreSQLConnection
  prisma: {
    projectDir: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}

class PostgreSQLPool extends InternalPool {
  private dmmf: DMMF.Document
  private getConnection: (id?: string) => PostgreSQLConnection
  private getPirjectDir: (id?: string) => string

  constructor(dmmf: DMMF.Document, options: PostgreSQLPoolOptions) {
    super({ max: 0 })

    this.dmmf = dmmf
    this.getConnection = options.connection
    this.getPirjectDir = options.prisma.projectDir
  }

  /**
   * Creates a DB isntance.
   */
  async createDBInstance(id: string): Promise<DBInstance> {
    const connection = await this.getConnection(id)
    const url = readPostgreSQLUrl(connection)
    const projectDir = this.getPirjectDir(id)

    const datasources: DataSource[] = [
      {
        name: 'db',
        connectorType: 'sqlite',
        url: url,
        config: {},
      },
    ]

    /* Migrate using Lift. */

    const { datamodel } = await migrateLift({
      id,
      datasources,
      projectDir: projectDir,
      dmmf: this.dmmf,
    })

    const instance: DBInstance = {
      url: readPostgreSQLUrl(connection),
      cwd: projectDir,
      datamodel: datamodel,
    }

    return instance
  }

  /**
   * Delets DB instance.
   */
  async deleteDBInstance(instance: DBInstance): Promise<void> {
    const connection = parsePostgreSQLUrl(instance.url)
    const client = await getPostgreSQLClient(connection)

    try {
      await client.query(`DROP DATABASE IF EXISTS ${connection.database}`)
    } catch (err) {
      throw err
    }
  }
}

/**
 * Helper functions.
 */

/**
 * Returns a Postgres URL of the database from pool options.
 * @param options
 */
function readPostgreSQLUrl(connection: PostgreSQLConnection): string {
  return `postgres://${connection.user}:${connection.password}@${connection.host}:${connection.port}`
}

/**
 * Parses a PostgreSQL url.
 * @param url
 */
function parsePostgreSQLUrl(url: string): PostgreSQLConnection {
  const [user, password, host, portString, database] = url.match(
    'postgres://(w+):(w+)@(w+):(d+)/(w+)',
  )
  const port = parseInt(portString, 10)
  return { user, password, host, port, database, schema: '' }
}

/**
 * Returns a Postgres Client from the pool configuration and makes
 * sure that the connection is established.
 *
 * @param connection
 */
async function getPostgreSQLClient(
  connection: PostgreSQLConnection,
): Promise<pg.Client> {
  const client = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
  })

  /* Establishes a connection before returning the instance. */
  try {
    await client.connect()
    return client
  } catch (err) {
    throw err
  }
}
