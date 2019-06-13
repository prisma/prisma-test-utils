import { LiftEngine, DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import * as os from 'os'
import * as path from 'path'
import { withDefault } from './utils'

export type PoolDefinition = {
  dmmf: DMMF.Document
  pool: {
    min?: number
    max: number
  }
}

export type DBInstance = {
  cwd: string
  datamodel: string
}

export class Pool {
  private dmmf: DMMF.Document
  private dbs: {
    booting: string[]
    idle: DBInstance[]
    busy: DBInstance[]
  }
  private waiters: Waiter[]
  private capacity: number

  constructor(definition: PoolDefinition) {
    this.dmmf = definition.dmmf
    this.dbs = {
      booting: [],
      idle: [],
      busy: [],
    }
    this.waiters = []
    this.capacity = definition.pool.max

    /* Start init */

    for (let index = 0; index < withDefault(0, definition.pool.min); index++) {
      this.createDBInstance()
    }
  }

  /**
   * Creates a new DB instances and lifts a migration.
   */
  private async createDBInstance(): Promise<void> {
    try {
      /* Constants */

      const id = Math.random()
        .toString(36)
        .slice(2)
      const tmpDir = path.join(os.tmpdir(), `prisma-pool-${id}`)
      const dbFile = path.join(tmpDir, './db.db')
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

      while ((await progress()).status !== 'Success') {
        /* Just wait */
      }

      /* Release resource pool. */
      this.dbs.booting = this.dbs.booting.filter(dbId => dbId !== id)

      const instance: DBInstance = {
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

  /**
   * Returns a Photon instance from the pool once made available, and cleans
   * and populates the instance if necessary.
   *
   * The returned Photon instance includes the db identifier used for
   * the database releasing.
   *
   * @param opts
   */
  async getDBInstance(): Promise<DBInstance> {
    /**
     * Check whether any of the instances is available and creates a new one
     * if the pool limit is not yet reached, otherwise waits for the available
     * instance.
     */
    if (this.dbs.idle.length > 0) {
      /* If available take a resource and return it right away. */
      const [db, ...remaining] = this.dbs.idle
      this.dbs.idle = remaining
      this.dbs.busy = [...this.dbs.busy, db]

      return db
    } else {
      /* Add to the line. */
      const waiter = new Waiter()
      this.waiters = [...this.waiters, waiter]

      /* If full capacity is not yet reached create new instance. */
      if (
        this.dbs.idle.length + this.dbs.busy.length < this.capacity &&
        this.dbs.booting.length === 0
      ) {
        this.createDBInstance()
      }

      return waiter.wait()
    }
  }

  /**
   * Makes the instance available.
   */
  async releaseDBInstance(db: DBInstance): Promise<void> {
    /**
     * Find the busy instance, remove that instance and give
     * it to the next in line.
     */
    const instance = this.dbs.busy.find(bdb => bdb.cwd === db.cwd)
    this.dbs.busy.filter(bdb => bdb.cwd !== db.cwd)

    /* Allocate to the next waiter in line or make idle. */
    if (this.waiters.length > 0) {
      const [waiter, ...remainingWaiters] = this.waiters
      this.waiters = remainingWaiters
      waiter.allocate(instance)
    } else {
      this.dbs.idle = [...this.dbs.idle, instance]
    }
  }

  /**
   * Drains the pool by deleting all instances.
   */
  async drain(): Promise<void> {
    // TODO
  }
}

class Waiter {
  private promise: Promise<DBInstance>
  private resolve: (dbi: DBInstance) => void

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
    })
  }

  wait(): Promise<DBInstance> {
    return this.promise
  }

  allocate(instance: DBInstance): void {
    this.resolve(instance)
  }
}
