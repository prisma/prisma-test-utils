import { Pool, PoolOptions, DBInstance } from '../types'

export abstract class InternalPool implements Pool {
  protected dbs: {
    booting: string[]
    idle: DBInstance[]
    busy: DBInstance[]
  }
  protected waiters: Waiter[]
  protected capacity: number
  /* TODO: */

  constructor(options?: PoolOptions) {
    this.dbs = {
      booting: [],
      idle: [],
      busy: [],
    }
    this.waiters = []
  }

  /**
   *
   */
  public abstract async createDBInstance(): Promise<void>

  /**
   * Run the encapsulated funciton.
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
   * Returns a Photon instance from the pool once made available, and cleans
   * and populates the instance if necessary.
   *
   * The returned Photon instance includes the db identifier used for
   * the database releasing.
   *
   * @param opts
   */
  public async getDBInstance(): Promise<DBInstance> {
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

      /**
       * If full capacity is not yet reached create new instance.
       * Otherwise, throw an error.
       */
      if (
        this.dbs.idle.length + this.dbs.busy.length + this.dbs.booting.length <
        this.capacity
      ) {
        this.createDBInstance()
      } else {
        throw new Error(`You've reached the upper limit of instances.`)
      }

      return waiter.wait()
    }
  }

  /**
   * Makes the instance available.
   */
  public async releaseDBInstance(db: DBInstance): Promise<void> {
    /**
     * Find the busy instance, remove that instance and give
     * it to the next in line.
     */
    const instance = this.dbs.busy.find(bdb => bdb.cwd === db.cwd)!
    this.dbs.busy = this.dbs.busy.filter(bdb => bdb.cwd !== db.cwd)

    /* Allocate to the next waiter in line or make idle. */
    // if (this.waiters.length > 0) {
    //   const [waiter, ...remainingWaiters] = this.waiters
    //   this.waiters = remainingWaiters
    //   waiter.allocate(instance)
    // } else {
    //   this.dbs.idle = [...this.dbs.idle, instance]
    // }

    this.dbs.idle = [...this.dbs.idle, instance]
  }

  /**
   * Drains the pool by deleting all instances.
   */
  public async drain(): Promise<void> {
    // TODO
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
