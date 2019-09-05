import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import { DataSource } from '@prisma/photon'
import _ from 'lodash'
import mysql from 'mysql'

import { migrateLift } from '../lift'
import { InternalPool } from '../pool'
import { Pool, DBInstance } from '../../types'

/**
 * Creates a dmmf specific Internal Pool instance.
 *
 * @param dmmf
 */
export function getMySQLPool(
  dmmf: DMMF.Document,
  cwd: string,
): { new (options: MySQLPoolOptions): Pool } {
  return class extends MySQLPool {
    constructor(options: MySQLPoolOptions) {
      super(dmmf, options, cwd)
    }
  }
}

export interface MySQLConnection {
  host: string
  port: string
  user: string
  password: string
  database: string
}

export interface MySQLPoolOptions {
  connection: (id?: string) => MySQLConnection
  pool?: {
    max?: number
  }
}

class MySQLPool extends InternalPool {
  private dmmf: DMMF.Document
  private projectDir: string
  private getConnection: (id?: string) => MySQLConnection

  constructor(dmmf: DMMF.Document, options: MySQLPoolOptions, cwd: string) {
    super({ max: _.get(options, ['pool', 'max'], Infinity) })

    this.dmmf = dmmf
    this.projectDir = cwd
    this.getConnection = options.connection
  }

  async createDBInstance(id: string): Promise<DBInstance> {
    const connection = this.getConnection(id)
    const uri = readMySQLURI(connection)

    const datasources: DataSource[] = [
      {
        name: 'db',
        connectorType: 'mysql',
        url: {
          value: uri,
          fromEnvVar: null,
        },
        config: {},
      },
    ]

    /* Migrate using Lift. */

    const { datamodel } = await migrateLift({
      id,
      projectDir: this.projectDir,
      datasources,
      dmmf: this.dmmf,
    })

    const instance: DBInstance = {
      url: uri,
      cwd: this.projectDir,
      datamodel: datamodel,
    }

    return instance
  }

  async deleteDBInstance(instance: DBInstance): Promise<void> {
    const connection = parseMySQLURI(instance.url)
    try {
      const client = await getMySQLClient(connection)
      await query(client, `DROP DATABASE IF EXISTS ${connection.database}`)
    } catch (err) {
      throw err
    }
  }
}

/* Helper functions */

/**
 * Creates a mysql.Connection instance and makes sure it's connected.
 *
 * @param connection
 */
async function getMySQLClient(
  connection: MySQLConnection,
): Promise<mysql.Connection> {
  const uri = readMySQLURI(connection)
  const client = mysql.createConnection(uri)

  return new Promise((resolve, reject) => {
    client.connect(err => {
      if (err) reject(err)
      else resolve(client)
    })
  })
}

/**
 * Executes a query as a promise against MySQL db with established conneciton.
 *
 * @param connection
 * @param query
 */
async function query<T>(client: mysql.Connection, query: string): Promise<T> {
  return new Promise((resolve, reject) => {
    client.query(query, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

/**
 * Converts a MySQLConnection into a MySQL URI.
 *
 * @param connection
 */
function readMySQLURI(connection: MySQLConnection): string {
  return `mysql://${connection.user}:${connection.password}@${connection.host}:${connection.port}/${connection.database}`
}

/**
 * Parses MySQL URI into MySQLConnection.
 *
 * @param uri
 */
function parseMySQLURI(uri: string): MySQLConnection {
  const [user, password, host, port, database] = uri.match(
    'mysql://(w+):(w+)@(w+):(d+)/(w+)',
  )

  return {
    user,
    password,
    host,
    port,
    database,
  }
}
