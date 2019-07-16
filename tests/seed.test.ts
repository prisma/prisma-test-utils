import { LiftEngine, DataSource } from '@prisma/lift'
import { getDmmf, generatorDefinition } from '@prisma/photon'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import * as os from 'os'
import * as path from 'path'

import { generateGeneratedSeedModelsType } from '../src/typings'

describe('seed function:', () => {
  let dbPath: string
  let dmmf: DMMF.Document

  beforeAll(async () => {
    /* Create the tmp path */
    /* Get dmmf */
    dmmf = await getDmmf()
  })

  test('seeds the data correctly', async () => {
    const
  })

  test('generates correct typings', async () => {
    expect(generateGeneratedSeedModelsType(dmmf)).toMatchSnapshot()
  })
})
