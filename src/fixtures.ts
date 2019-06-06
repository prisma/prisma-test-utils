import { DMMF } from '@prisma/dmmf'
import Model from '@prisma/dmmf/dist/Model'
import * as faker from 'faker'
import * as _ from 'lodash'
import { Dictionary } from 'lodash'
// import { readPrismaYml, findDatamodelAndComputeSchema } from './datamodel'
import { Faker, FakerBag, FakerSchema, ID } from './types'
import { withDefault } from './utils'

/**
 * Seed the database with mock data.
 *
 * @param fakerSchemaDefinition
 * @param opts
 */
export function seed(
  dmmf: DMMF,
  fakerSchemaDefinition?: Faker,
  opts: { seed?: number; silent?: boolean } = { seed: 42, silent: false },
): object[] | Promise<object[]> {
  /* FakerBag, Defaults */
  const bag: FakerBag = { faker }
  const DEFAULT_AMOUNT = 5
  // const DEFAULT_CONSTRAINT = bag.constraints.atMax(5)

  /* Prisma and Model evaluation */
  // const prisma = readPrismaYml()
  // const dmmf = findDatamodelAndComputeSchema(prisma.configPath, prisma.config)

  const fakerSchema = fakerSchemaDefinition(bag)

  /* Fixture calculations */
  const orders: Order[] = getOrdersFromDMMF(dmmf)
  const steps: Step[] = getStepsFromOrders(orders)
  const fixtures: Fixture[] = getFixturesFromSteps(fakerSchema, steps)

  // TODO: seeding

  if (opts.silent) {
    return fixtures
  } else {
    return Promise.resolve(fixtures)
  }

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

  /**
   * Prisma Faker uses intermediate step between model-faker definition
   * and database seeding. Fixture is a virtual data unit used to describe
   * future data and calculate relations.
   */
  interface Order {
    model: Model
    amount: number
    relations: Dictionary<{ min: number; max: number }>
  }

  /**
   * Note the `relationTo` field; it defines the direction of a relation.
   * This helps with the execution process calculation. If the relation is
   * pointing towards the model, we shouldn't create it since the cyclic complement
   * will implement it.
   */
  interface Step {
    order: number // the creation order of a step, starts with 0
    model: Model
    amount: number // number of instances created in this step
    runningNumber: number // specifies the total number of all instances
    relations: Dictionary<{
      type: '1-1' | '1-N' | 'M-N'
      relationTo: string // determines the direction of relation
      amount: number
    }>
  }

  type FixtureData = Dictionary<
    ID | string | number | boolean | ID[] | string[] | number[] | boolean[]
  >

  /**
   * Represents the virtual unit.
   */
  interface Fixture {
    order: number // starts with 0
    id: string
    model: Model
    data: FixtureData
  }

  /* Helper functions */

  /**
   * Converts dmmf to fixtures. Fixtures represent the summary of a mock requirements
   * for particular model.
   *
   * @param dmmf
   */
  function getOrdersFromDMMF(dmmf: DMMF): Order[] {
    return dmmf.datamodel.models.map(model => {
      const fakerModel = withDefault(
        {
          amount: DEFAULT_AMOUNT,
          factory: undefined,
        },
        fakerSchema[model.name],
      )

      /* Generate relations based on provided restrictions. */
      const relations: Order['relations'] = model.fields
        .filter(f => f.isRelation())
        .reduce((acc, field) => {
          const fakerField = fakerModel.factory[field.name]

          switch (typeof fakerField) {
            case 'object': {
              const min = withDefault(0, fakerField.min)
              const max = withDefault(min, fakerField.max)

              return { [field.name]: { min, max } }
            }
            default: {
              throw new Error(`Expected a relation got ${typeof fakerField}`)
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
    type Pool = Dictionary<{
      model: Model
      remainingUnits: number
      allUnits: number
    }>

    const pool: Pool = orders.reduce(
      (acc, order) => ({
        ...acc,
        [order.model.name]: {
          model: order.model,
          remainingUnits: order.amount,
        },
      }),
      {},
    )

    /**
     * The sort function functionally implements topological sort algorithm
     * by making sure all relations have been defined prior to the inclusion of
     * an order in the chain.
     */
    function sort(
      remainingOrders: Order[],
      sortedSteps: Step[],
      pool: Pool,
    ): Step[] {
      switch (remainingOrders.length) {
        case 0: {
          return []
        }
        case 1: {
          const [o] = remainingOrders

          /* Checks if the order is well defined */
          if (Object.keys(o.relations).every(pool.hasOwnProperty)) {
            return getStepsFromOrder().steps
          } else {
            throw new Error(`${o.model.name} uses undefined relations!`)
          }
        }
        default: {
          const [o, ...os] = remainingOrders

          /* Checks if the order is well defined */
          if (Object.keys(o.relations).every(pool.hasOwnProperty)) {
            const { steps, pool: remainingPool } = getStepsFromOrder()
            return [
              ...steps,
              ...sort(os, [...sortedSteps, ...steps], remainingPool),
            ]
          } else {
            return sort([...os, o], sortedSteps, pool)
          }
        }
      }
      return []
    }

    function getStepsFromOrder(): { steps: Step[]; pool: Pool } {
      // const foo = [
      //   {
      //     order: getStepNumber(pool),
      //     model: o.model,
      //     amount: pool[o.model.name].remainingUnits,
      //     runningNumber: o.amount,
      //     relations: getModelRelations(),
      //   },
      // ]

      return { steps: [], pool: {} }
    }

    /**
     * Calculates the step number from the pool.
     *
     * @param pool
     */
    function getStepNumber(pool: Pool): number {
      return _.sum(Object.values(pool).map(m => m.allUnits - m.remainingUnits))
    }

    /* Triggers the order conversion */
    const steps = sort(orders, [], {})

    return steps
  }

  /**
   * Converts fixtures from steps by creating a pool of available instances
   * and assigning relations to particular types.
   *
   * @param steps
   */
  function getFixturesFromSteps(schema: FakerSchema, steps: Step[]): Fixture[] {
    faker.seed(opts.seed)

    type Pool = Dictionary<ID[]>

    const [fixtures] = _.sortBy(steps, s => s.order).reduce<[Fixture[], Pool]>(
      ([fixtures, pool], step) => {
        const [data, newPool] = getMockDataForStep(pool, step)

        const fixture: Fixture = {
          order: 0,
          id: faker.random.uuid(),
          model: step.model,
          data: data,
        }

        const poolWithFixture = insertInstanceIDIntoPool(
          newPool,
          step.model.name,
          fixture.id,
        )

        return [fixtures.concat(fixture), poolWithFixture]
      },
      [[], {}],
    )

    return fixtures

    /* Helper functions */

    /**
     * Generates mock data from the provided model. Scalars return a mock scalar or
     * list of mock scalars, relations return an ID or lists of IDs.
     */
    function getMockDataForStep(_pool: Pool, step: Step): [FixtureData, Pool] {
      const [finalPool, fixture] = step.model.fields.reduce(
        ([pool, acc], field) => {
          const fieldModel = field.getModel()
          const mock = fallback =>
            withDefault(fallback, schema[step.model.name][fieldModel.name])()

          switch (field.type) {
            case 'ID': {
              const id = mock(faker.random.uuid)

              return [pool, { ...acc, [field.name]: id }]
            }
            case 'String': {
              const string = mock(faker.random.word)

              return [pool, { ...acc, [field.name]: string }]
            }
            case 'Int': {
              const number = mock(faker.random.number)

              return [pool, { ...acc, [field.name]: number }]
            }
            case 'Float': {
              const float = mock(faker.finance.amount)

              return [pool, { ...acc, [field.name]: float }]
            }
            case 'Date': {
              const date = mock(faker.date.past)

              return [pool, { ...acc, [field.name]: date }]
            }
            default: {
              /* Relations */
              if (field.isRelation()) {
                if (field.isList) {
                  const [id, newPool] = getInstanceIDsFromPool(
                    pool,
                    fieldModel.name,
                    step.relations[fieldModel.name].amount,
                  )
                  return [newPool, { ...acc, [field.name]: id }]
                } else {
                  const [id, newPool] = getInstanceIDFromPool(
                    pool,
                    fieldModel.name,
                  )
                  return [newPool, { ...acc, [field.name]: id }]
                }
              }

              /* Custom field mocks */
              if (schema[step.model.name][fieldModel.name]) {
                return schema[step.model.name][fieldModel.name]()
              }

              /* Fallback for unsupported scalars */
              throw new Error(`Unsupported field type "${field.type}".`)
            }
          }
        },
        [_pool, {}],
      )

      return [fixture, finalPool]
    }

    /**
     * Retrieves an ID from the pool and removes its instance.
     */
    function getInstanceIDFromPool(pool: Pool, type: string): [ID, Pool] {
      return [pool[type][0], { ...pool, [type]: pool[type].splice(1) }]
    }

    /**
     * Retrieves an ID from the pool and removes its instance.
     */
    function getInstanceIDsFromPool(
      pool: Pool,
      type: string,
      n: number,
    ): [ID[], Pool] {
      return [pool[type].slice(0, n), { ...pool, [type]: pool[type].splice(n) }]
    }

    /**
     * Inserts an ID into the pool and returns the new pool.
     */
    function insertInstanceIDIntoPool(pool: Pool, type: string, id: ID): Pool {
      return {
        ...pool,
        [type]: [...withDefault([], pool[type]), id],
      }
    }
  }
}
