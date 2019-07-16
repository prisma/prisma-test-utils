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
export function getPostgreSQLPool(
  dmmf: DMMF.Document,
): { new (options?: PostgreSQLPoolOptions): Pool } {
  return class extends PostgreSQLPool {
    constructor(options?: PostgreSQLPoolOptions) {
      super(dmmf, options)
    }
  }
}

export interface PostgreSQLPoolOptions {}

class PostgreSQLPool extends InternalPool {
  constructor(dmmf: DMMF.Document, options?: PostgreSQLPoolOptions) {
    super()
  }

  async createDBInstance() {}
}
