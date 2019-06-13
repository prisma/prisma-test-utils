import { Pool } from '../../packages/prisma-db-pool/src'
import { seed } from '../../packages/prisma-faker/src'
import * as photon from '@generated/photon'

let pool = new Pool({
  dmmf: photon.dmmf,
  pool: {
    min: 3,
    max: 5,
  },
})

run()

async function run() {
  try {
    /* Acquire new db instance. */
    const db = await pool.getDBInstance()
    console.log(db)
    debugger
    const client = new photon.Photon(db)

    const data = await seed(
      photon,
      bag => ({
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
      }),
      {
        photon: db,
      },
    )

    debugger

    const blogs = await client.blogs()
    console.log(blogs)

    debugger

    /* Release the instance. */
    client.disconnect()
    pool.releaseDBInstance(db)
  } catch (err) {
    console.log(err)
  }
}
