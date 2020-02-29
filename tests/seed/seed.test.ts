import execa from 'execa'
import * as fs from 'fs'
import * as path from 'path'

import seed from './@generated/prisma-test-utils/seed'
import { PrismaClient } from './@generated/client'

describe('seed:', () => {
  const client: PrismaClient = new PrismaClient({})

  const dbpath = path.resolve(__dirname, './data.db')
  const migrationspath = path.resolve(__dirname, './migrations')
  const schemaPath = path.resolve(__dirname, './schema.prisma')

  beforeAll(async () => {
    /* Clear the database. */

    if (fs.existsSync(migrationspath))
      fs.rmdirSync(migrationspath, { recursive: true })
    if (fs.existsSync(dbpath)) fs.unlinkSync(dbpath)
    await execa('yarn', [
      'prisma2',
      'migrate',
      'save',
      '--name',
      'init',
      '--experimental',
      '--create-db',
      '--schema',
      schemaPath,
    ])
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

  test('correctly seeds data', async () => {
    const data = await seed({
      seed: 42,
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
        Pet: {
          amount: 6,
          factory: {
            birthday: () => '2019-10-10T18:26:07.269Z',
          },
        },
        Toy: {
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
    })

    expect(data).toMatchSnapshot()

    const houses = await client.house.findMany({
      include: { residents: true },
    })
    const pets = await client.pet.findMany({
      include: { toys: true, users: true },
    })
    const toys = await client.toy.findMany({ include: { pet: true } })
    const users = await client.user.findMany({
      include: { pet: true, house: true },
    })

    expect([houses, pets, toys, users]).toMatchSnapshot()
    expect(houses.length).toBe(3)
    expect(pets.length).toBe(6)
    expect(toys.length).toBe(3)
    expect(users.length).toBe(5)
  })
})
