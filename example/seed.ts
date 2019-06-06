// import { seed } from '../src'
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

  debugger

  const schema = generateCRUDSchema(typeDefs, DatabaseType.postgres)
  const dmmf = new DMMF(typeDefs, schema)

  console.log(dmmf)

  // const data = seed(
  //   bag => ({
  //     User: {
  //       factory: {
  //         name: bag.faker.name.firstName,
  //         posts: {
  //           min: 3,
  //           max: 100,
  //         },
  //       },
  //     },
  //   }),
  //   {
  //     silent: true,
  //     seed: 1,
  //   },
  // )

  // console.log(data)
}
