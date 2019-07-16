import { LiftEngine, DataSource } from '@prisma/lift'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import _ from 'lodash'
import * as os from 'os'
import * as path from 'path'

import { InternalPool } from '../pool'
import { Pool } from '../../types'

/**
 * Creates a dmmf specific Internal Pool instance.
 *
 * @param dmmf
 */
export function getMySQLPool(
  dmmf: DMMF.Document,
): { new (options?: MySQLPoolOptions): Pool } {
  return class extends MySQLPool {
    constructor(options?: MySQLPoolOptions) {
      super(dmmf, options)
    }
  }
}

export interface MySQLPoolOptions {}

class MySQLPool extends InternalPool {
  constructor(dmmf: DMMF.Document, options?: MySQLPoolOptions) {
    super()
  }

  async createDBInstance() {}
}
