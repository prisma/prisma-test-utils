import { Dictionary, GeneratorDefinitionWithPackage } from '@prisma/cli'
import {
  getCompiledGenerators,
  generatorDefinition as photonDefinition,
} from '@prisma/photon'
import * as fs from 'fs'
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
  if (process.env.PRISMA_GENERATE !== 'false') {
    console.log(os.EOL)
    console.log(`PRISMA GENERATE`)

    /* Generating... */

    console.log(`* Generating files...`)
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
    console.log(
      `* Done generating tools in: ${generationEnd - generationStart}.`,
    )

    /* Fix prisma-test-utils static require for coverage. */

    console.log('* FIXING require for STATIC')

    const libStaticPath = path.join(__dirname, '../../src/static')
    const relativeStaticRequire = `require("./static")`
    const libStaticRequire = `require("${libStaticPath}")`

    const seedPath = './@generated/prisma-test-utils/seed.js'
    const poolPath = './@generated/prisma-test-utils/pool.js'

    for (const db of Object.values(dbPaths)) {
      const dbSeedPath = path.join(db, seedPath)
      const dbPoolPath = path.join(db, poolPath)

      const seedJS = fs
        .readFileSync(dbSeedPath, 'utf-8')
        .replace(relativeStaticRequire, libStaticRequire)
      const poolJS = fs
        .readFileSync(dbPoolPath, 'utf-8')
        .replace(relativeStaticRequire, libStaticRequire)

      fs.writeFileSync(dbSeedPath, seedJS)
      fs.writeFileSync(dbPoolPath, poolJS)
    }

    console.log('* FIXED STATIC')

    console.log('DONE WITH PRISMA GENERATE!')
  }
}
