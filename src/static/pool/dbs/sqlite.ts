import { DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import * as fs from 'fs'
import _ from 'lodash'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

import { migrateLift } from '../lift'
import { InternalPool } from '../pool'
import { Pool, DBInstance } from '../../types'

const fsUnlink = promisify(fs.unlink)

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
      super(dmmf, { databasePath: getTmpSQLiteDB, ...options })
    }
  }
}

export interface SQLitePoolOptions {
  databasePath?: (id?: string) => string
  prisma: {
    cwd: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}

class SQLitePool extends InternalPool {
  private dmmf: DMMF.Document
  private getDatabasePath: (id?: string) => string
  private getCwdPath: (id?: string) => string

  constructor(dmmf: DMMF.Document, options: SQLitePoolOptions) {
    super({ max: _.get(options, ['pool', 'max'], Infinity) })

    this.dmmf = dmmf
    this.getDatabasePath = options.databasePath
    this.getCwdPath = options.prisma.cwd
  }

  /**
   * Creates a new DB instances and lifts a migration.
   */
  async createDBInstance(id: string): Promise<DBInstance> {
    try {
      /* Constants */
      const dbFile = this.getDatabasePath(id)
      const cwdPath = this.getCwdPath(id)
      const datasources: DataSource[] = [
        {
          name: 'db',
          connectorType: 'sqlite',
          url: `file:${dbFile}`,
          config: {},
        },
      ]

      /* Migrate using Lift. */

      const { datamodel } = await migrateLift({
        id,
        projectDir: cwdPath,
        datasources,
        dmmf: this.dmmf,
      })

      const instance: DBInstance = {
        url: dbFile,
        cwd: cwdPath,
        datamodel: datamodel,
      }

      return instance
    } catch (err) {
      throw err
    }
  }

  /**
   * Deletes the db files.
   *
   * @param instance
   */
  protected async deleteDBInstance(instance: DBInstance): Promise<void> {
    try {
      await fsUnlink(instance.url)
    } catch (err) {
      throw err
    }
  }
}

/**
 * Allocates a new space in the tmp dir for the db instance.
 *
 * @param id
 */
export function getTmpSQLiteDB(id: string): string {
  const tmpDir = os.tmpdir()
  const dbFile = path.join(tmpDir, `./prisma-sqlite-${id}-db.db`)
  return dbFile
}

/**
 * Allocates a new tmp dir path for Prisma migrations.
 *
 * @param id
 */
export function getTmpCwd(id: string): string {
  const tmpDir = os.tmpdir()
  const cwdDir = path.join(tmpDir, `./prisma-migrations-${id}-db/`)
  return cwdDir
}
