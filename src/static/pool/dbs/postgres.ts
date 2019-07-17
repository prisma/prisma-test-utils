import { LiftEngine, DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import _ from 'lodash'
import pg from 'pg'

import { InternalPool } from '../pool'
import { Pool, DBInstance } from '../../types'
import { migrateLift } from '../lift'

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
    cwd: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}

class PostgreSQLPool extends InternalPool {
  private dmmf: DMMF.Document
  private getClient: (
    id?: string,
  ) => Promise<{
    client: pg.Client
    connection: PostgreSQLConnection
  }>
  private getCwdPath: (id?: string) => string

  constructor(dmmf: DMMF.Document, options: PostgreSQLPoolOptions) {
    super({ max: 0 })

    this.dmmf = dmmf
    this.getClient = getPostgreSQLClient(options.connection)
    this.getCwdPath = options.prisma.cwd
  }

  /**
   * Creates a DB isntance.
   */
  async createDBInstance(id: string): Promise<DBInstance> {
    const { client, connection } = await this.getClient()
    const dbUrl = readPostgreSQLUrl(connection)
    const cwdPath = this.getCwdPath()

    const datasources: DataSource[] = [
      {
        name: 'db',
        connectorType: 'sqlite',
        url: `postgres:${dbUrl}`,
        config: {},
      },
    ]

    try {
      /* Creates database. */
      client.query(
        `CREATE DATABASE ${connection.database} OWNER = ${connection.user} ENCODING = 'UTF-8' TEMPLATE template1`,
      )

      /* Migrate using Lift. */

      const { datamodel } = await migrateLift({
        id,
        datasources,
        projectDir: cwdPath,
      })

      const instance: DBInstance = {
        url: readPostgreSQLUrl(connection),
        cwd: cwdPath,
        datamodel: datamodel,
      }

      return instance
    } catch (err) {
      throw err
    }
  }

  /**
   * Delets DB instance.
   */
  async deleteDBInstance(isntance: DBInstance): Promise<void> {
    // TODO:
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
  return { host: '', port: 0, user: '', password: '', database: '', schema: '' }
}

/**
 * Returns a Postgres Client from the pool configuration and makes
 * sure that the connection is established.
 *
 * @param options
 */
function getPostgreSQLClient(
  getConnection: () => PostgreSQLConnection,
): () => Promise<{ client: pg.Client; connection: PostgreSQLConnection }> {
  return async () => {
    const connection = getConnection()
    const client = new pg.Client({
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
    })

    /* Establishes a connection before returning the instance. */
    try {
      await client.connect()
      return { client, connection }
    } catch (err) {
      throw err
    }
  }
}
