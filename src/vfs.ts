import * as fs from 'fs'
import * as path from 'path'
import {
  CompilerOptions,
  createCompilerHost,
  createProgram,
  createSourceFile,
} from 'typescript'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)
const copyFile = promisify(fs.copyFile)
const readDir = promisify(fs.readdir)

/**
 * Portrays the file system as a tree.
 */
export type VirtualFS = {
  [path: string]: string
}

/**
 * Searches virtual file system for TS files and compiles them.
 * Leaves non-TS files untacked.
 *
 * @param vfs
 */
export async function compileVFS(
  vfs: VirtualFS,
  options: CompilerOptions,
): Promise<VirtualFS> {
  /* Files */

  const tsFiles = Object.keys(vfs).filter(file => file.endsWith('.ts'))
  const nonTsFiles = Object.keys(vfs).filter(file => !file.endsWith('.ts'))

  const compiledVFS: VirtualFS = nonTsFiles.reduce(
    (acc, file) => ({
      ...acc,
      [file]: vfs[file],
    }),
    {},
  )

  /* Compiler Configuration */

  const compilerHost = createCompilerHost(options)
  const { getSourceFile, readFile } = compilerHost

  compilerHost.getSourceFile = (fileName, target) => {
    if (vfs.hasOwnProperty(fileName)) {
      return createSourceFile(fileName, vfs[fileName], target, true)
    } else {
      return getSourceFile(fileName, target)
    }
  }

  compilerHost.writeFile = (fileName, data) => {
    compiledVFS[fileName] = data
  }

  /* Run the compiler */

  const program = createProgram(tsFiles, options, compilerHost)
  program.emit()

  return compiledVFS
}

/**
 * Copies files form vfs to specified locations.
 *
 * @param vfs
 */
export async function copyVFS(vfs: VirtualFS): Promise<void> {
  /* Find folders. */
  const folders = Object.keys(vfs).filter(
    file => fs.existsSync(vfs[file]) && fs.lstatSync(vfs[file]).isDirectory(),
  )

  if (folders.length > 0) {
    /* Resolve folders. */
    const resolvedVFS: VirtualFS = await Object.keys(vfs).reduce(
      (acc, outPath) =>
        acc.then(async accVfs => {
          const inPath = vfs[outPath]
          if (fs.existsSync(inPath) && fs.lstatSync(inPath).isDirectory()) {
            /* Replace dir with resolved path. */
            const files = await readDir(inPath)

            return files.reduce(
              (acc, file) => ({
                ...acc,
                [path.join(outPath, file)]: path.join(inPath, file),
              }),
              accVfs,
            )
          } else {
            /* Insert files. */
            return {
              ...accVfs,
              [outPath]: inPath,
            }
          }
        }),
      Promise.resolve({}),
    )

    return copyVFS(resolvedVFS)
  } else {
    /* Copy files. */
    const actions = Object.keys(vfs).map(async outPath => {
      await mkdir(path.dirname(outPath), {
        recursive: true,
      })
      await copyFile(vfs[outPath], outPath)
    })

    try {
      await Promise.all(actions)
    } catch (err) /* istanbul ignore next */ {
      throw err
    }
  }
}

/**
 * Writes virtual file system representation to the file system.
 *
 * @param vfs
 */
export async function writeToFS(vfs: VirtualFS): Promise<void> {
  const actions = Object.keys(vfs).map(async filePath => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, vfs[filePath])
  })

  try {
    await Promise.all(actions)
  } catch (err) /* istanbul ignore next */ {
    throw err
  }
}
