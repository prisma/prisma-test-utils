import { seed } from '../../../packages/prisma-faker/src'
import Photon, { dmmf } from '@generated/photon'

beforeAll(async () => {
  const client = new Photon()
  const data = await seed(client, dmmf, bag => ({
    Blog: {
      amount: 5,
      factory: {
        name: bag.faker.sentence,
        viewCount: bag.faker.integer,
      },
    },
    Author: {
      amount: 3,
      factory: {
        name: bag.faker.name,
      },
    },
    Post: {
      amount: 10,
      factory: {
        title: bag.faker.sentence,
      },
    },
  }))

  console.log(data)
})

test('user is queried correctly', async () => {
  const client = new Photon()
  const posts = await client.blogs({})

  expect(posts.length).toBe(5)

  client.disconnect()
})
