import execa from 'execa'
import * as fs from 'fs'
import * as path from 'path'

import seed from './@generated/prisma-test-utils/seed'
import { PrismaClient } from './@generated/client'

describe('seed:', () => {
  const client: PrismaClient = new PrismaClient({})

  const dbpath = path.resolve(__dirname, './data.db')
  const schemaPath = path.resolve(__dirname, './schema.prisma')

  beforeAll(async () => {
    /* Clear the database. */

    if (fs.existsSync(dbpath)) fs.unlinkSync(dbpath)
    await execa('yarn', [
      'prisma2',
      'migrate',
      'up',
      '--experimental',
      '--auto-approve',
      '--create-db',
      '--schema',
      schemaPath,
    ])
  }, 60 * 1000)

  afterAll(async () => {
    await client.disconnect()
    if (fs.existsSync(dbpath)) fs.unlinkSync(dbpath)
  })

  test('correctly generates seed data', async () => {
    const data = await seed({
      client,
      models: kit => ({
        '*': {
          amount: 5,
        },
        House: {
          amount: 3,
        },
        Pet: {
          amount: 3,
          factory: {
            animal: 'Dog',
            birthday: () => '2019-10-10T18:26:07.269Z',
          },
        },
        Toy: {
          amount: 3,
        },
        User: {
          amount: 2,
          factory: {
            house: {
              min: 1,
            },
          },
        },
      }),
      persist: false,
    })

    expect(data).toMatchSnapshot()
  })

  test('correctly seeds the data', async () => {
    await seed({
      client,
      models: kit => ({
        '*': {
          amount: 5,
        },
        House: {
          amount: 3,
        },
        Pet: {
          factory: {
            name: kit.faker.name,
            animal: 'Dog',
            birthday: '2019-10-10T18:26:07.269Z',
          },
        },
      }),
      persist: true,
    })

    /* Tests. */

    const houses = await client.house.findMany({ include: { residents: true } })
    const pets = await client.pet.findMany({
      include: { toys: true, users: true },
    })
    const toys = await client.toy.findMany({ include: { pet: true } })
    const users = await client.user.findMany({
      include: { pet: true, house: true },
    })

    expect([houses, pets, toys, users]).toMatchSnapshot()
    expect(houses.length).toBe(3)
    expect(pets.length).toBe(5)
    expect(toys.length).toBe(5)
    expect(users.length).toBe(5)
  })
})
