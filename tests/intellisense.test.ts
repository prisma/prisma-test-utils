import { DMMF } from '@prisma/generator-helper'
import { getDMMF, getConfig } from '@prisma/sdk'

import { generatePoolType } from '../src/intellisense/pool'
import { generateGeneratedSeedModelsType } from '../src/intellisense/seed'

describe('typings:', () => {
  test('generates seed types correctly', async () => {
    const datamodel = `
datasource sqlite {
  url      = "file:./data.db"
  provider = "sqlite"
}

generator photonjs {
  provider = "photonjs"
  output   = "./@generated/photon"
}

generator testutils {
  provider = "prisma-test-utils"
  output   = "./@generated/prisma-test-utils"
}

model User {
  id       String  @id @default(cuid())
  name     String
  email    String
  isActive Boolean
  age      DateTime 
  pet      Pet
  house    House?
  friends  User[]
}

enum Animal {
  Dog
  Cat
  Dinosaur
}

model Pet {
  id     String @id @default(cuid())
  name   String
  animal Animal
  toys   Toy[]
}

model Toy {
  id    String @id @default(cuid())
  name  String
  price Float
}

model House {
  id            String @id @default(cuid())
  address       String
  numberOfRooms Int
  residents     User[]
}
  `
    const dmmf: DMMF.Document = await getDMMF({ datamodel })
    expect(generateGeneratedSeedModelsType(dmmf)).toMatchSnapshot()
  })

  test('generates correct sqlite pool type', async () => {
    const datamodel = `
datasource sqlite {
  url      = "file:./data.db"
  provider = "sqlite"
}

model User {
  id       String  @id @default(cuid())
  name     String
}
  `
    const options = await getConfig({ datamodel })
    expect(
      generatePoolType({
        schemaPath: '',
        version: '',
        datamodel,
        datasources: options.datasources,
        dmmf: null,
        generator: {
          output: '',
          name: '',
          provider: '',
          binaryTargets: [],
          config: {},
        },
        otherGenerators: [],
      }),
    ).toMatchSnapshot()
  })

  test('generates correct mysql pool type', async () => {
    const datamodel = `
datasource mysql {
  url      = "mysql://user@localhost:3333"
  provider = "mysql"
}

model User {
  id       String  @id @default(cuid())
  name     String
}
  `
    const options = await getConfig({ datamodel })
    expect(
      generatePoolType({
        schemaPath: '',
        version: '',
        datamodel,
        datasources: options.datasources,
        dmmf: null,
        generator: {
          output: '',
          name: '',
          provider: '',
          binaryTargets: [],
          config: {},
        },
        otherGenerators: [],
      }),
    ).toMatchSnapshot()
  })

  test('generates correct postgresql pool type', async () => {
    const datamodel = `
datasource postgresql {
  url      = "postgresql://user:secret@localhost"
  provider = "postgresql"
}

model User {
  id       String  @id @default(cuid())
  name     String
}
  `
    const options = await getConfig({ datamodel })
    expect(
      generatePoolType({
        schemaPath: '',
        version: '',
        datamodel,
        datasources: options.datasources,
        dmmf: null,
        generator: {
          output: '',
          name: '',
          provider: '',
          binaryTargets: [],
          config: {},
        },
        otherGenerators: [],
      }),
    ).toMatchSnapshot()
  })
})
