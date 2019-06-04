import Field from '@prisma/dmmf/dist/Field'
import Model from '@prisma/dmmf/dist/Model'
import { Dictionary } from 'lodash'

/**
 * FakerBag is a set of tools that people can use to define how
 * their model is generated.
 */
export interface FakerBag {
  faker: Faker.FakerStatic
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

export type FixtureFieldDefinition = string | number | RelationConstraint

/**
 * Prisma Faker uses intermediate step between model-faker definition
 * and database seeding. Fixture is a virtual data unit used to describe
 * future data and calculate relations.
 */
export interface Order {
  model: Model
  amount: number
  relations: { [field: string]: number }
}

export interface Step {
  order: number // the creation order of a step, starts with 0
  model: Model
  amount: number // number of instances created in this step
  runningNumber: number // specifies the total number of all instances
  relations: { [field: string]: number }
}

/**
 * Represents the virtual unit.
 */
export interface Fixture {
  order: number // starts with 0
  id: string
  model: Model
}
