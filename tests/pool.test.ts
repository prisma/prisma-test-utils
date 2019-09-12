import { InternalPool } from '../src/static/pool/pool'
import { DBInstance } from '../src/static/types'

describe('pool:', () => {
  test('manages dbs in the pool limit', async () => {
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

    const pool = new TestPool({
      max: 1,
    })

    let released = false

    const instance = pool.getDBInstance().then(async instance => {
      /* There should only exist one instances at that time. */
      expect(released).toBeFalsy()
      expect(instances_created.length).toBe(1)

      released = true
      await pool.releaseDBInstance(instance)
    })
    const waiter = pool.getDBInstance().then(instance => {
      expect(released).toBeTruthy()
    })

    await Promise.all([instance, waiter])

    expect(instances_deleted.length).toBe(1)
    /* There should be two instances created altogether. */
    expect(instances_created.length).toBe(2)
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

    expect(async () => {
      await pool.run(async instance => {
        expect([instance.url]).toEqual(instances_created)
        throw new Error('PASS')
      })
    }).toThrow('PASS')
    /* Tests */

    expect(instances_created.length).toBe(1)
    expect(instances_created).toEqual(instances_deleted)
  })

  test('drains the unlimited pool', async () => {
    /* Test pool instance. */
    let instances: string[] = []
    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        instances.push(id)
        return { url: id, cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {
        instances = instances.filter(i => i !== instance.url)
      }
    }

    const pool = new TestPool({ max: Infinity })

    /* Create N instances. */
    const numberOfInstances = Math.round(Math.random() * 30)
    await Promise.all(
      Array.from({ length: numberOfInstances }, () => pool.getDBInstance()),
    )

    const mid_instances = instances

    /* Drain pool. */
    await pool.drain()

    const end_instances = instances

    /* Tests. */
    expect(end_instances.length).toBe(0)
    expect(mid_instances.length).toBe(numberOfInstances)
  })
})
