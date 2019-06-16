import { generatePrismaTestUtils } from './generator'
debugger
generatePrismaTestUtils({
  cwd: process.cwd(),
  generator: {
    config: {
      photonPath:
        '/Users/maticzavadlal/Code/work/prisma/prisma-test-utils/example/node_modules/@generated/photon',
    },
    name: '',
    output:
      '/Users/maticzavadlal/Code/work/prisma/prisma-test-utils/example/node_modules/@generated/test-utils',
  },
  otherGenerators: [],
})
  .then(console.log)
  .catch(console.error)
