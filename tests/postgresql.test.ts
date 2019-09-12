import Photon from './dbs/postgresql/@generated/photon'
import PostgreSQLPool, {
  Pool,
} from './dbs/postgresql/@generated/prisma-test-utils/pool'

describe('postgresql:', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new PostgreSQLPool({
      connection: id => ({
        database: process.env.POSTGRES_DB,
        host: '127.0.0.1',
        port: 5433,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        schema: `prisma-test-utils-${id}`,
      }),
    })
  })

  test(
    'pool acquires new empty database instance',
    async () => {
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

  test('pool drains the dbs', async () => {})
})
