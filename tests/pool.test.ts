import { InternalPool } from '../src/static/pool/pool'
import { DBInstance } from '../src/static/types'

describe('pool:', () => {
  test('manages dbs in the pool limit', async () => {
    let instances_created: string[] = []
    let instances_deleted: string[] = []

    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        instances_created.push(id)
        return { url: id, cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {
        instances_deleted.push(instance.url)
      }
    }

    const pool = new TestPool({
      max: 1,
    })

    let released = false

    const testFn = async (instance: DBInstance) => {
      if (released) {
        /* One instance should already be deleted. */
        expect(instances_created.length).toBe(2)
        expect(instances_deleted.length).toBe(1)
        expect(instances_deleted.some(i => i === instance.url)).toBeFalsy()
      } else {
        /* There should only exist one instances at that time. */
        expect(instances_created.length).toBe(1)

        released = true
        await pool.releaseDBInstance(instance)
      }
    }

    const instance = pool.getDBInstance().then(testFn)
    const waiter = pool.getDBInstance().then(testFn)

    await Promise.all([instance, waiter])
  })

  test('run allocates and releases instance', async () => {
    let instances_created: string[] = []
    let instances_deleted: string[] = []

    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        instances_created.push(id)
        return { url: id, cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {
        instances_deleted.push(instance.url)
      }
    }

    const pool = new TestPool({
      max: Infinity,
    })

    await pool.run(async instance => {
      expect([instance.url]).toEqual(instances_created)
    })

    /* Tests */

    expect(instances_created.length).toBe(1)
    expect(instances_created).toEqual(instances_deleted)
  })

  test('run allocates and releases instance on error', async () => {
    let instances_created: string[] = []
    let instances_deleted: string[] = []

    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        instances_created.push(id)
        return { url: id, cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {
        instances_deleted.push(instance.url)
      }
    }

    const pool = new TestPool({
      max: Infinity,
    })

    await expect(
      pool.run(async instance => {
        expect([instance.url]).toEqual(instances_created)
        throw new Error('pass')
      }),
    ).rejects.toThrow('pass')
    expect(instances_created.length).toBe(1)
    expect(instances_created).toEqual(instances_deleted)
  })

  test('drains the unlimited pool', async () => {
    /* Test pool instance. */
    const instances_created: string[] = []
    const instances_deleted: string[] = []

    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        instances_created.push(id)
        return { url: id, cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {
        instances_deleted.push(instance.url)
      }
    }

    const pool = new TestPool({ max: Infinity })

    /* Create N instances. */
    const numberOfInstances = Math.round(Math.random() * 30)
    await Promise.all(
      Array.from({ length: numberOfInstances }, () => pool.getDBInstance()),
    )

    /* Drain pool. */
    await pool.drain()

    /* Tests. */
    expect(instances_created).toEqual(instances_deleted)
  })

  test('drains the limited pool', async () => {
    /* Test pool instance. */
    const instances_created: string[] = []
    const instances_deleted: string[] = []

    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        instances_created.push(id)
        return { url: id, cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {
        instances_deleted.push(instance.url)
      }
    }

    const pool = new TestPool({ max: 10 })

    await Promise.all(Array.from({ length: 10 }, () => pool.getDBInstance()))

    const waiter = pool.getDBInstance()

    /* Drain pool. */
    await pool.drain()

    await expect(waiter).rejects.toMatch('Drained before allocated.')
    expect(instances_created).toEqual(instances_deleted)
  })
})
