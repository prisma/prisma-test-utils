import Photon from './dbs/sqlite/@generated/photon'
import SQLitePool, {
  Pool,
} from './dbs/sqlite/@generated/prisma-test-utils/pool'
import seed from './dbs/sqlite/@generated/prisma-test-utils/seed'

describe('sql:', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new SQLitePool({
      prisma: {
        cwd: process.cwd,
      },
    })
  })

  test('pool works as expected', async () => {})
})
