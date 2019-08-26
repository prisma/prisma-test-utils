import * as os from 'os'
import * as path from 'path'
import { LiftEngine } from '@prisma/lift'
import { dmmfToDml } from '@prisma/photon'

import SQLitePhoton, {
  dmmf as sqliteDMMF,
} from './dbs/sqlite/@generated/photon'

import seed from './dbs/sqlite/@generated/prisma-test-utils/seed'

describe('seed:', () => {
  let client: SQLitePhoton

  beforeAll(async () => {
    const id = Math.random().toString()
    const tmpDir = os.tmpdir()
    const dbFile = path.join(tmpDir, `./prisma-seed-test-${id}-db.db`)

    const lift = new LiftEngine({
      projectDir: tmpDir,
      schemaPath: '',
    })

    const datamodelDmmf = {
      enums: [],
      models: [],
      ...sqliteDMMF.datamodel,
    }

    const datamodel = await dmmfToDml({
      dmmf: datamodelDmmf,
      config: {
        datasources: [
          {
            name: 'test',
            connectorType: 'sqlite',
            config: {},
            url: { value: dbFile, fromEnvVar: null },
          },
        ],
        generators: [],
      },
    })

    const {
      datamodelSteps,
      errors: stepErrors,
    } = await lift.inferMigrationSteps({
      migrationId: id,
      datamodel: datamodel,
      assumeToBeApplied: [],
      sourceConfig: datamodel,
    })

    if (stepErrors.length > 0) {
      throw stepErrors
    }

    const { errors } = await lift.applyMigration({
      force: true,
      migrationId: id,
      steps: datamodelSteps,
      sourceConfig: datamodel,
    })

    if (errors.length > 0) {
      throw errors
    }

    const progress = () =>
      lift.migrationProgess({
        migrationId: id,
        sourceConfig: datamodel,
      })

    while ((await progress()).status !== 'MigrationSuccess') {
      /* Just wait */
    }

    /* Create new Photon instance. */
    client = new SQLitePhoton({
      datasources: {
        sqlite: '',
      },
    })
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
