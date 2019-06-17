const path = require('path')
const fs = require('fs')
const mockFs = require('./mock-fs')
const { promisify } = require('util')
const writeFile = promisify(fs.writeFile)
const makeDir = require('make-dir')
const del = require('del')

const runtimeTsConfig = {
  compilerOptions: {
    lib: ['esnext', 'esnext.asynciterable'],
    module: 'commonjs',
    target: 'es2017',
    strict: false,
    esModuleInterop: true,
    sourceMap: true,
    noImplicitAny: false,
    outDir: 'prisma-test-utils_ncc',
    rootDir: 'src/static',
    declaration: true,
  },
  include: ['src/static'],
  exclude: [
    'dist',
    'cli',
    'examples',
    'runtime',
    'src/fixtures',
    'src/__tests__',
  ],
}

mockFs({
  [path.join(__dirname, '../tsconfig.json')]: JSON.stringify(
    runtimeTsConfig,
    null,
    2,
  ),
})

const options = {
  externals: ['typescript', '@prisma/photon', '@prisma/lift'],
  external: ['typescript', '@prisma/photon', '@prisma/lift'],
}

let targetDir = path.join(__dirname, '../prisma-test-utils_ncc')
const sourceFile = path.join(__dirname, '../src/static/index.ts')

require('@zeit/ncc')(sourceFile, options)
  .then(async ({ files }) => {
    // Assets is an object of asset file names to { source, permissions, symlinks }
    // expected relative to the output code (if any)
    await saveToDisc(files, targetDir)
  })
  .catch(console.error)

async function saveToDisc(assets, outputDir) {
  await makeDir(outputDir)

  // TODO add concurrency when we would have too many files
  const madeDirs = {}
  await Promise.all(
    Object.entries(assets).map(async ([filePath, file]) => {
      const targetPath = path.join(outputDir, filePath)
      const targetDir = path.dirname(targetPath)
      if (!madeDirs[targetDir]) {
        await makeDir(targetDir)
        madeDirs[targetDir] = true
      }
      console.log(
        `writing`,
        targetPath,
        Math.round(file.source.length / 1024) + 'kB',
      )
      await writeFile(targetPath, file.source)
    }),
  )
  const after = Date.now()
}
