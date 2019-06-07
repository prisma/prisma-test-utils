import { seed } from '../src'
import { prisma } from './prisma/prisma-client'

run()

async function run() {
  const data = await seed(
    prisma,
    bag => ({
      User: {
        amount: 5,
        factory: {
          name: bag.faker.name,
          bookmarks: {
            max: 5,
          },
        },
      },
      Bookmark: {
        amount: 10,
        factory: {
          page: bag.faker.url,
          numberOfVisits: () => bag.faker.integer({ min: 0, max: 100 }),
        },
      },
    }),
    {
      silent: false,
      seed: 1,
    },
  )

  console.log(data)
}
