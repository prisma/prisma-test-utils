import { Dictionary } from 'lodash'

/**
 * Types used to describe the seed models.
 */
export type SeedFunction<
  GeneratedPrismaClientType extends PrismaClientType,
  GeneratedSeedModels extends SeedModels
> = (
  options: SeedOptions<GeneratedPrismaClientType, GeneratedSeedModels>,
) => Promise<object[]>

export type SeedModelsDefinition<GeneratedSeedModels extends SeedModels> = (
  kit: SeedKit,
) => GeneratedSeedModels

export interface SeedKit {
  faker: Chance.Chance
}

export type SeedModels = {
  '*': { amount: number }
  [type: string]: SeedModel
}

export type SeedModel = {
  amount?: number
  factory?: Dictionary<
    | SeedModelFieldDefinition
    | (() => SeedModelFieldDefinition)
    | SeedModelFieldRelationConstraint
  >
}

export type ID = string | number

export type SeedModelFieldDefinition = ID | string | number | boolean

export type SeedModelFieldRelationConstraint = {
  min?: number
  max?: number
}

export type FixtureData = Dictionary<
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[]
  | { connect: { id: ID } }
  | { connect: { id: ID }[] }
  | { create: FixtureData }
>

/**
 * Represents the outline of the Prisma Client functions.
 */
export type PrismaClientType = any
// {
//   [model: string]: {
//     create: ({ data }: { data: FixtureData }) => Promise<{ id: ID }>
//   }
// }

export type SeedOptions<
  GeneratedPrismaClientType extends PrismaClientType,
  GeneratedSeedModel extends SeedModels
> = {
  client: GeneratedPrismaClientType
  models: SeedModelsDefinition<GeneratedSeedModel>
  seed?: number
  // persist?: boolean
}

/**
 * Types used to describe the Pool.
 */

export type DBInstance = {
  url: string
  cwd: string
  datamodel: string
}

export abstract class Pool {
  abstract async getDBInstance(): Promise<DBInstance>
  abstract async releaseDBInstance(db: DBInstance): Promise<void>
  abstract async run<T>(fn: (db: DBInstance) => Promise<T>): Promise<T>
  abstract async drain(): Promise<void>
}
