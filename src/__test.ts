import { GeneratedSeedModels } from '../tests/seed/@generated/prisma-test-utils/seed'
import { PrismaClient, dmmf } from '../tests/seed/@generated/client'
import { getSeed, SeedFunction } from './static'

async function test() {
  const client: PrismaClient = new PrismaClient({})

  const seed: SeedFunction<PrismaClient, GeneratedSeedModels> = getSeed(dmmf)

  debugger

  // await client.toy.create({
  //   data: {
  //     id: 'abcd-c2cb-5a28-b4c6-5aa0680dac0c',
  //     name: 'hey',
  //     price: 2,
  //   },
  //   include: {},
  // })

  await seed({
    seed: 7,
    client,
    models: kit => ({
      '*': {
        amount: 5,
      },
      House: {
        amount: 3,
        factory: {
          residents: {
            max: 3,
          },
        },
      },
      User: {
        factory: {
          house: {
            min: 1,
          },
        },
      },
    }),
  })

  client.disconnect()
}

test()
