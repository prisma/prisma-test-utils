import { Pool } from '../../../packages/prisma-db-pool/src'
import { seed, Faker } from '../../../packages/prisma-faker/src'
import Photon, { dmmf } from '@generated/photon'

const schema: Faker = bag => ({
  Blog: {
    amount: 3,
    factory: {
      name: () => bag.faker.sentence({ words: 2 }),
      viewCount: () => bag.faker.natural({ max: 25 }),
      posts: {
        max: 3,
      },
      authors: {
        max: 2,
      },
    },
  },
  Author: {
    amount: 4,
    factory: {
      name: bag.faker.name,
    },
  },
  Post: {
    amount: 10,
    title: () => bag.faker.sentence({ words: 5 }),
  },
})

let pool: Pool

beforeAll(async () => {
  pool = new Pool({
    dmmf: dmmf,
    pool: {
      min: 3,
      max: 5,
    },
  })
})

afterAll(async () => {
  pool.drain()
})

test.only('authors are created correctly', async () => {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()

  const client = new Photon(db)
  console.log({ db })

  const data = await seed(client, dmmf, schema)

  console.log({ db, data: JSON.stringify(data) })

  /* Create authors. */
  const authors = await client.authors()

  expect(authors.length).toBe(4)

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})

test('blogs are created correctly', async () => {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()
  const client = new Photon(db)
  const data = await seed(client, dmmf, schema)

  /* Create authors. */
  const blogs = await client.blogs()

  expect(blogs.length).toBe(3)

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})
