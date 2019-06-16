import { Dictionary } from 'lodash'

export type Faker = (bag: FakerBag) => FakerSchema

/**
 * FakerBag is a set of tools that people can use to define how
 * their model is generated.
 */
export interface FakerBag {
  faker: Chance.Chance
}

export type RelationConstraint = {
  min?: number
  max?: number
}

/**
 * FakerModel represents the collection of all explicit faking model definitions
 * used in Prisma Faker.
 */
export type FakerSchema = Dictionary<FixtureDefinition>

export type FixtureDefinition = {
  amount?: number
  factory?: Dictionary<FixtureFieldDefinition | (() => FixtureFieldDefinition)>
}

export type ID = string

export type FixtureFieldDefinition = ID | string | number | RelationConstraint
