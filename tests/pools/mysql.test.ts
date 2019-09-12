import mysql from 'mysql'

import MySQLPool, {
  DBInstance,
} from '../dbs/mysql/@generated/prisma-test-utils/pool'

describe('mysql:', () => {
  let created_dbs: string[] = []
  let instance: DBInstance

  const pool = new MySQLPool({
    connection: id => {
      const database = `mysql-tests-${id}`
      created_dbs.push(database)

      return {
        database: database,
        host: '127.0.0.1',
        port: 3307,
        user: 'root',
        password: process.env.MYSQL_ROOT_PASSWORD,
      }
    },
  })

  test('creates db instance', async () => {
    const client = await getMySQLClient()
    const init_dbs = await getDatabases(client)

    instance = await pool.getDBInstance()

    const end_dbs = await getDatabases(client)

    expect(end_dbs).toEqual(init_dbs.concat(created_dbs).sort())
    expect(created_dbs.length).toBe(1)
    expect(instance.url.indexOf(created_dbs[0]) > -1).toBeTruthy()
  })

  test('releases db instance', async () => {
    const client = await getMySQLClient()
    const init_dbs = await getDatabases(client)

    await pool.releaseDBInstance(instance)

    const end_dbs = await getDatabases(client)

    expect(init_dbs.some(schema => schema === created_dbs[0])).toBeTruthy()
    expect(end_dbs.every(schema => schema !== created_dbs[0])).toBeTruthy()
  })
})

/* Helper functions. */

async function getDatabases(client: mysql.Connection): Promise<string[]> {
  const res = await query<{ schema_name: string }[]>(
    client,
    'SELECT schema_name FROM information_schema.schemata',
  )

  console.log(res)
  return res.map(r => r.schema_name).sort()
}

async function query<T>(client: mysql.Connection, query: string): Promise<T> {
  return new Promise((resolve, reject) => {
    client.query(query, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

async function getMySQLClient(): Promise<mysql.Connection> {
  const client = mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD,
  })

  return new Promise((resolve, reject) => {
    client.connect(err => {
      if (err) reject(err)
      else resolve(client)
    })
  })
}
