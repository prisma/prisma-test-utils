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
  cwd: string,
): { new (options?: SQLitePoolOptions): Pool } {
  return class extends SQLitePool {
    constructor(options?: SQLitePoolOptions) {
      super(dmmf, { databasePath: getTmpSQLiteDB, ...options }, cwd)
    }
  }
}

export interface SQLitePoolOptions {
  databasePath?: (id?: string) => string
  pool?: {
    max?: number
  }
}

class SQLitePool extends InternalPool {
  private dmmf: DMMF.Document
  private projectDir: string
  private getDatabasePath: (id?: string) => string

  constructor(dmmf: DMMF.Document, options: SQLitePoolOptions, cwd: string) {
    super({ max: _.get(options, ['pool', 'max'], Infinity) })

    this.dmmf = dmmf
    this.projectDir = cwd
    this.getDatabasePath = options.databasePath
  }

  /**
   * Creates a new DB instances and lifts a migration.
   */
  async createDBInstance(id: string): Promise<DBInstance> {
    try {
      /* Constants */
      const dbFile = this.getDatabasePath(id)
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
        projectDir: this.projectDir,
        datasources,
        dmmf: this.dmmf,
      })

      const instance: DBInstance = {
        url: dbFile,
        cwd: this.projectDir,
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
