# prisma-test-utils

## Docs

```
generator test-utils {
  provider = "prisma-test-utils"
  output = "node_modules/@generated/test-utils"
}
```

## Example

Please checkout the `/examples` directory or the standalone [`prisma-faker-example`](https://github.com/divyenduz/prisma-faker-example) readme.

### Seeding

In testing workflows, generating seed data usually includes a lot of boilerplate. We either rely on hardcoded fixtures that need to be migrated with changing code.

`@prisma/seed` solves this by generating seed data based on your Prisma schema, as your application evolves, the generated data also evolves deterministically.

**Import**

```js
import { seed, FakerBag } from '@prisma/seed'
```

**Usage**

Seed returns the seeded data in a serialized format and can be used for object matching or snapshot testing. Since, seed depends on the datamodel, this part of code won't require any changes as the application evolves, from Prisma schema, it knows what structure of data to seed.

```js
beforeAll(async () => {
  const data = await seed(photon, bag => ({}), {
    seed: 42,
    silent: false,
    instances: 5,
  })
})
```

**Options**

It is possible to selectively override the seed generation making the seeding workflow very flexible.

```js
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

Another common source of pain when writing tests at scale is parallizing tests. This usually involves setting up multiple isolated databases that can be used to run tests in parallel.

`@prisma/pool` allows you to easily obtain isolated databases per test case.

**Import**

```js
import { Pool } from '@prisma/pool'
```

**Usage**

We can configure our pool requirements before running any test cases.

```js
beforeAll(async () => {
  pool = new Pool({
    dmmf: photon.dmmf,
    pool: {
      min: 3,
      max: 5,
    },
  })
})
```

This allows us to request an isolated database per test case

```js
test('users are queried correctly', async () => {
  /* Acquire new db instance. */
  const db = await pool.getDBInstance()
  console.log({ db })
  // Write the test case logic
  /* Release the instance. */
  client.disconnect()
  pool.releaseDBInstance(db)
})
```

**API**

```ts
/* PostgreSQL */

interface PostgreSQLConnection {
  host: string
  port: number
  user: string
  password: string
  database: string
  schema: string
}

interface PostgreSQLPoolOptions {
  connection: (id?: string) => PostgreSQLConnection
  prisma: {
    cwd: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}

/* MySQL */

interface MySQLConnection {
  host: string
  port: string
  user: string
  password: string
  database: string
}

interface MySQLPoolOptions {
  connection: (id?: string) => MySQLConnection
  prisma: {
    cwd: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}

/* SQLite */

interface SQLitePoolOptions {
  databasePath: (id?: string) => string
  prisma: {
    cwd: (id?: string) => string
  }
  pool?: {
    max?: number
  }
}
```
