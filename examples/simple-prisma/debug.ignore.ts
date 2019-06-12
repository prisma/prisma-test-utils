import { seed } from '../../packages/prisma-faker/src'
import * as photon from '@generated/photon'

run()

async function run() {
  try {
    const data = await seed(
      photon,
      bag => ({
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
      }),
      {
        silent: true,
      },
    )

    console.log(data)
  } catch (err) {
    console.log(err)
  }
}
