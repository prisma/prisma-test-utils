import { LiftEngine, DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import _ from 'lodash'
import * as os from 'os'
import * as path from 'path'

import { InternalPool } from '../pool'
import { getTmpDBFile } from '../utils'
import { Pool, PoolOptions, DBInstance } from '../../types'

/**
 * Creates a dmmf specific Internal Pool instance.
 *
 * @param dmmf
 */
export function getSQLitePool(
  dmmf: DMMF.Document,
): { new (options?: SQLitePoolOptions): Pool } {
  return class extends SQLitePool {
    constructor(options?: SQLitePoolOptions) {
      super(dmmf, options)
    }
  }
}

export interface SQLitePoolOptions {
  getDBFile?: () => string
  capacity?: number
}

class SQLitePool extends InternalPool {
  private dmmf: DMMF.Document
  private getDBFile: () => string

  constructor(dmmf: DMMF.Document, options?: SQLitePoolOptions) {
    super({
      pool: {
        max: _.get(options, ['capacity'], Infinity),
      },
    })

    this.dmmf = dmmf

    if (options && options.getDBFile) {
      this.getDBFile = options.getDBFile
    } else {
      this.getDBFile = getTmpDBFile
    }
  }

  /**
   * Creates a new DB instances and lifts a migration.
   */
  async createDBInstance(): Promise<void> {
    try {
      /* Constants */

      const id = Math.random()
        .toString(36)
        .slice(2)
      const dbFile = this.getDBFile()
      const tmpDir = path.dirname(dbFile)
      const datasources: DataSource[] = [
        {
          name: 'db',
          connectorType: 'sqlite',
          url: `file:${dbFile}`,
          config: {},
        },
      ]

      /* Occupy resource pool. */
      this.dbs.booting = [...this.dbs.booting, id]

      /* Migrate Datamodel. */
      const lift = new LiftEngine({
        projectDir: tmpDir,
      })

      const datamodelDmmf = {
        enums: [],
        models: [],
        ...this.dmmf.datamodel,
      }

      const { datamodel } = await lift.convertDmmfToDml({
        dmmf: JSON.stringify(datamodelDmmf),
        config: { datasources, generators: [] },
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

      /* Release resource pool. */
      this.dbs.booting = this.dbs.booting.filter(dbId => dbId !== id)

      const instance: DBInstance = {
        url: dbFile,
        cwd: tmpDir,
        datamodel: datamodel,
      }

      /**
       * If there's a waiter in line allocate an instance, otherwise make it idle.
       */
      if (this.waiters.length > 0) {
        const [waiter, ...remainingWaiters] = this.waiters
        this.waiters = remainingWaiters
        this.dbs.busy = [...this.dbs.busy, instance]
        waiter.allocate(instance)
      } else {
        this.dbs.idle = [...this.dbs.idle, instance]
      }
    } catch (err) {
      throw err
    }
  }
}
