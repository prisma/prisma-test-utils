import { Pool } from '../../../packages/prisma-db-pool/src'
import { dmmf, Photon } from '@generated/photon'

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

test('authors are queried correctly', async () => {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()
  const client = new Photon(db)

  const authors = await client.authors()

  expect(authors.length).toBe(3)

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})
