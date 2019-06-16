import { GeneratorDefinition, GeneratorOptions } from '@prisma/cli'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import _ from 'lodash'
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
  const outputDir = withDefault('', options.generator.output)
  const photonPath = _.get(
    options.generator.config,
    ['photonPath'],
    '@generated/photon',
  )
  const staticPath = path.resolve(__dirname, './static/index.ts')

  /**
   * The generation process is separated into three parts:
   *  1. We use @zeit/ncc to build the static parts of the library.
   *  2. We wire the functions from the static part with the dynamic properties.
   *  3. We write the files to the file system.
   */

  /* Dynamic files */
  const dmmf = require(photonPath).dmmf as DMMF.Document

  const seedLib = mls`
  | import { seed as staticSeed, SeedOptions } from '${staticPath}'
  |
  | const dmmf = ${JSON.stringify(dmmf)};
  |
  | export default staticSeed(dmmf);
  | export { SeedOptions };
  `
  const poolLib = mls`
  | import { pool as staticPool, PoolOptions } from '${staticPath}'
  |
  | const dmmf = ${JSON.stringify(dmmf)};
  |
  | export default staticPool(dmmf);
  | export { PoolOptions };
  `

  /* Static files */

  const vfs: VirtualFS = {
    'pool.ts': poolLib,
    'seed.ts': seedLib,
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
    await writeToFS(outputDir, compiledVFS)
  } catch (err) {
    throw err
  }

  return ''
}

export const generatorDefinition: GeneratorDefinition = {
  prettyName: 'Prisma Test Utils',
  generate: generatePrismaTestUtils,
}
