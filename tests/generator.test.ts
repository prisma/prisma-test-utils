import os from 'os'
import path from 'path'

import { generatorDefinition } from '../src/generator'

jest.useFakeTimers()

describe('generator:', () => {
  test(
    'generates prisma-test-utils',
    async () => {
      expect(async () => {
        generatorDefinition.generate({
          cwd: process.cwd(),
          dataSources: [
            {
              connectorType: 'sqlite',
            },
          ],
          datamodel: '',
          dmmf: '',
          generator: {
            name: 'prisma-test-utils',
            config: {},
            output: path.join(
              os.tmpdir(),
              `${Math.random().toString()}-test-utils/`,
            ),
            platforms: [],
            provider: 'prisma-test-utils',
          },
          otherGenerators: [
            {
              name: 'photon',
              config: {},
              output: 'tests/dbs/sqlite/@generated/photon',
              platforms: [],
              provider: 'photonjs',
            },
          ],
        })
      }).not.toThrow()
    },
    60 * 1000,
  )
})
