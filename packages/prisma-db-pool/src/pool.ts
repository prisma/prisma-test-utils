import { LiftEngine, DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import pify from 'pify'
import { withDefault } from './utils'

const writeFile = pify(fs.writeFile)
const makeDir = pify(fs.mkdir)

export type PoolDefinition = {
  dmmf: DMMF.Document
  pool: {
    min?: number
    max: number
  }
  cwd?: string
}

export type DBInstance = {
  cwd: string
  datamodel: string
}

export class Pool {
  private dmmf: DMMF.Document
  private cwd: string
  private dbs: {
    booting: string[]
    idle: DBInstance[]
    busy: DBInstance[]
  }
  private waiters: Waiter[]
  private capacity: number

  constructor(definition: PoolDefinition) {
    this.dmmf = definition.dmmf
    this.cwd = withDefault(process.cwd(), definition.cwd)
    this.dbs = {
      booting: [],
      idle: [],
      busy: [],
    }
    this.waiters = []
    this.capacity = definition.pool.max

    /* Start init */

    for (let index = 0; index < withDefault(0, definition.pool.min); index++) {
      this.createDBInstance().then(db => {
        this.dbs.idle = [...this.dbs.idle, db]
      })
    }
  }

  /**
   * Creates a new DB instances and lifts a migration.
   */
  private async createDBInstance(): Promise<DBInstance> {
    try {
      /* Constants */

      const id = Math.random()
        .toString(36)
        .slice(2)
      const tmpDir = os.tmpdir()
      const datasources: DataSource[] = [
        {
          name: 'db',
          connectorType: 'sqlite',
          url: `file:${tmpDir}`,
          config: {},
        },
      ]
      const dbFolder = path.join(tmpDir, './db/')

      /* Occupy resource pool. */
      this.dbs.booting = [...this.dbs.booting, id]

      /* Migrate Datamodel */
      const lift = new LiftEngine({
        projectDir: this.cwd,
      })

      const { datamodel } = await lift.convertDmmfToDml({
        dmmf: JSON.stringify(this.dmmf.datamodel),
        dataSources: datasources,
      })

      /* Release resource pool. */
      this.dbs.booting = this.dbs.booting.filter(dbId => dbId !== id)

      return {
        cwd: tmpDir,
        datamodel: datamodel,
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
    } else if (
      this.dbs.idle.length + this.dbs.busy.length + this.dbs.booting.length <
      this.capacity
    ) {
      /* If full capacity is not yet reached create new instance. */
      const db = await this.createDBInstance()
      this.dbs.busy = [...this.dbs.busy, db]

      return db
    } else {
      /* Add to the line. */
      const waiter = new Waiter()
      this.waiters = [...this.waiters, waiter]

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

    /* Add to the next in line or make idle. */
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
