import { PrismaClient } from '@prisma/client'
import seed from '@prisma/test-utils/seed'

const client = new PrismaClient()

async function main() {
  await seed({
    client,
    models: kit => ({
      '*': {
        amount: 3,
      },
      Author: {
        amount: 2,
        factory: {
          name: kit.faker.name,
          posts: {
            min: 3,
          },
        },
      },
      Post: {
        amount: 5,
        factory: {
          title: kit.faker.sentence,
        },
      },
      Blog: {
        amount: 5,
      },
    }),
  })

  client.disconnect()
}

main().catch(e => {
  console.error(e)
  client.disconnect()
})
