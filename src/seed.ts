import { DMMF } from '@prisma/dmmf'
import Field from '@prisma/dmmf/dist/Field'
import Model from '@prisma/dmmf/dist/Model'
import Chance from 'chance'
import _ from 'lodash'
import { Dictionary } from 'lodash'
// import { readPrismaYml, findDatamodelAndComputeSchema } from './datamodel'
import { Faker, FakerBag, FakerSchema, ID, FixtureDefinition } from './types'
import { withDefault } from './utils'

export interface SeedOptions {
  seed?: number
  silent?: boolean
  instances?: number
}

/**
 * Seed the database with mock data.
 *
 * @param fakerSchemaDefinition
 * @param opts
 */
export function seed(
  dmmf: DMMF,
  schemaDef?: Faker | SeedOptions,
  _opts?: SeedOptions,
): object[] | Promise<object[]> {
  /* Argument manipulation */

  const __opts = typeof schemaDef === 'object' ? schemaDef : _opts

  const opts = {
    seed: 42,
    silent: false,
    instances: 5,
    ...__opts,
  }

  /* FakerBag, SchemaDefinition */

  const faker = new Chance(_opts.seed)

  const bag: FakerBag = { faker }
  const fakerSchema = typeof schemaDef === 'function' ? schemaDef(bag) : {}

  /* Prisma Model evaluation */

  // const prisma = readPrismaYml()
  // const dmmf = findDatamodelAndComputeSchema(prisma.configPath, prisma.config)

  /* Fixture calculations */

  const orders: Order[] = getOrdersFromDMMF(dmmf)
  const steps: Step[] = getStepsFromOrders(orders)
  const tasks: Task[] = getTasksFromSteps(steps)
  const fixtures: Fixture[] = getFixturesFromTasks(fakerSchema, tasks)

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
   * 3. Create Tasks from Steps. Tasks represent single unordered unit derived from Step.
   * 4. Convert tasks to virual data instances, apply mock generation functions to obtain actual data, relations are represented as lists
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
    relations: Dictionary<{ connections: number; field: Field }>
    // relations: Dictionary<{ min: number; max: number }>
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
    relations: Dictionary<{
      type: '1-1' | '1-N' | 'M-N'
      relationTo: string // determines the direction of relation
      amount: number
    }>
  }

  interface Task {
    order: number // the creation order of a step, starts with 0
    model: Model
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
    relations: Dictionary<{
      type: '1-1' | '1-N' | 'M-N'
      relationTo: string // determines the direction of relation
    }>
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
          amount: opts.instances,
          factory: undefined,
        },
        fakerSchema[model.name],
      )

      /* Generate relations based on provided restrictions. */
      const relations: Order['relations'] = model.fields
        .filter(f => f.isRelation())
        .reduce<Order['relations']>((acc, field) => {
          const fakerField = fakerModel.factory[field.name]

          switch (typeof fakerField) {
            case 'object': {
              /**
               * TODO: now, max is treated as a constant, think whether it's possible
               * to have a range. (Possible solution: change amount of objects to max_amount,
               * and take from the pool.)
               */
              const min = withDefault(0, fakerField.min)
              const max = withDefault(min, fakerField.max)

              return { ...acc, [field.name]: { connections: max, field } }
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

    /* Triggers the order to steps conversion */

    const steps = sort(orders, orders, [], {})

    return steps

    /* Helper functions */

    /**
     * The sort function functionally implements topological sort algorithm
     * by making sure all relations have been defined prior to the inclusion of
     * an order in the chain.
     */
    function sort(
      allOrders: Order[],
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
          if (isOrderWellDefinedInPool(pool, o)) {
            const [steps] = getStepsFromOrder(allOrders, sortedSteps, pool, o)

            return steps
          } else {
            /** Since this is the last order, we cannot obtain any new resources,
             * meaning that there's an issue with the order.
             */
            throw new Error(`${o.model.name} uses undefined relations!`)
          }
        }
        default: {
          const [o, ...os] = remainingOrders

          /* Checks if the order is well defined */
          if (isOrderWellDefinedInPool(pool, o)) {
            const [steps, newPool] = getStepsFromOrder(
              allOrders,
              sortedSteps,
              pool,
              o,
            )

            return [
              ...steps,
              ...sort(allOrders, os, [...sortedSteps, ...steps], newPool),
            ]
          } else {
            /**
             * If the order is not yet well defined, we put it at the end of the list
             * and wait for resources in the pool to be adequate.
             */
            return sort(allOrders, [...os, o], sortedSteps, pool)
          }
        }
      }
    }

    /**
     * Determines whether we can already process the order based on the pool
     * capacity.
     *
     * This function in combination with `getStepsFromOrder` should give you
     * all you need to implement meaningful topological sort on steps.
     */
    function isOrderWellDefinedInPool(pool: Pool, order: Order) {
      return Object.values(order.relations).every(relation =>
        pool.hasOwnProperty(relation.field.type),
      )
    }

    /**
     * Converts a well defined order to multiple steps.
     *
     * This function in combination with `isOrderWellDefinedInPool` should give
     * you everything you need to implement meaningful topological sort on steps.
     */
    function getStepsFromOrder(
      allOrders: Order[],
      sortedSteps: Step[],
      pool: Pool,
      order: Order,
    ): [Step[], Pool] {
      // const User: Step = {
      //   order: sortedSteps.length,
      //   amount: order.amount,
      //   model: order.model,
      //   relations: {
      //     Bookmark: {
      //       type: '1-N',
      //       relationTo: 'Bookmark',
      //       amount: order.relations['Bookmark'].connections,
      //     },
      //   },
      // }

      // // Bookmark
      // const Bookmark: Step = {
      //   order: sortedSteps.length,
      //   amount: order.amount,
      //   model: order.model,
      //   relations: {},
      // }

      const [relations, drainedPool] = getRelations(pool, order)

      const step: Step = {
        order: sortedSteps.length,
        amount: order.amount,
        model: order.model,
        relations: relations,
      }

      /**
       * Assumes that there cannot exist two models with the same name.
       */
      const newPool: Pool = {
        ...drainedPool,
        [order.model.name]: {
          model: order.model,
          remainingUnits: order.amount,
          allUnits: order.amount,
        },
      }

      return [[step], newPool]
    }

    /**
     * Calculates the number of connections between models and drains the pool.
     */
    function getRelations(pool: Pool, order: Order): [Step['relations'], Pool] {
      const [relations, drainedPool] = Object.values(order.relations).reduce<
        [Step['relations'], Pool]
      >(
        ([acc, pool], relation) => {
          const poolResources = pool[relation.field.type]

          /* Resource Validation */

          if (relation.connections > poolResources.remainingUnits) {
            throw new Error(`There's not enough "${order.model.name}" units.`)
          }

          /* Pool draining */

          const newPool: Pool = {
            ...pool,
            [relation.field.type]: {
              model: poolResources.model,
              remainingUnits:
                poolResources.remainingUnits - relation.connections,
              allUnits: poolResources.allUnits,
            },
          }

          return [
            {
              ...acc,
              [relation.field.name]: {
                type: '1-N',
                amount: relation.connections,
                relationTo: '',
              },
            },
            newPool,
          ]
        },
        [{}, pool],
      )

      return [relations, drainedPool]
    }
  }

  /**
   * Converts steps to tasks.
   *
   * Steps to Tasks introduce no non-trivial logic. It's a simple conversion mechanism
   * to make system more robuts and make the mocking part more granular.
   *
   * @param steps
   */
  function getTasksFromSteps(steps: Step[]): Task[] {
    const tasks = steps.reduce<Task[]>((acc, step) => {
      const intermediateTasks: Task[] = Array(step.amount).fill({
        order: step.order,
        model: step.model,
        relations: step.relations,
      })

      return acc.concat(...intermediateTasks)
    }, [])

    return tasks
  }

  /**
   * Converts fixtures from steps by creating a pool of available instances
   * and assigning relations to particular types.
   *
   * This function assumes that:
   *  1. Tasks (Steps) are sorted in such an order that pool always possesses
   *    all required instances,
   *  2. There are enough resources in the pool at all times,
   *  3. The provided schema is valid.
   *
   * @param steps
   */
  function getFixturesFromTasks(schema: FakerSchema, tasks: Task[]): Fixture[] {
    type Pool = Dictionary<ID[]>

    const [fixtures] = _.sortBy(tasks, t => t.order).reduce<[Fixture[], Pool]>(
      ([fixtures, pool], task) => {
        const [data, newPool] = getMockDataForTask(pool, task)

        const fixture: Fixture = {
          order: fixtures.length,
          id: faker.guid(),
          model: task.model,
          data: data,
          relations: task.relations,
        }

        const poolWithFixture = insertInstanceIDIntoPool(
          newPool,
          task.model.name,
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
    function getMockDataForTask(_pool: Pool, task: Task): [FixtureData, Pool] {
      const [finalPool, fixture] = task.model.fields.reduce(
        ([pool, acc], field) => {
          const fieldModel = field.getModel()
          const mock = fallback =>
            withDefault(fallback, schema[task.model.name][fieldModel.name])()

          switch (field.type) {
            case 'ID': {
              const id = faker.guid() //mock(faker.guid)

              return [pool, { ...acc, [field.name]: id }]
            }
            case 'String': {
              const string = faker.word() //mock(faker.word)

              return [pool, { ...acc, [field.name]: string }]
            }
            case 'Int': {
              const number = faker.integer() //mock(faker.integer)

              return [pool, { ...acc, [field.name]: number }]
            }
            case 'Float': {
              const float = faker.floating() //mock(faker.floating)

              return [pool, { ...acc, [field.name]: float }]
            }
            case 'Date': {
              const date = faker.date() //mock(faker.date)

              return [pool, { ...acc, [field.name]: date }]
            }
            default: {
              /* Relations */
              if (field.isRelation()) {
                if (field.isList) {
                  const [id, newPool] = getInstanceIDsFromPool(
                    pool,
                    field.type,
                    task.relations[field.name].amount,
                  )
                  return [newPool, { ...acc, [field.name]: id }]
                } else {
                  const [id, newPool] = getInstanceIDFromPool(pool, field.type)

                  return [newPool, { ...acc, [field.name]: id }]
                }
              }

              /* Custom field mocks */
              if (schema[task.model.name][fieldModel.name]) {
                return schema[task.model.name][fieldModel.name]()
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
