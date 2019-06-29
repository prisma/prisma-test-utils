import { getDMMF } from '@prisma/photon'
import { DMMF } from '@prisma/photon/runtime/dmmf-types'

/**
 * Returns a sample dmmf.
 */
export async function getTestDmmf(): Promise<DMMF.Document> {
  const datamodel = `
    datasource db {
      provider = "sqlite"
      url      = "file:db/next.db"
      default  = true
    }

    generator photon {
      provider = "typescript"
      output = "node_modules/@generated/photon"
    }

    generator test-utils {
      provider = "prisma-test-utils"
      output = "node_modules/@generated/test-utils"
    }

    model Blog {
      id String @id @default(cuid()) 
      name String
      viewCount Int
      posts Post[]
      authors Author[]
    }

    model Author {
      id String @id @default(cuid()) 
      name String?
      posts Post[]
      blog Blog
    }         

    model Post {
      id String @id @default(cuid()) 
      title String
      tags String[]
      blog Blog
    }
  `

  return getDMMF({ datamodel })
}
