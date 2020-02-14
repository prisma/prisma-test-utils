import { LiftEngine } from '@prisma/lift'
import { DataSource } from '@prisma/generator-helper'
import { DMMF } from '@prisma/client/runtime/dmmf-types'
import { dmmfToDml } from '@prisma/sdk'

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface LiftMigrationOptions {
  id: string
  projectDir: string
  tmpPrismaSchemaPath: string
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
  tmpPrismaSchemaPath,
  dmmf,
}: LiftMigrationOptions): Promise<{ id: string; datamodel: string }> {
  return { id, datamodel: '' }

  // /* Create datamodel. */
  // const datamodelDmmf = {
  //   enums: [],
  //   models: [],
  //   ...dmmf.datamodel,
  // }

  // const datamodel = await dmmfToDml({
  //   dmmf: datamodelDmmf,
  //   config: { datasources, generators: [] },
  // })

  // fs.writeFileSync(tmpPrismaSchemaPath, datamodel)

  // /* Init Lift. */
  // const lift = new LiftEngine({ projectDir, schemaPath: tmpPrismaSchemaPath })

  // /* Get migration. */
  // const { datamodelSteps, errors: stepErrors } = await lift.inferMigrationSteps(
  //   {
  //     migrationId: id,
  //     datamodel: datamodel,
  //     assumeToBeApplied: [],
  //     sourceConfig: datamodel,
  //   },
  // )

  // /* istanbul ignore next */
  // if (stepErrors.length > 0) {
  //   throw stepErrors
  // }

  // const { errors } = await lift.applyMigration({
  //   force: true,
  //   migrationId: id,
  //   steps: datamodelSteps,
  //   sourceConfig: datamodel,
  // })

  // /* istanbul ignore next */
  // if (errors.length > 0) {
  //   throw errors
  // }

  // const progress = () =>
  //   lift.migrationProgess({
  //     migrationId: id,
  //     sourceConfig: datamodel,
  //   })

  // while ((await progress()).status !== 'MigrationSuccess') {
  //   /* Just wait */
  // }

  // lift.stop()

  // return { id, datamodel }
}

/**
 * Allocates a new space in the tmp dir for the db instance.
 *
 * @param id
 */
export function getTmpPrismaSchemaPath(id: string): string {
  const tmpDir = os.tmpdir()
  const dbFile = path.join(tmpDir, `./${id}-schema.prisma`)
  return dbFile
}
