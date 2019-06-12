import { Pool } from '../../packages/prisma-db-pool/src'
import { dmmf, Photon } from '@generated/photon'

debugger

let pool = new Pool({
  dmmf: dmmf,
  pool: {
    min: 3,
    max: 5,
  },
})

debugger

run()

debugger

async function run() {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()
  console.log(db)
  debugger
  const client = new Photon(db)

  const authors = await client.authors()

  expect(authors.length).toBe(3)

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
}
