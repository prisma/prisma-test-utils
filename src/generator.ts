import { GeneratorDefinition, GeneratorOptions } from '@prisma/cli'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import mls from 'multilines'
import * as path from 'path'
import { ModuleKind, ScriptTarget } from 'typescript'

import { withDefault } from './utils'
import { VirtualFS, writeToFS, compileVFS } from './vfs'

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
  const photon = options.otherGenerators.find(og => og.name === 'photonjs')

  if (!photon) {
    throw new Error(`You need to generate Photon first.`)
  }

  const photonPath = photon.output
  const outputDir = withDefault('', options.generator.output)
  const staticPath = path.resolve(__dirname, './static/index')

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
  | import Photon from '${photonPath}';
  | import { DMMF } from '@prisma/photon/runtime/dmmf-types';
  | import { getSeed } from '${staticPath}';
  |
  | const dmmf: DMMF.Document = ${JSON.stringify(dmmf)};
  |
  | export default getSeed<Photon>(dmmf);
  | export { SeedOptions, SeedModelsDefinition, SeedKit, SeedModels, SeedModel, ID, SeedModelFieldDefintiion, SeedModelFieldRelationConstraint } from '${staticPath}';
  `
  const poolLib = mls`
  | import { DMMF } from '@prisma/photon/runtime/dmmf-types';
  | import { getPool } from '${staticPath}';
  |
  | const dmmf: DMMF.Document = ${JSON.stringify(dmmf)};
  |
  | export default getPool(dmmf);
  | export { Pool, PoolOptions, DBInstance } from '${staticPath}';
  `

  /* Static files */

  const vfs: VirtualFS = {
    [path.join(outputDir, './pool.ts')]: poolLib,
    [path.join(outputDir, './seed.ts')]: seedLib,
  }

  /**
   * Write files to file system.
   */
  try {
    const compiledVFS = await compileVFS(vfs, {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2016,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      declaration: true,
      sourceMap: true,
      suppressOutputPathCheck: false,
    })
    await writeToFS(compiledVFS)
  } catch (err) {
    throw err
  }

  return ''
}

export const generatorDefinition: GeneratorDefinition = {
  prettyName: 'Prisma Test Utils',
  generate: generatePrismaTestUtils,
  defaultOutput: 'node_modules/@generated/prisma-test-utils',
}
