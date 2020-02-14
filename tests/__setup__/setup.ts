import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import execa from 'execa'

const dbPaths = {
  mysql: path.join(__dirname, `../dbs/mysql`),
  postgresql: path.join(__dirname, `../dbs/postgresql`),
  sqlite: path.join(__dirname, `../dbs/sqlite`),
  seed: path.join(__dirname, '../seed'),
}

export default async () => {
  if (process.env.PRISMA_GENERATE !== 'false') {
    console.log(os.EOL)
    console.log(`PRISMA GENERATE`)

    /* Generating... */

    console.log(`* Generating files...`)
    const generationStart = Date.now()

    await Promise.all(
      Object.values(dbPaths).map(async cwd => {
        console.log(`Working in ${cwd}`)
        const schemaPath = path.resolve(cwd, './schema.prisma')
        return execa('yarn', ['prisma2', 'generate', '--schema', schemaPath], {
          cwd,
          stdio: 'inherit',
        })
      }),
    )

    const generationEnd = Date.now()
    console.log(
      `* Done generating tools in: ${generationEnd - generationStart}.`,
    )

    /* Fix prisma-test-utils static require for coverage. */

    console.log('* FIXING require for STATIC')

    const libStaticPath = path.join(__dirname, '../../src/static')
    const relativeStaticRequire = `require("./static")`
    const libStaticRequire = `require("${libStaticPath}")`

    const seedPath = './@generated/prisma-test-utils/seed.js'
    const poolPath = './@generated/prisma-test-utils/pool.js'

    for (const db of Object.values(dbPaths)) {
      const dbSeedPath = path.join(db, seedPath)
      const dbPoolPath = path.join(db, poolPath)

      const seedJS = fs
        .readFileSync(dbSeedPath, 'utf-8')
        .replace(relativeStaticRequire, libStaticRequire)
      const poolJS = fs
        .readFileSync(dbPoolPath, 'utf-8')
        .replace(relativeStaticRequire, libStaticRequire)

      fs.writeFileSync(dbSeedPath, seedJS)
      fs.writeFileSync(dbPoolPath, poolJS)
    }

    console.log('* FIXED STATIC')

    console.log('DONE WITH PRISMA GENERATE!')
  }
}
