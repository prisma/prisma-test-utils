import pg from 'pg'

import PostgreSQLPool, {
  DBInstance,
} from '../dbs/postgresql/@generated/prisma-test-utils/pool'

describe('postgresql:', () => {
  let created_schemas: string[] = []
  let instance: DBInstance

  const pool = new PostgreSQLPool({
    connection: id => {
      const schema = `postgres-tests-${id}`
      created_schemas.push(schema)

      return {
        database: process.env.POSTGRES_DB,
        host: '127.0.0.1',
        port: 5433,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        schema,
      }
    },
  })

  test('creates db instance', async () => {
    const client = await getPostgreSQLClient()
    const init_schemas = await getSchemas(client)

    instance = await pool.getDBInstance()

    const end_schemas = await getSchemas(client)

    expect(end_schemas).toEqual(init_schemas.concat(created_schemas).sort())
    expect(created_schemas.length).toBe(1)
    expect(instance.url.indexOf(created_schemas[0]) > -1).toBeTruthy()
  })

  test('releases db instance', async () => {
    const client = await getPostgreSQLClient()
    const init_schemas = await getSchemas(client)

    await pool.releaseDBInstance(instance)

    const end_schemas = await getSchemas(client)

    expect(
      init_schemas.some(schema => schema === created_schemas[0]),
    ).toBeTruthy()
    expect(
      end_schemas.some(schema => schema === created_schemas[0]),
    ).toBeFalsy()
  })
})

/* Helper functions. */

async function getSchemas(client: pg.Client): Promise<string[]> {
  const res = await client.query(
    'SELECT schema_name FROM information_schema.schemata',
  )

  return res.rows.map(r => r.schema_name).sort()
}

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
