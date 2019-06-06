import { DMMF } from '@prisma/dmmf'
import PField from '@prisma/dmmf/dist/Field'
import PModel from '@prisma/dmmf/dist/Model'
import * as faker from 'faker'
import uuid = require('uuid/v4')
import { readPrismaYml, findDatamodelAndComputeSchema } from './datamodel'
import {
  FakerBag,
  FakerSchema,
  Fixture,
  Step,
  Order,
  FixtureDefinition,
} from './types'
import { withDefault, topologicalSort } from './utils'

/**
 * Calculate the fixtures from the faker model definition.
 *
 * @param model
 */
export function getFixtures(
  fakerSchemaDefinition?: (bag: FakerBag) => FakerSchema,
  opts: { seed: number } = { seed: 42 },
): Fixture[] {
  fakerStatic.seed(opts.seed)

  /* FakerBag, Defaults */
  const bag: FakerBag = { faker }
  const DEFAULT_AMOUNT = 5
  // const DEFAULT_CONSTRAINT = bag.constraints.atMax(5)

  /* Prisma and Model evaluation */
  const prisma = readPrismaYml()
  const dmmf = findDatamodelAndComputeSchema(prisma.configPath, prisma.config)

  const fakerSchema = fakerSchemaDefinition(bag)

  /**
   * The Core logic
   * 1. Create orders from models. Orders tell how many instances of a model
   *  should exist in the end.
   * 2. Create steps from orders. Steps cronologically order the creation of the actual
   *  instances to enable relations.
   * 3. Convert steps to virual data instances - fixtures, to calculate relation ids.
   * 4. Apply mock generation functions to obtain actual data, relations are represented as lists
   *  of strings.
   */

  const orders: Order[] = getOrdersFromDMMF(dmmf)
  const steps: Step[] = getStepsFromOrders(orders)
  const fixtures: Fixture[] = getFixturesFromSteps(steps)

  return fixtures

  /* Helper functions */

  /**
   * Converts dmmf to fixtures. Fixtures represent the summary of a mock requirements
   * for particular model.
   *
   * @param dmmf
   */
  function getOrdersFromDMMF(dmmf: DMMF): Order[] {
    return dmmf.datamodel.models.map(model => {
      const fakerModel = withDefault<FixtureDefinition>({
        amount: DEFAULT_AMOUNT,
        factory: undefined,
      })(fakerSchema[model.name])

      /* Generate relations based on provided restrictions. */
      const relations: { [field: string]: number } = model.fields
        .filter(f => f.isRelation())
        .reduce((acc, field) => {
          const fakerField = fakerModel.factory[field.name]

          switch (typeof fakerField) {
            case 'object': {
              const min = withDefault(0)(fakerField.min)
              const max = withDefault(min)(fakerField.max)

              return { [field.name]: faker.random.number({ min, max }) }
            }
            default: {
              throw new Error(
                `Expected a relation definition but got ${typeof fakerField} (${
                  model.name
                }.${field.name})`,
              )
            }
          }
        }, {})

      return {
        model: model,
        amount: fakerModel.amount,
        relations: relations,
      }
    })
  }

  /**
   * Coverts fixtures to steps. Steps represent an ordered entity that specifies the creation
   * of a virtual data.
   *
   * Creates a pool of available instances and validates relation constraints.
   *
   * @param fixtures
   */
  function getStepsFromOrders(orders: Order[]): Step[] {
    const pool = orders.reduce((acc, order) => ({
      ...acc,
      [order.model.name]: order.amount,
    }))

    // function sort

    const relations = topologicalSort<Order>((x, y) => {
      return true
    }, orders)

    return []
  }

  /**
   * Converts fixtures from steps by creating a pool of available instances
   * and assigning relations to particular types.
   *
   * @param steps
   */
  function getFixturesFromSteps(steps: Step[]): Fixture[] {
    return []
  }
}
