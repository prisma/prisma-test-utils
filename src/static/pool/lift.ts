import { LiftEngine } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import { dmmfToDml, DataSource } from '@prisma/photon'

import * as path from 'path'

export interface LiftMigrationOptions {
  id: string
  projectDir: string
  datasources: DataSource[]
  dmmf: DMMF.Document
}

/**
 * Migrates the datamodel to the database.
 *
 * @param LiftOptions
 */
export async function migrateLift({
  id,
  projectDir,
  datasources,
  dmmf,
}: LiftMigrationOptions): Promise<{ id: string; datamodel: string }> {
  const schemaPath = path.resolve(projectDir, 'schema.prisma')
  const lift = new LiftEngine({ projectDir, schemaPath })

  /* Create datamodel.*/
  const datamodelDmmf = {
    enums: [],
    models: [],
    ...dmmf.datamodel,
  }

  const datamodel = await dmmfToDml({
    dmmf: datamodelDmmf,
    config: { datasources, generators: [] },
  })

  /* Get migration. */
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

  return { id, datamodel }
}
