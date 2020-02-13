import {
  generatorHandler,
  GeneratorOptions,
  DMMF,
} from '@prisma/generator-helper'
import mls from 'multilines'
import * as path from 'path'
import { ModuleKind, ScriptTarget } from 'typescript'

import { VirtualFS, writeToFS, copyVFS, compileVFS } from './vfs'
import { generateGeneratedSeedModelsType } from './typings/seed'
import { generatePoolType } from './typings/pool'

/**
 * Generates prisma-test-utils library using Prisma Generators.
 * The function presumes there's an existing photon library at an absolute path.
 *
 * @param options
 */
export async function generatePrismaTestUtils(
  options: GeneratorOptions,
): Promise<string> {
  /* Config */

  const client = options.otherGenerators.find(
    og => og.provider === 'prisma-client-js',
  )!

  /* istanbul ignore next */
  if (!client) {
    throw new Error(`You need to generate Prisma Client first.`)
  }

  const photonPath = client.output!
  const outputDir = options.generator.output!

  /* Static files. */

  const staticFs: VirtualFS = {
    [path.join(outputDir, './static/index.js')]: eval(`path.join(
      __dirname,
      '../runtime/index.js',
    )`),
    [path.join(outputDir, './static/')]: eval(`path.join(
      __dirname,
      '../runtime',
    )`),
  }

  try {
    await copyVFS(staticFs)
  } catch (err) /* istanbul ignore next */ {
    console.log(`Error while copying Runtime`)
    console.error(err)

    return ''
  }

  /**
   * The generation process is separated into three parts:
   *  1. We use TS to build the dynamic parts of the library which refer to the
   *    static ones.
   *  2. We wire the functions from the static part with the dynamic properties.
   *  3. We write the files to the file system.
   */

  /* Dynamic files */
  const dmmf = require(photonPath).dmmf as DMMF.Document

  const seedLib = mls`
  | import { PrismaClient, dmmf } from '${photonPath}';
  | import { getSeed, SeedModels, SeedFunction } from './static';
  |
  | interface GeneratedSeedModels extends SeedModels {
  |   ${generateGeneratedSeedModelsType(dmmf)}
  | }
  |
  | export const seed: SeedFunction<PrismaClient, GeneratedSeedModels>  = getSeed<PrismaClient, GeneratedSeedModels>(dmmf);
  | export default seed
  | export { GeneratedSeedModels }
  | export {
  |   SeedOptions,
  |   SeedModelsDefinition,
  |   SeedKit,
  |   SeedModels,
  |   SeedModel,
  |   ID,
  |   SeedModelFieldDefinition,
  |   SeedModelFieldRelationConstraint,
  | } from './static'
  `
  const poolLib = mls`
  | import { dmmf } from '${photonPath}';
  | import { getMySQLPool, getPostgreSQLPool, getSQLitePool } from './static';
  |
  | export default ${generatePoolType(options)}(dmmf, "${__dirname}");
  | export { MySQLPoolOptions, PostgreSQLPoolOptions, SQLitePoolOptions } from './static'
  | export { Pool, DBInstance } from './static';
  `

  /* Static files */

  const dynamicFS: VirtualFS = {
    [path.join(outputDir, './pool.ts')]: poolLib,
    [path.join(outputDir, './seed.ts')]: seedLib,
  }

  /**
   * Write dynamic files to file system.
   */
  try {
    const compiledFS = await compileVFS(dynamicFS, {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2016,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      declaration: true,
      sourceMap: true,
      suppressOutputPathCheck: false,
    })
    await writeToFS(compiledFS)
  } catch (err) /* istanbul ignore next */ {
    console.log(`Error in Test Utils generation.`)
    console.error(err)
  }

  return ''
}

/* Generator specification */

generatorHandler({
  onManifest() {
    return {
      prettyName: 'Prisma Test Utils',
      defaultOutput: 'node_modules/@prisma/test-utils',
      requiresGenerators: ['prisma-client-js'],
      requiresEngines: ['queryEngine', 'migrationEngine'],
    }
  },
  async onGenerate(options) {
    return generatePrismaTestUtils(options)
  },
})
