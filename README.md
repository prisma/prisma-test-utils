# 🃏 prisma-test-utils

[![npm version](https://badge.fury.io/js/prisma-test-utils.svg)](https://badge.fury.io/js/prisma-test-utils)
[![CircleCI](https://circleci.com/gh/prisma/prisma-test-utils/tree/main.svg?style=shield)](https://circleci.com/gh/prisma/prisma-test-utils/tree/main)
[![codecov](https://codecov.io/gh/prisma/prisma-test-utils/branch/main/graph/badge.svg)](https://codecov.io/gh/prisma/prisma-test-utils)

> ⚠️ **This project is temporarily unmaintained. See [this issue](https://github.com/prisma/prisma-test-utils/issues/6).**

In testing workflows, generating seed data usually includes a lot of boilerplate and hardcoded fixtures that need to be migrated with changing code.

`prisma-test-utils` solves this by generating test util functions based on your Prisma Schema. As your application evolves, the generated data also evolves deterministically.

## Features

- 🙈 **Data model agnostic:** Optimised for you datamodel.
- 🦑 **Flexible:** Cherry picked default settings.
- 🐶 **Out-of-the-box usage:** Plug-in generator for your Prisma Schema.
- 🐠 **Seeds mock data:** Populates your database with mock data.
- 🦋 **Per-test database:** Creates an isolated database for each test.

## Installation

TBD

## Configuration

```prisma
generator testutils {
  provider = "prisma-test-utils"
  output = "node_modules/@generated/prisma-test-utils"
}
```

## Usage

`prisma-test-utils` packs two incredibly useful functions. The first one, `seed`, helps you populate your data with vast amount of data. The second one, `pool`, can be used to create a pool of databases that you can use during testing, and are wiped after you've finished.

### Seeding

```ts
import Photon from '@generated/photon'
import seed from '@generated/test-utils/seed'

test('test with seed data', async () => {
  await seed({
    client,
    models: kit => ({
      _: {
        /* Default number of instances. */
        amount: 500,
      },
      Blog: {
        factory: {
          /* Use functions from the kit. */
          name: kit.faker.sentence,
          /* Define custom mocks. */
          description: 'My custom blog description',
          /* Define custom mock functions. */
          entry: () => {
            return `A generated entry from the function.`
          },
          /* Manage relations. */
          posts: {
            max: 100,
          },
        },
      },
    }),
  })

  const blogs = await client.blogs()
})
```

**Options**

It is possible to selectively override the seed generation making the seeding workflow very flexible.

> All options are autogenerated and checked at compile time. You'll be warned about any relation constraints that your datamodel presents.

```ts
beforeAll(async () => {
  const data = await seed(
    photon,
    bag => ({
      Post: {
        amount: 5,
        factory: {
          published: 'false',
        },
      },
    }),
    {
      seed: 42,
      silent: false,
      instances: 5,
    },
  )
})
```

### Database Pools

We can configure our pool requirements before running any test cases.

```js
import SQLitePool, { Pool } from '@generated/prisma-test-utils'

let pool: Pool

beforeAll(async () => {
  pool = new SQLitePool({
    pool: {
      min: 3,
      max: 5,
    },
  })
})
```

This allows us to request an isolated database per test case

```ts
test('one of my parallel tests', async () => {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()

  // Write the test case logic
  const client = new Photon({
    datasources: {
      db: db.url,
    },
  })

  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})
```

**API**

```ts
/* All pool instances. */

class Pool {
  async getDBInstance(): Promise<DBInstance>
  async releaseDBInstance(db: DBInstance): Promise<void>
  async run<T>(fn: (db: DBInstance) => Promise<T>): Promise<T>
  async drain(): Promise<void>
}

/* PostgreSQL */

interface PostgreSQLConnection {
  host: string
  port: number
  user: string
  password?: string
  database: string
  schema: string
}

interface PostgreSQLPoolOptions {
  connection: (id: string) => PostgreSQLConnection
  pool?: {
    max?: number
  }
}

/* MySQL */

interface MySQLConnection {
  host: string
  port: string
  user: string
  password?: string
  database: string
}

interface MySQLPoolOptions {
  connection: (id string) => MySQLConnection
  pool?: {
    max?: number
  }
}

/* SQLite */

interface SQLitePoolOptions {
  databasePath: (id: string) => string
  pool?: {
    max?: number
  }
}
```

## Local development

> :construction: NOTE: Please comment your work and read the comments that are already in there.

I didn't want to remove half the files of this library - the pool part - and that's why there's more files than you'll usually need for developing seed utils. Please don't remove the extra files as this work very nicely the way it is.

The most important file for seeding is `src/static/seed.ts` and `src/intellisense/seed.ts`. The first one is the logic and the second one provides customized types.

Furthermore:

- **To create a new DB instance:** Spin up the `docker-compose up -d` and use TablePlus or alternative to import the sql.
- **To examine the behaviour of the library:** Uncomment `src/__test` file and start the debugger. `src/__test` file references files in the `tests/seed` folder. Read on about that!
- **To setup `tests/seed` folder:** Navigate to that directory and use `yarn prisma2 <cmd>` to setup everything that you need. I usually use one of these functions:

  - `yarn prisma2 introspect yarn prisma2 introspect --url="postgresql://prisma:prisma@127.0.0.1/ruma"`
  - `yarn prisma2 migrate up --experimental`
  - `yarn prisma2 migrate save --name "init" --experimental`
  - `yarn prisma2 generate`.
    I have also added the `README.md` file in there with missing generator definitions from introspection. Copy and paste them to the top.

- **To push changes:** Preferablly do a PR, and don't forget to comment out `src/__test` file.
- **To publish a new version:** I use `npx np --no-tests`.
- **To apply changes in the `intellisense`:** Run `yarn build`.
- **To test the utils outside debugger:** Run `yarn build:runtime`.
- **To get new VSCode type definitions after changing the schema:** Reload VSCode :slightly_smiling_face:

## Security

If you have a security issue to report, please contact us at [security@prisma.io](mailto:security@prisma.io?subject=[GitHub]%20Prisma%202%20Security%20Report%20Test%20Utils)

## LICENSE

MIT @ Prisma
