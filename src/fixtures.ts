import { DMMF } from '@prisma/dmmf'
import PField from '@prisma/dmmf/dist/Field'
import PModel from '@prisma/dmmf/dist/Model'
import * as faker from 'faker'
import uuid = require('uuid/v4')
import { readPrismaYml, findDatamodelAndComputeSchema } from './datamodel'
import {
  FakerBag,
  FakerModel as FModel,
  Fixture,
  RelationConstraints,
} from './types'

/**
 * Calculate the fixtures from the faker model definition.
 *
 * @param model
 */
export function getFixtures(
  fakerModelDefinition?: (bag: FakerBag) => FModel,
  opts: { seed: number } = { seed: 42 },
): Fixture[] {
  fakerStatic.seed(opts.seed)

  /* FakerBag, Defaults */
  const bag: FakerBag = {
    faker,
    constraints: {
      atLeastIfExisting(number) {
        return {
          type: 'AT_LEAST_IF_EXISTING',
          value: number,
        }
      },
      atMax(number) {
        return {
          type: 'AT_MAX',
          value: number,
        }
      },
    },
  }
  const DEFAULT_AMOUNT = 5
  const DEFAULT_CONSTRAINT = bag.constraints.atMax(5)

  /* Prisma and Model evaluation */
  const prisma = readPrismaYml()
  const dmmf = findDatamodelAndComputeSchema(prisma.configPath, prisma.config)

  const fakerModel = fakerModelDefinition(bag)

  /**
   * The Core logic
   * 1. Create fixtures from models. Fixtures tell how many instances of a model
   *  should exist in the end.
   * 2. Create steps from fixtures. Steps cronologically order the creation of the actual
   *  instances to enable relations.
   * 3. Convert steps to virual data instances to calculate relation ids.
   * 4. Apply mock generation functions to obtain actual data, relations are represented as lists
   *  of strings.
   */
  const models = dmmf.datamodel.models. // TODO: sort them

  return []
}

/**
 *
 * Generates mock data for a field.
 *
 * @param field
 */
function fakeField(field: PField) {
  if (field.isUnique) {
    switch (field.type) {
      case 'ID': {
        return uuid()
      }

      case 'String': {
        return uuid()
      }

      default: {
        throw new Error(
          `Unique field not supported. ${model.name}.${field.name}: ${
            field.type
          }`,
        )
      }
    }
  }

  if (field.isScalar()) {
    switch (field.type) {
      case 'String': {
        return faker.random.word()
      }

      case 'Int': {
        return Math.round(faker.random.number({ min: 1, max: 100 }))
      }

      case 'Float': {
        return faker.finance.amount(1, 100000, 4)
      }

      case 'Date': {
        return faker.date.recent()
      }
    }
  }

  return DEFAULT_CONSTRAINT
}
