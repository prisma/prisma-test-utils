import { DataSource } from '@prisma/photon'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import _ from 'lodash'
import pg from 'pg'
import url from 'url'

import { migrateLift } from '../lift'
import { InternalPool } from '../pool'
import { Pool, DBInstance } from '../../types'

/**
 * Creates a dmmf specific Internal Pool instance.
 *
 * @param dmmf
 */
export function getPostgreSQLPool(
  dmmf: DMMF.Document,
  cwd: string,
): { new (options: PostgreSQLPoolOptions): Pool } {
  return class extends PostgreSQLPool {
    constructor(options: PostgreSQLPoolOptions) {
      super(dmmf, options, cwd)
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
  pool?: {
    max?: number
  }
}

class PostgreSQLPool extends InternalPool {
  private dmmf: DMMF.Document
  private projectDir: string
  private getConnection: (id?: string) => PostgreSQLConnection

  constructor(
    dmmf: DMMF.Document,
    options: PostgreSQLPoolOptions,
    cwd: string,
  ) {
    super({ max: _.get(options, ['pool', 'max'], Infinity) })

    this.dmmf = dmmf
    this.projectDir = cwd
    this.getConnection = options.connection
  }

  /**
   * Creates a DB isntance.
   */
  async createDBInstance(id: string): Promise<DBInstance> {
    const connection = await this.getConnection(id)
    const url = readPostgreSQLUrl(connection)

    const datasources: DataSource[] = [
      {
        name: 'db',
        connectorType: 'postgresql',
        url: {
          value: url,
          fromEnvVar: null,
        },
        config: {},
      },
    ]

    /* Migrate using Lift. */

    const { datamodel } = await migrateLift({
      id,
      datasources,
      projectDir: this.projectDir,
      dmmf: this.dmmf,
    })

    const instance: DBInstance = {
      url: readPostgreSQLUrl(connection),
      cwd: this.projectDir,
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
      await client.query(`DROP SCHEMA IF EXISTS ${connection.schema}`)
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
  return `postgres://${connection.user}:${connection.password}@${connection.host}:${connection.port}/${connection.database}?schema=${connection.schema}`
}

/**
 * Parses a PostgreSQL url.
 * @param url
 */
function parsePostgreSQLUrl(urlStr: string): PostgreSQLConnection {
  const { query, auth, port: rawPort, hostname: host, pathname } = url.parse(
    urlStr,
    true,
  )
  const port = parseInt(rawPort, 10)
  const [, user, password] = auth.match(/(\w+):(\w+)/)
  const [, database] = pathname.match(/\/(\w+)/)

  /* istanbul ignore if */
  if (typeof query.schema !== 'string') {
    throw new Error(`Unsupported schema type: ${typeof query.schema}`)
  }

  const schema = query.schema

  return {
    user,
    password,
    host,
    port,
    database,
    schema,
  }
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
