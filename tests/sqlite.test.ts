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

  test('correctly generates seed data', async () => {
    const client = new Photon({})

    const data = await seed({
      client,
      models: kit => ({
        '*': {
          amount: 5,
        },
        House: {
          amount: 3,
        },
        Pet: {
          amount: 3,
          factory: {
            animal: () => 'Dog',
          },
        },
        Toy: {
          amount: 3,
        },
        User: {
          amount: 2,
        },
      }),
      persist: false,
    })

    expect(data).toMatchSnapshot()
  })

  test('creates pool correctly', async () => {})
})
