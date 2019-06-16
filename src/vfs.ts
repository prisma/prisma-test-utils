import * as fs from 'fs'
import * as path from 'path'
import {
  CompilerOptions,
  createCompilerHost,
  createProgram,
  createSourceFile,
  ModuleKind,
  ScriptTarget,
} from 'typescript'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)

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
  const { getSourceFile, fileExists, readFile } = compilerHost

  compilerHost.getSourceFile = (fileName, target) => {
    /**
     * Load from the VFS or the system.
     */
    if (Object.hasOwnProperty(fileName)) {
      return createSourceFile(fileName, vfs[fileName], target, true)
    } else {
      return getSourceFile(fileName, target)
    }
  }

  compilerHost.fileExists = fileName => {
    return fileExists(fileName)
  }

  compilerHost.readFile = fileName => {
    if (vfs.hasOwnProperty(fileName)) {
      return vfs[fileName]
    } else {
      return readFile(fileName)
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
 * Writes virtual file system representation to the file system.
 *
 * @param vfs
 */
export async function writeToFS(root: string, vfs: VirtualFS): Promise<void> {
  const actions = Object.keys(vfs).map(async filePath => {
    await mkdir(path.dirname(path.join(root, filePath)), { recursive: true })
    await writeFile(path.join(root, filePath), vfs[filePath])
  })

  try {
    await Promise.all(actions)
  } catch (err) {
    throw err
  }
}
