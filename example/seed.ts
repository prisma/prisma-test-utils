import { seed } from '../src'
import { generateCRUDSchema } from 'prisma-generate-schema'
import { DMMF } from '@prisma/dmmf'
import { DatabaseType } from 'prisma-datamodel'

run()

const __tds = `
type User {
 id: ID! @id
 name: String!
 posts: [Post]
}
type Post {
  id: ID! @id
  title: string
  comments: [Comment]
}
type Comment {
  id: ID! @id
  title: string
}
`

const __actualTds = `

type User {
  id: ID! @id
  name: String!
  posts: [Post!]! //should take the ids and connect with them. (one-to-many)
}

type Post {
  id: ID! @id
  title: string
  user: User! // should give out the id so that User can take it (many-to-one)
  comments: [Comment!]! // should take the ids and connect with them. (one-to-many)
}

type Comment {
  id: ID! @id
  title: string
  post: Post! // should give out its id (many-to-one)
}
`

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

  debugger

  console.log(data)
}
