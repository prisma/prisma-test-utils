import os from 'os'
import path from 'path'

import Photon from './dbs/sqlite/@generated/photon'
import SQLitePool, {
  Pool,
} from './dbs/sqlite/@generated/prisma-test-utils/pool'

describe('sqlite:', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new SQLitePool({
      databasePath: id => path.join(os.tmpdir(), `./prisma-sqlite-${id}-db.db`),
    })
  })

  test(
    'pool acquires new empty database instance',
    async () => {
      const [db_1, db_2] = await Promise.all([
        pool.getDBInstance(),
        pool.getDBInstance(),
      ])

      const client_1 = new Photon({ datasources: { sqlite: db_1.url } })
      const client_2 = new Photon({ datasources: { sqlite: db_2.url } })

      await client_1.users.create({
        data: {
          email: 'email',
          isActive: true,
          name: 'name',
          house: {
            create: {
              numberOfRooms: 3,
              address: 'address',
            },
          },
          pet: {
            create: {
              animal: 'Dog',
              birthday: new Date().toISOString(),
              name: 'dogy',
            },
          },
        },
      })

      const res_1 = await client_1.users()
      const res_2 = await client_2.users()

      expect(res_1.length).toBe(1)
      expect(res_2.length).toBe(0)
    },
    60 * 1000,
  )
})
