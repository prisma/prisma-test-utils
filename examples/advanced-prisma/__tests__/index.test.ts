import { Pool } from '../../../packages/prisma-db-pool/src'
import { seed, Faker } from '../../../packages/prisma-faker/src'
import * as photon from '@generated/photon'

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
    dmmf: photon.dmmf,
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

  console.log({ db })

  const data = await seed(photon, schema, {
    photon: db,
    silent: false,
  })

  console.log({ db, data: JSON.stringify(data) })

  /* Create authors. */
  const client = new photon.Photon(db)
  const authors = await client.authors()

  expect(authors.length).toBe(4)

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})

test('blogs are created correctly', async () => {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()
  const data = await seed(photon, schema, {
    photon: db,
  })

  console.log({ db, data })

  /* Create authors. */
  const client = new photon.Photon(db)
  const blogs = await client.blogs()

  expect(blogs.length).toBe(3)

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})
