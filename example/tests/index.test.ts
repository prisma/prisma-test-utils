import { PrismaClient } from '@prisma/client'
import seed from '@prisma/test-utils/seed'
import SQLitePool, { Pool } from '@prisma/test-utils/pool'

describe('blog:', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = new SQLitePool({
      pool: {
        max: 5,
      },
    })
  })

  afterAll(async () => {
    await pool.drain()
  })

  test('creates blog', () =>
    pool.run(async db => {
      const client = new PrismaClient({
        datasources: {
          db: db.url,
        },
      })

      await seed({
        client,
        models: kit => ({
          '*': {
            amount: 5,
          },
          Blog: {
            factory: {
              name: kit.faker.sentence,
              posts: {
                max: 1,
              },
            },
          },
        }),
      })

      /* Query authors. */
      const authors = await client.author.findMany()

      expect(authors).toMatchSnapshot()

      /* Disconnect the client. */
      client.disconnect()
    }))
})
