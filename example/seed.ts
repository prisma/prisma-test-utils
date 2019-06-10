import { seed } from '../src'
import { prisma } from './prisma/prisma-client'

run()

async function run() {
  try {
    const data = await seed(
      prisma,
      bag => ({
        User: {
          amount: 2,
          factory: {
            name: bag.faker.name,
            bookmarks: {
              max: 5,
            },
          },
        },
        Dog: {
          amount: 2,
        },
        Bookmark: {
          amount: 6,
          factory: {
            page: bag.faker.url,
            numberOfVisits: () => bag.faker.integer({ min: 0, max: 100 }),
          },
        },
      }),
      {
        silent: true,
        seed: 1,
      },
    )

    debugger

    console.log(data)
  } catch (err) {
    console.error(err.message)
  }
}
