import { DMMF } from '@prisma/dmmf'
import Field from '@prisma/dmmf/dist/Field'
import Mapping from '@prisma/dmmf/dist/Mapping'
import Model from '@prisma/dmmf/dist/Model'
import Chance from 'chance'
import _ from 'lodash'
import { Dictionary } from 'lodash'
// import { readPrismaYml, findDatamodelAndComputeSchema } from './datamodel'
import { Faker, FakerBag, FakerSchema, ID, RelationConstraint } from './types'
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
  const photon: any = {}

  /* Fixture calculations */

  const orders: Order[] = getOrdersFromDMMF(dmmf)
  const steps: Step[] = getStepsFromOrders(orders)
  const tasks: Task[] = getTasksFromSteps(steps)
  const fixtures: Fixture[] = getFixturesFromTasks(fakerSchema, tasks)

  const seeds = seedFixturesToDatabase(photon, fixtures, {
    silent: opts.silent,
  })

  return seeds

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
  type Order = {
    model: Model
    mapping: Mapping
    amount: number
    relations: Dictionary<Relation>
  }

  type RelationType = '1-to-1' | '1-to-many' | 'many-to-1' | 'many-to-many'

  type Relation = {
    type: RelationType
    relationTo: string
    field: Field
    min: number
    max: number
  }

  /**
   * Note the `relationTo` field; it defines the direction of a relation.
   * This helps with the execution process calculation. If the relation is
   * pointing towards the model, we shouldn't create it since the cyclic complement
   * will implement it.
   */
  type Step = {
    order: number // the creation order of a step, starts with 0
    model: Model
    mapping: Mapping
    amount: number // number of instances created in this step
    relations: Dictionary<Relation>
  }

  type Task = {
    order: number // the creation order of a step, starts with 0
    model: Model
    mapping: Mapping
    relations: Dictionary<Relation>
  }

  type FixtureData = Dictionary<
    ID | string | number | boolean | ID[] | string[] | number[] | boolean[]
  >

  /**
   * Represents the virtual unit.
   */
  type Fixture = {
    order: number // starts with 0
    id: string
    model: Model
    mapping: Mapping
    data: FixtureData
    relations: Dictionary<{
      type: RelationType
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
      /* User defined settings */
      const fakerModel = withDefault(
        {
          amount: opts.instances,
          factory: undefined,
        },
        fakerSchema[model.name],
      )

      /* Find Photon mappings for seeding step */
      const mapping = dmmf.mappings.find(m => m.model === model.name)

      /* Generate relations based on provided restrictions. */
      const relations: Order['relations'] = model.fields
        .filter(f => f.isRelation())
        .reduce<Order['relations']>((acc, field) => {
          const fakerField: RelationConstraint = _.get(
            fakerModel,
            ['factory', field.name],
            {
              min: 1,
              max: 1,
            },
          )

          switch (typeof fakerField) {
            case 'object': {
              /* Calculate the relation properties */
              const { type, min, max } = getRelationType(
                dmmf.datamodel.models,
                field,
                fakerField,
              )

              return {
                ...acc,
                [field.name]: {
                  type: type,
                  min: min,
                  max: max,
                  relationTo: '',
                  field,
                },
              }
            }
            default: {
              throw new Error(
                `Expected a relation constraint got ${typeof fakerField}`,
              )
            }
          }
        }, {})

      return {
        model: model,
        mapping: mapping,
        amount: fakerModel.amount,
        relations: relations,
      }
    })

    /**
     * Derives the relation type and constraints from the field
     * and definition.
     *
     * We have four different relation types:
     * 1. 1-to-1
     *  ~ There can be at most one connection or none if optional.
     *  ~ We'll connect the nodes from this model (a child model).
     * 2. 1-to-many
     *  ~ The node can have 0 to infinite connections (we'll use min/max spec).
     *  ~ We'll connect the nodes from this model (a child model).
     * 3. many-to-1
     *  ~ A particular instance can either connect or not connect if optional.
     *  ~ We'll fill the pool with ids of this model (a parent model).
     * 4. many-to-many
     *  ~ A particular instance can have 0 to infinite connections (we'll use min/max spec).
     *  ~ We'll use `relationTo` to determine whether this is a parent or child model.
     *
     * We presume that the field is a relation.
     */
    function getRelationType(
      allModels: Model[],
      field: Field,
      definition: RelationConstraint,
    ): {
      type: RelationType
      min: number
      max: number
    } {
      /* Models */

      const fieldModel = field.getModel()
      const relationModel = allModels.find(m => m.name === field.type)

      const relationField = withDefault<Field>(
        {
          kind: '',
          name: '',
          isRequired: true,
          isList: false,
          isId: false,
          type: field.type,
        } as Field,
        relationModel.fields.find(f => f.type === fieldModel.name),
      )

      if (field.isList && relationField.isList) {
        /**
         * many-to-many (A)
         *
         * model A {
         *  bs: [B]
         * }
         * model B {
         *  as: [A]
         * }
         */
        const min = withDefault(0, definition.min)
        const max = withDefault(min, definition.max)

        return {
          type: 'many-to-many',
          min: min,
          max: max,
        }
      } else if (!field.isList && relationField.isList) {
        /**
         * many-to-1 (A)
         *
         * model A {
         *  b: B
         * }
         * model B {
         *  as: [A]
         * }
         */

        return {
          type: 'many-to-1',
          min: field.isRequired ? 1 : 0,
          max: 1,
        }
      } else if (field.isList && !relationField.isList) {
        /**
         * 1-to-many (A)
         *
         * model A {
         *  bs: [B]
         * }
         *
         * model B {
         *  a: A
         * }
         */

        const min = withDefault(field.isRequired ? 1 : 0, definition.min)
        const max = withDefault(min, definition.max)

        return {
          type: '1-to-many',
          min: min,
          max: max,
        }
      } else {
        /**
         * 1-to-1 (A)
         *
         * model A {
         *  b: B
         * }
         * model B {
         *  a: A
         * }
         */

        return {
          type: '1-to-1',
          min: field.isRequired ? 1 : 0,
          max: 1,
        }
      }
    }
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
      units: number
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
      return Object.values(order.relations).every(
        relation =>
          pool.hasOwnProperty(relation.field.type) ||
          relation.type === 'many-to-1' ||
          relation.type === 'many-to-many',
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
      /**
       * A step unit derived from the order.
       */
      const step: Step = {
        order: sortedSteps.length,
        amount: order.amount,
        model: order.model,
        mapping: order.mapping,
        relations: order.relations,
      }

      /**
       * Assumes that there cannot exist two models with the same name.
       */
      const newPool: Pool = {
        ...pool,
        [order.model.name]: {
          model: order.model,
          units: order.amount,
        },
      }

      return [[step], newPool]
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
      const intermediateTasks: Task[] = Array<Task>(step.amount).fill({
        order: step.order,
        model: step.model,
        mapping: step.mapping,
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
    /**
     * Pool describes the resources made available by a parent type to its children.
     */
    type Pool = Dictionary<{ [child: string]: ID[] }>

    const [fixtures] = _.sortBy(tasks, t => t.order).reduce<[Fixture[], Pool]>(
      ([fixtures, pool], task) => {
        const id = faker.guid()
        const [data, newPool] = getMockDataForTask(id, pool, task)

        const fixture: Fixture = {
          order: fixtures.length,
          id: id,
          model: task.model,
          mapping: task.mapping,
          data: data,
          relations: task.relations,
        }

        return [fixtures.concat(fixture), newPool]
      },
      [[], {}],
    )

    return fixtures

    /* Helper functions */

    /**
     * Generates mock data from the provided model. Scalars return a mock scalar or
     * list of mock scalars, relations return an ID or lists of IDs.
     */
    function getMockDataForTask(
      id: ID,
      _pool: Pool,
      task: Task,
    ): [FixtureData, Pool] {
      const [finalPool, fixture] = task.model.fields.reduce(
        ([pool, acc], field) => {
          const fieldModel = field.getModel()

          /* Custom field mocks */

          if (
            schema[task.model.name] &&
            schema[task.model.name].factory &&
            schema[task.model.name].factory[field.name]
          ) {
            const mock = schema[task.model.name].factory[field.name]
            switch (typeof mock) {
              case 'function': {
                const value = mock()
                return [pool, { ...acc, [field.name]: value }]
              }
              case 'object': {
                /* Relation constraint */
                break
              }
              default: {
                const value = mock
                return [pool, { ...acc, [field.name]: value }]
              }
            }
          }

          switch (field.type) {
            case 'ID': {
              const id = faker.guid()

              return [pool, { ...acc, [field.name]: id }]
            }
            case 'String': {
              const string = faker.word()

              return [pool, { ...acc, [field.name]: string }]
            }
            case 'Int': {
              const number = faker.integer()

              return [pool, { ...acc, [field.name]: number }]
            }
            case 'Float': {
              const float = faker.floating()

              return [pool, { ...acc, [field.name]: float }]
            }
            case 'Date': {
              const date = faker.date()

              return [pool, { ...acc, [field.name]: date }]
            }
            default: {
              /* Relations */
              if (field.isRelation()) {
                /* Resources calculation */
                const relation = task.relations[field.name]
                const units = faker.integer({
                  min: relation.min,
                  max: relation.max,
                })

                switch (relation.type) {
                  case '1-to-1': {
                    /**
                     * 1-to-1 relation should take at most one id from the resource pool
                     * and submit no new ids. Because we already manage requirements during
                     * order creation step, we can ignore it now.
                     */
                    const [newPool, ids] = getIDInstancesFromPool(
                      pool,
                      fieldModel.name,
                      field.type,
                      units,
                    )

                    /**
                     * This makes sure that relations are properly connected.
                     */
                    switch (ids.length) {
                      case 0: {
                        return [newPool, acc]
                      }

                      case 1: {
                        const [id] = ids
                        return [
                          newPool,
                          { ...acc, [field.name]: { connect: { id } } },
                        ]
                      }

                      default: {
                        throw new Error(`Something truly unexpected happened.`)
                      }
                    }
                  }
                  case '1-to-many': {
                    /**
                     * 1-to-many takes from 0 or 1 to min/max number of ids from the pool
                     * and creates no new ids along the way. We don't have to worry about that
                     * though since we have taken care of everything during the order generation
                     * step.
                     */
                    const [newPool, ids] = getIDInstancesFromPool(
                      pool,
                      fieldModel.name,
                      field.type,
                      units,
                    )

                    const connections = ids.reduce((acc, id) => {
                      return [...acc, { id }]
                    }, [])

                    return [
                      newPool,
                      {
                        ...acc,
                        [field.name]: {
                          connect: connections,
                        },
                      },
                    ]
                  }
                  case 'many-to-1': {
                    /**
                     * Many-to-1 relations only give out ids to be later
                     * accessed by 1-to relations.
                     */

                    const newPool = insertIDInstancesIntoPool(
                      pool,
                      field.type,
                      fieldModel.name,
                      id,
                      units,
                    )

                    return [newPool, acc]
                  }
                  case 'many-to-many': {
                    // TODO: Implement `relationTo`!
                    return [pool, acc]
                  }
                }
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

    // TODO: Is it possible that a relation gets multiple same ids?

    /**
     * Retrieves an ID from the pool and removes its instance.
     */
    function getIDInstancesFromPool(
      pool: Pool,
      parent: string,
      child: string,
      n: number = 1,
    ): [Pool, ID[]] {
      const ids = _.get(pool, [parent, child])
      return [_.set(pool, [parent, child], ids.splice(n)), ids.slice(0, n)]
    }

    /**
     * Inserts n-replications of ID into the pool and returns the new pool.
     */
    function insertIDInstancesIntoPool(
      pool: Pool,
      parent: string,
      child: string,
      id: ID,
      n: number = 1,
    ): Pool {
      const ids = _.get(pool, [parent, child], [])
      return _.set(pool, [parent, child], [...ids, ...Array(n).fill(id)])
    }
  }

  /**
   * Seeds the fixtures to the database. Based on the `silent` option
   * it performs data push. Photon is provided globally.
   *
   * @param fixtures
   * @param opts
   */
  function seedFixturesToDatabase(
    photon: any,
    fixtures: Fixture[],
    opts: { silent: boolean } = { silent: false },
  ): object[] | Promise<object[]> {
    if (opts.silent) {
      return _.sortBy(fixtures, f => f.order).map(f => f.data)
    } else {
      /**
       * Generates a chain of promises that create DB instances.
       */
      const actions = _.sortBy(fixtures, f => f.order).reduce<
        Promise<object[]>
      >(async (acc, f) => {
        return acc.then(async res => {
          const seed = await photon[f.mapping.create]({ data: f.data })
          return res.concat(seed)
        })
      }, Promise.resolve([]))
      return actions
    }
  }
}
