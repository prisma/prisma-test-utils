import Photon from '@generated/photon'
import seed from '@generated/test-utils/seed'
import Pool from '@generated/test-utils/pool'

// const schema bag => ({
//   Blog: {
//     amount: 3,
//     factory: {
//       name: () => bag.faker.sentence({ words: 2 }),
//       viewCount: () => bag.faker.natural({ max: 25 }),
//       posts: {
//         max: 3,
//       },
//       authors: {
//         max: 2,
//       },
//     },
//   },
//   Author: {
//     amount: 4,
//     factory: {
//       name: bag.faker.name,
//     },
//   },
//   Post: {
//     amount: 10,
//     title: () => bag.faker.sentence({ words: 5 }),
//   },
// })

let pool

beforeAll(async () => {
  pool = new Pool({
    pool: {
      max: 5,
    },
  })
})

afterAll(async () => {
  pool.drain()
})

test(
  'authors are created correctly',
  pool.run(async db => {
    /* Acquire new db instance. */

    const client = new Photon(db)
    console.log({ db })

    const data = await seed({ client })

    console.log({ db, data: JSON.stringify(data) })

    /* Create authors. */
    const authors = await client.authors()

    expect(authors.length).toBe(4)

    /* Release the instance. */
    client.disconnect()
    pool.releaseDBInstance(db)
  }),
)
