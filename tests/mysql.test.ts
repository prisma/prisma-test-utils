import Photon from './dbs/mysql/@generated/photon'
import MySQLPool, { Pool } from './dbs/mysql/@generated/prisma-test-utils/pool'

describe('mysql:', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new MySQLPool({
      connection: id => ({
        database: `${id}-prisma-test-utils`,
        host: '127.0.0.1',
        port: '3306',
        user: 'root',
        password: 'root',
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

      const client_1 = new Photon({ datasources: { mysql: db_1.url } })
      const client_2 = new Photon({ datasources: { mysql: db_2.url } })

      await client_1.users.create({
        data: {
          email: 'test@foo.com',
          isActive: true,
          name: 'foo',
          pet: 'Dog',
        },
      })

      const res_1 = await client_1.users()
      const res_2 = await client_2.users()

      expect({ res_1, res_2 }).toMatchSnapshot()
    },
    60 * 1000,
  )
})
