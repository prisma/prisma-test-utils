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
 *
 * @param vfs
 */
export async function compileVFS(vfs: VirtualFS): Promise<VirtualFS> {
  /* Compiler options */
  const compilerOptions: CompilerOptions = {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2016,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    declaration: true,
    suppressOutputPathCheck: false,
  }

  const files = Object.keys(vfs).filter(file => file.endsWith('.ts'))

  console.log({ files })

  /* Compiler Configuration */

  const compilerHost = createCompilerHost(compilerOptions)
  const { getSourceFile } = compilerHost

  compilerHost.getSourceFile = fileName => {
    /**
     * Load from the VFS or the system.
     */
    if (Object.hasOwnProperty(fileName)) {
      return createSourceFile(
        fileName,
        vfs[fileName],
        ScriptTarget.ES2015,
        true,
      )
    } else {
      return getSourceFile.call(compilerHost, fileName)
    }
  }

  compilerHost.writeFile = (fileName, data) => {
    throw new Error('HEY!')
  }

  try {
    const program = createProgram(files, compilerOptions, compilerHost)
    const result = program.emit()

    return {}
  } catch (err) {
    throw err
  }
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
