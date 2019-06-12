const fs = require('fs')
const path = require('path')

const chalk = require('chalk')
const execa = require('execa')

/* Constants */

const PACKAGES_DIR = path.resolve(__dirname, '../packages')
const EXAMPLES_DIR = path.resolve(__dirname, '../examples')

/* Find all directories */

const packageDirs = findProjectsInPath(PACKAGES_DIR)
const exampleDirs = findProjectsInPath(EXAMPLES_DIR)

function findProjectsInPath(dir) {
  return fs.readdirSync(dir).map(file => path.resolve(dir, file))
}

const directories = [...packageDirs, ...exampleDirs]
  .map(file => path.resolve(PACKAGES_DIR, file))
  .filter(f => fs.lstatSync(path.resolve(f)).isDirectory())

const directoriesWithTs = directories.filter(p =>
  fs.existsSync(path.resolve(p, 'tsconfig.json')),
)

const args = ['-b', ...directoriesWithTs, ...process.argv.slice(2)]

console.log(chalk.inverse('Building TypeScript definition files'))
process.stdout.write('Building\n')

try {
  execa.sync('tsc', args, { stdio: 'inherit' })
  process.stdout.write(`${chalk.reset.inverse.bold.green(' DONE ')}\n`)
} catch (e) {
  process.stdout.write('\n')
  console.error(
    chalk.inverse.red('Unable to build TypeScript definition files'),
  )
  console.error(e.stack)
  process.exitCode = 1
}
