import { Dictionary, GeneratorDefinitionWithPackage } from '@prisma/cli'
import {
  getCompiledGenerators,
  generatorDefinition as photonDefinition,
} from '@prisma/photon'
import * as os from 'os'
import * as path from 'path'

import { generatorDefinition as prismaTestUtilsDefinition } from '../../src/generator'

import { getDatamodel } from '../utils/getDatamodel'

const dbPaths = {
  mysql: path.join(__dirname, `../dbs/mysql`),
  postgresql: path.join(__dirname, `../dbs/postgresql`),
  sqlite: path.join(__dirname, `../dbs/sqlite`),
}

const generators: Dictionary<GeneratorDefinitionWithPackage> = {
  'prisma-test-utils': {
    packagePath: 'prisma-test-utils',
    definition: prismaTestUtilsDefinition,
  },
  photonjs: {
    packagePath: '@prisma/photon',
    definition: photonDefinition,
  },
}

export default async () => {
  console.log(os.EOL)
  console.log(`SETUP`)

  /* Generating... */

  console.log(`Generating files...`)
  const generationStart = Date.now()

  await Promise.all(
    Object.values(dbPaths).map(async cwd => {
      const datamodel = await getDatamodel(cwd)
      const compiledGenerators = await getCompiledGenerators(
        cwd,
        datamodel,
        generators,
      )

      console.log(`Working in: ${cwd}`)

      for (const generator of compiledGenerators) {
        console.log(`Generating ${generator.prettyName}`)
        await generator.generate()
        console.log(`Done! (${generator.output})`)
      }
    }),
  )

  const generationEnd = Date.now()
  console.log(`Done generating in: ${generationEnd - generationStart}.`)

  console.log('DONE WITH SETUP!')
}
