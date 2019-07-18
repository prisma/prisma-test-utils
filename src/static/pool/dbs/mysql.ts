import { DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
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
): { new (options: MySQLPoolOptions): Pool } {
  return class extends MySQLPool {
    constructor(options: MySQLPoolOptions) {
      super(dmmf, options)
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
  prisma: {
    projectDir: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}

class MySQLPool extends InternalPool {
  private dmmf: DMMF.Document
  private getConnection: (id?: string) => MySQLConnection
  private getProjectDir: (id?: string) => string

  constructor(dmmf: DMMF.Document, options: MySQLPoolOptions) {
    super({ max: 0 })

    this.dmmf = dmmf
    this.getConnection = options.connection
    this.getProjectDir = options.prisma.projectDir
  }

  async createDBInstance(id: string): Promise<DBInstance> {
    const connection = this.getConnection(id)
    const uri = readMySQLURI(connection)
    const projectDir = this.getProjectDir(id)

    const datasources: DataSource[] = [
      {
        name: 'db',
        connectorType: 'mysql',
        url: uri,
        config: {},
      },
    ]

    /* Migrate using Lift. */

    const { datamodel } = await migrateLift({
      id,
      projectDir: projectDir,
      datasources,
      dmmf: this.dmmf,
    })

    const instance: DBInstance = {
      url: uri,
      cwd: projectDir,
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
