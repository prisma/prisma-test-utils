import { DataSource, LiftEngine } from '@prisma/lift'

export interface LiftMigrationOptions {
  id: string
  projectDir: string
  datasources: DataSource[]
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
}: LiftMigrationOptions): Promise<{ id: string; datamodel: string }> {
  const lift = new LiftEngine({ projectDir: projectDir })

  const datamodelDmmf = {
    enums: [],
    models: [],
    ...this.dmmf.datamodel,
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

  return { id, datamodel }
}
