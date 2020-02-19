import { GeneratedSeedModels } from '../tests/seed/@generated/prisma-test-utils/seed'
import { PrismaClient, dmmf } from '../tests/seed/@generated/client'
import { getSeed, SeedFunction } from './static'

async function test() {
  const client: PrismaClient = new PrismaClient({})

  const seed: SeedFunction<PrismaClient, GeneratedSeedModels> = getSeed(dmmf)

  debugger

  await seed({
    client,
    models: kit => ({
      '*': {
        amount: 5,
      },
      Pet: {
        factory: {
          animal: 'Dog',
          birthday: '2019-10-10T18:26:07.269Z',
        },
      },
      House: {
        amount: 3,
      },
      User: {
        factory: {
          house: {
            min: 1,
          },
        },
      },
    }),
    persist: true,
  })
}

test()
