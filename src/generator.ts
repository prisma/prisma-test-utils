import { GeneratorDefinition, GeneratorOptions } from '@prisma/cli'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
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

  const photon = options.otherGenerators.find(og => og.provider === 'photonjs')

  /* istanbul ignore next */
  if (!photon) {
    throw new Error(`You need to generate Photon first.`)
  }

  const photonPath = photon.output
  const outputDir = options.generator.output

  /* Static files. */

  const staticFs: VirtualFS = {
    [path.join(outputDir, './static/index.js')]: eval(`path.join(
      __dirname,
      '../prisma-test-utils_ncc/index.js',
    )`),
    [path.join(outputDir, './static/')]: eval(`path.join(
      __dirname,
      '../prisma-test-utils_ncc',
    )`),
  }

  try {
    await copyVFS(staticFs)
  } catch (err) /* istanbul ignore next */ {
    throw err
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

  console.log({ dmmf })

  const seedLib = mls`
  | import Photon from '${photonPath}';
  | import { DMMF } from '@prisma/photon/runtime/dmmf-types';
  | import { getSeed, SeedModels, SeedFunction } from './static';
  |
  | interface GeneratedSeedModels extends SeedModels {
  |   ${generateGeneratedSeedModelsType(dmmf)}
  | }
  |
  | const dmmf: DMMF.Document = ${JSON.stringify(dmmf)};
  |
  | export const seed: SeedFunction<Photon, GeneratedSeedModels>  = getSeed<Photon, GeneratedSeedModels>(dmmf);
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
  | import { DMMF } from '@prisma/photon/runtime/dmmf-types';
  | import { getMySQLPool, getPostgreSQLPool, getSQLitePool } from './static';
  |
  | const dmmf: DMMF.Document = ${JSON.stringify(dmmf)};
  |
  | export default ${generatePoolType(options)}(dmmf, "${options.cwd}");
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
    throw err
  }

  return ''
}

export const generatorDefinition: GeneratorDefinition = {
  prettyName: 'Prisma Test Utils',
  generate: generatePrismaTestUtils,
  defaultOutput: 'node_modules/@generated/prisma-test-utils',
}
