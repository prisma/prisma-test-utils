import { seed } from '../src'
import { generateCRUDSchema } from 'prisma-generate-schema'
import { DMMF } from '@prisma/dmmf'
import { DatabaseType } from 'prisma-datamodel'

run()

async function run() {
  const typeDefs = `
    type User {
      id: ID! @id
      name: String!
      phoneNumber: String!
      bookmarks: [Bookmark!]!
    } 

    type Bookmark {
      id: ID! @id
      label: String!
      page: String!
      numberOfVisits: Int!
    }
  `

  const schema = generateCRUDSchema(typeDefs, DatabaseType.postgres)
  const dmmf = new DMMF(typeDefs, schema)
  console.log(dmmf)

  const data = seed(
    dmmf,
    bag => ({
      User: {
        amount: 5,
        factory: {
          name: bag.faker.name,
          bookmarks: {
            min: 3,
            max: 10,
          },
        },
      },
      Bookmark: {
        amount: 40,
      },
    }),
    {
      silent: true,
      seed: 1,
    },
  )

  console.log(data)
}
