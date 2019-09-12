import url from 'url'
import pg from 'pg'

import Photon from './dbs/postgresql/@generated/photon'
import PostgreSQLPool, {
  Pool,
} from './dbs/postgresql/@generated/prisma-test-utils/pool'
import { PostgreSQLConnection } from './dbs/postgresql/@generated/prisma-test-utils/static/pool/dbs/postgres'

describe('postgresql:', () => {
  test(
    'pool acquires new empty database instance',
    async () => {
      const pool = new PostgreSQLPool({
        connection: id => ({
          database: process.env.POSTGRES_DB,
          host: '127.0.0.1',
          port: 5433,
          user: process.env.POSTGRES_USER,
          password: process.env.POSTGRES_PASSWORD,
          schema: `prisma-test-utils-${id}`,
        }),
      })

      const [db_1, db_2] = await Promise.all([
        pool.getDBInstance(),
        pool.getDBInstance(),
      ])

      const client_1 = new Photon({ datasources: { postgres: db_1.url } })
      const client_2 = new Photon({ datasources: { postgres: db_2.url } })

      await client_1.users.create({
        data: {
          email: 'test@foo.com',
          isActive: true,
          name: 'foo',
        },
      })

      const res_1 = await client_1.users()
      const res_2 = await client_2.users()

      expect(res_1.length).toBe(1)
      expect(res_2.length).toBe(0)
    },
    60 * 1000,
  )

  test('pool releases db instance', async () => {})

  test('pool acquires and releases an instance', async () => {})

  test('pool drains the dbs', async () => {
    const client = await getPostgreSQLClient()
    const { rows: init_rows } = await client.query(
      'SELECT schema_name FROM information_schema.schemata',
    )
    const init_schemas = init_rows.map(r => r.schema_name).sort()

    /* Pool. */
    const new_schemas = []

    const pool = new PostgreSQLPool({
      connection: id => {
        const schema = `prisma-test-utils-${id}`
        new_schemas.push(schema)

        return {
          database: process.env.POSTGRES_DB,
          host: '127.0.0.1',
          port: 5433,
          user: process.env.POSTGRES_USER,
          password: process.env.POSTGRES_PASSWORD,
          schema: schema,
        }
      },
    })

    /* Create N instances. */
    const number = 2 // Math.round(Math.random() * 30)
    await Promise.all(
      Array.from({ length: number }, () => pool.getDBInstance()),
    )

    const { rows: mid_rows } = await client.query(
      'SELECT schema_name FROM information_schema.schemata',
    )
    const mid_schemas = mid_rows.map(r => r.schema_name).sort()

    /* Drain pool. */
    await pool.drain()

    const { rows: end_rows } = await client.query(
      'SELECT schema_name FROM information_schema.schemata',
    )
    const end_schemas = end_rows.map(r => r.schema_name).sort()

    /* Tests. */
    expect(init_schemas).toEqual(end_schemas)
    expect(mid_schemas).toEqual(init_schemas.concat(new_schemas).sort())
  })
})

/* Helper functions. */

async function getPostgreSQLClient(): Promise<pg.Client> {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: 5433,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  })

  /* Establishes a connection before returning the instance. */
  try {
    await client.connect()
    return client
  } catch (err) {
    throw err
  }
}
