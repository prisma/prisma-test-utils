import * as fs from 'fs'
import * as path from 'path'
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
