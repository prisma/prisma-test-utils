import { LiftEngine, DataSource } from '@prisma/lift'
import { getDMMF, generatorDefinition } from '@prisma/photon'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export const datamodel = fs
  .readFileSync(path.join(__dirname, './datamodel.prisma'))
  .toString()

export async function getPhoton(): Promise<string> {
  const photonPath = path.join(os.tmpdir(), `./photon-test-${Math.random()}`)
  try {
    const output = generatorDefinition.generate({
      cwd: __dirname,
      generator: {
        name: 'photonjs',
        output: photonPath,
        config: {},
      },
      otherGenerators: [],
    })

    console.log(output)
    return photonPath
  } catch (err) {
    throw err
  }
}
/**
 * Returns a sample dmmf.
 */
export async function getDmmf(): Promise<DMMF.Document> {
  return getDMMF({ datamodel })
}

export async function spawnDB(dmmf: DMMF.Document) {
  const id = Math.random()
    .toString(36)
    .slice(2)
  const tmpDir = path.join(os.tmpdir(), `./prisma-test-db-${id}`)
  const dbFile = path.join(tmpDir, './db.db')
  const datasources: DataSource[] = [
    {
      name: 'db',
      connectorType: 'sqlite',
      url: `file:${dbFile}`,
      config: {},
    },
  ]

  /* Migrate Datamodel. */
  const lift = new LiftEngine({
    projectDir: tmpDir,
  })

  const datamodelDmmf = {
    enums: [],
    models: [],
    ...dmmf,
  }

  const { datamodel } = await lift.convertDmmfToDml({
    dmmf: JSON.stringify(datamodelDmmf),
    config: { datasources, generators: [] },
  })

  const { datamodelSteps, errors: stepErrors } = await lift.inferMigrationSteps(
    {
      migrationId: id,
      datamodel: datamodel,
      assumeToBeApplied: [],
      sourceConfig: datamodel,
    },
  )

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

  return {
    url: dbFile,
    cwd: tmpDir,
    datamodel: datamodel,
  }
}
