import * as os from 'os'
import * as path from 'path'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import { getDmmf } from './utils'

/* src */

import { generateGeneratedSeedModelsType } from '../src/typings'

describe('seed function:', () => {
  let dbPath: string
  let dmmf: DMMF.Document

  beforeAll(async () => {
    /* Create the tmp path */
    /* Get dmmf */
    dmmf = await getDmmf()
  })

  test.todo('seeds the data correctly', async () => {})

  test('generates correct typings', async () => {
    expect(generateGeneratedSeedModelsType(dmmf)).toMatchSnapshot()
  })
})
