import pg from 'pg'

import { InternalPool } from '../src/static/pool/pool'
import { DBInstance } from '../src/static/types'

describe('pool:', () => {
  test('manages dbs in the pool limit', async () => {
    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        return { url: '', cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {}
    }

    const pool = new TestPool({
      max: 1,
    })

    let released = false

    const instance = pool.getDBInstance().then(async instance => {
      expect(released).toBeFalsy()

      await pool.releaseDBInstance(instance)
      released = true
    })
    const waiter = pool.getDBInstance().then(instance => {
      expect(released).toBeTruthy()
    })

    await Promise.all([instance, waiter])
  })

  test('run allocates and releases instance', async () => {
    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        return { url: '', cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {}
    }

    const pool = new TestPool({
      max: 1,
    })

    await pool.run(async instance => {})

    /* Tests */
  })

  test('run allocates and releases instance on error', async () => {
    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        return { url: '', cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {}
    }

    const pool = new TestPool({
      max: 1,
    })

    await pool.run(async instance => {
      throw new Error('PASS')
    })

    /* Tests */
  })

  test('drains the dbs', async () => {
    /* Test pool instance. */
    class TestPool extends InternalPool {
      async createDBInstance(id: string) {
        return { url: '', cwd: '', datamodel: '' }
      }
      async deleteDBInstance(instance: DBInstance): Promise<void> {}
    }

    const pool = new TestPool({
      max: 1,
    })

    /* Create N instances. */
    const numberOfNewSchemas = Math.round(Math.random() * 30)
    await Promise.all(
      Array.from({ length: numberOfNewSchemas }, () => pool.getDBInstance()),
    )

    /* Drain pool. */
    await pool.drain()

    /* Tests. */
  })
})
