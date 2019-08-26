import * as fs from 'fs'
import ml from 'multilines'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import { VirtualFS, writeToFS, copyVFS, compileVFS } from '../src/vfs'
import { ModuleKind, ScriptTarget } from 'typescript'

const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)

describe('virtual file system:', () => {
  test('compiles TypeScript files correctly', async () => {
    const root = path.join(os.tmpdir(), `./vfs-compile-test-${Math.random()}`)
    const vfs: VirtualFS = {
      [path.join(root, 'foo.ts')]: ml`
      | import { sum } from './bar.ts'
      | console.log(sum(1,2))
      `,
      [path.join(root, 'bar.ts')]: ml`
      | export function sum(a: number, b: number): number {
      |   return a + b
      | }
      `,
      'qux.js': ml`
      | console.log("Hey")
      `,
    }

    const compiledVFS = await compileVFS(vfs, {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2016,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      declaration: true,
      sourceMap: true,
      suppressOutputPathCheck: false,
    })

    expect(Object.values(compiledVFS)).toMatchSnapshot()
  })

  test('copies virtual file system correctly', async () => {
    const root = path.join(os.tmpdir(), `./copy-vfs-tests-${Math.random()}`)
    const dest = path.join(os.tmpdir(), `./copy-vfs-tests-d-${Math.random()}`)

    /* Random test files. */
    const files = [
      '%root/files/file_1',
      '%root/files/file_2',
      '%root/file_3',
    ].map(filePath => ({
      path: filePath.replace('%root', root),
      copyPath: filePath.replace('%root', dest),
      content: `file: ${Math.random()}`,
    }))

    /* Write files to the FS */

    await Promise.all(
      files.map(async file => {
        await mkdir(path.dirname(file.path), { recursive: true })
        await writeFile(file.path, file.content)
      }),
    )

    /* ViftualFS representation. */

    const vfs: VirtualFS = {
      [path.join(dest, './files')]: path.join(root, './files'),
      [path.join(dest, './file_3')]: path.join(root, './file_3'),
    }

    await copyVFS(vfs)

    /* Tests. */

    await Promise.all(
      files.map(async file => {
        expect(fs.readFileSync(file.copyPath).toString()).toEqual(file.content)
      }),
    )
  })

  test('writes to fs', async () => {
    /* Random test files. */
    const files = [0, 1, 2, 3, 4].map(file => ({
      path: path.join(os.tmpdir(), `./write-vfs-tests-${Math.random()}`),
      content: `testFile: ${file} random number: ${Math.random()}`,
    }))

    /* VirtualFS representation. */
    const vfs: VirtualFS = files.reduce(
      (acc, file) => ({
        ...acc,
        [file.path]: file.content,
      }),
      {},
    )

    await writeToFS(vfs)

    /* Tests. */

    await Promise.all(
      files.map(file => {
        expect(fs.readFileSync(file.path).toString()).toEqual(file.content)
      }),
    )
  })
})
