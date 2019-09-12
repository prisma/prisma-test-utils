import fs from 'fs'
import os from 'os'
import path from 'path'

import SQLitePool, {
  DBInstance,
} from '../dbs/sqlite/@generated/prisma-test-utils/pool'
import { getTmpSQLiteDB } from '../../src/static/pool/dbs/sqlite'

describe('sqlite:', () => {
  let created_dbs: string[] = []
  let instance: DBInstance

  const pool = new SQLitePool({
    databasePath: id => {
      const database = path.join(os.tmpdir(), `./sqlite-test-${id}.db`)
      created_dbs.push(database)
      return database
    },
  })

  test('creates db instance', async () => {
    instance = await pool.getDBInstance()

    expect(created_dbs.some(db => fs.existsSync(db))).toBeTruthy()
    expect(created_dbs.length).toBe(1)
    expect(instance.url.indexOf(created_dbs[0]) > -1).toBeTruthy()
  })

  test('releases db instance', async () => {
    expect(created_dbs.some(db => fs.existsSync(db))).toBeTruthy()

    await pool.releaseDBInstance(instance)

    expect(created_dbs.every(db => !fs.existsSync(db))).toBeTruthy()
  })
})

test('getTmpSQLiteDB gets tmp db', async () => {
  const id = Math.random().toString(36)
  expect(getTmpSQLiteDB(id)).toBe(`${os.tmpdir()}/prisma-sqlite-${id}-db.db`)
})
