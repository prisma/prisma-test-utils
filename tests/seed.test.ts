import * as os from 'os'
import * as path from 'path'

import { migrateLift } from '../src/static/pool/lift'

import seed from './dbs/sqlite/@generated/prisma-test-utils/seed'
import Photon, { dmmf } from './dbs/sqlite/@generated/photon'

describe('seed:', () => {
  let client: Photon

  beforeAll(async () => {
    console.log('Starts beforeAll')
    const id = Math.random().toString()
    const tmpDir = os.tmpdir()
    const dbFile = path.join(tmpDir, `./prisma-seed-test-${id}-db.db`)
    const schemaPrismaFile = path.join(
      tmpDir,
      `./prisma-schema-test-${id}-db.prisma`,
    )

    console.log(`DB file: ${dbFile}`)

    console.log(`Migrating schema using Lift`)

    await migrateLift({
      id: id,
      projectDir: path.join(__dirname, './dbs/sqlite'),
      datasources: [
        {
          name: 'test',
          connectorType: 'sqlite',
          config: {},
          url: { value: `file:${dbFile}`, fromEnvVar: null },
        },
      ],
      tmpPrismaSchemaPath: schemaPrismaFile,
      dmmf,
    })

    /* Create new Photon instance. */
    client = new Photon({
      datasources: {
        sqlite: `file:${dbFile}`,
      },
    })

    console.log(`Finished beforeAll.`)
  }, 60 * 1000)

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
            animal: () => 'Dog',
          },
        },
        Toy: {
          amount: 3,
        },
        User: {
          amount: 2,
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
        Pet: {
          factory: {
            animal: 'Dog',
          },
        },
      }),
      persist: true,
    })

    /* Tests. */

    const data = await Promise.all([
      client.houses(),
      client.pets(),
      client.toys(),
      client.users(),
    ])

    expect(data).toMatchSnapshot()
  })
})
