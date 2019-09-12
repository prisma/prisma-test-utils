import { Pool, DBInstance } from '../types'

export type PoolOptions = {
  max: number
}

export abstract class InternalPool implements Pool {
  protected dbs: {
    booting: string[]
    busy: DBInstance[]
  }
  protected waiters: Waiter[]
  protected capacity: number

  constructor(options: PoolOptions) {
    this.dbs = {
      booting: [],
      busy: [],
    }
    this.waiters = []
    this.capacity = options.max
  }

  /**
   * A required method used to create new databases in the pool.
   */
  protected abstract async createDBInstance(id?: string): Promise<DBInstance>

  /**
   * A required methdo used to delete databases in the pool.
   *
   * @param instance
   */
  protected abstract async deleteDBInstance(
    instance?: DBInstance,
  ): Promise<void>

  /**
   * Creates a new DBInstance and occupies the space in the pool.
   */
  public async getDBInstance(): Promise<DBInstance> {
    /**
     * If full capacity is not yet reached create new instance.
     * Otherwise, return a waiter which will wait until there's
     * an available space.
     */
    if (this.dbs.busy.length + this.dbs.booting.length < this.capacity) {
      /* Generates unique DB identifier. */
      const id = Math.random()
        .toString(36)
        .slice(2)

      /* Creates a new DBInstance. */
      this.dbs.booting = this.dbs.booting.concat(id)
      const dbInstance = await this.createDBInstance(id)
      this.dbs.booting = this.dbs.booting.filter(dbId => dbId !== id)

      this.dbs.busy = this.dbs.busy.concat(dbInstance)

      /**
       * If there's a waiter in the line it first gets the instnace.
       * A new waiter is created for the current request.
       *
       * If there are no waiters in the line, we return the DB instance.
       */
      const [waiter, ...remainingWaiters] = this.waiters
      if (waiter) {
        /**
         * Gives an instances to existing waiter and
         * returns a new waiter.
         */
        waiter.allocate(dbInstance)

        const newWaiter = new Waiter()
        this.waiters = [...remainingWaiters, newWaiter]

        return waiter.wait()
      } else {
        return dbInstance
      }
    } else {
      /* Add to the line. */
      const waiter = new Waiter()
      this.waiters = [...this.waiters, waiter]

      return waiter.wait()
    }
  }

  /**
   * Releases a db isntance in the pool and triggers the creation
   * of new instance if there are waiters.
   *
   * @param db
   */
  public async releaseDBInstance(db: DBInstance): Promise<void> {
    const instance = this.dbs.busy.find(bdb => bdb.url === db.url)!
    try {
      /* Finds the busy instance and releases it. */
      await this.deleteDBInstance(instance)
      this.dbs.busy = this.dbs.busy.filter(bdb => bdb.url !== db.url)

      /* Triggers the creation of new instance if there's a waiter for it. */
      if (this.waiters.length > 0) this.getDBInstance()
    } catch (err) {
      throw err
    }
  }
  /**
   * A function wrapper which makes sure that the db instance is
   * correctly allocated prior to execution of the function, and correctly
   * released after the execution has finished.
   *
   * @param fn
   */
  public async run<T>(fn: (db: DBInstance) => Promise<T>): Promise<T> {
    const db = await this.getDBInstance()
    try {
      const result = await fn(db)
      await this.releaseDBInstance(db)
      return result
    } catch (e) {
      await this.releaseDBInstance(db)
      throw e
    }
  }

  /**
   * Releases all remaining instances in the pool.
   */
  public async drain(): Promise<void> {
    const actions = this.dbs.busy.map(i => this.releaseDBInstance(i))
    try {
      await Promise.all(actions)
    } catch (err) {
      throw err
    }
  }
}

/* Pools specific to a DB type. */

class Waiter {
  private promise: Promise<DBInstance>
  private resolve: (dbi: DBInstance) => void = () => {}

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
