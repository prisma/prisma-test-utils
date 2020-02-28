import { DMMF, debug } from '@prisma/client/runtime'
import Chance from 'chance'
import _ from 'lodash'
import { Dictionary } from 'lodash'
import mls from 'multilines'

import { Scalar } from './scalars'
import {
  ID,
  SeedKit,
  SeedModels,
  SeedOptions,
  SeedModelFieldDefinition,
  SeedModelFieldRelationConstraint,
  SeedFunction,
  PrismaClientType,
  FixtureData,
} from './types'
import { withDefault } from './utils'

/**
 * Creates a function which can be used to seed mock data to database.
 *
 * @param dmmf
 */
export function getSeed<
  GeneratedPrismaClientType extends PrismaClientType,
  GeneratedSeedModels extends SeedModels
>(
  dmmf: DMMF.Document,
): SeedFunction<GeneratedPrismaClientType, GeneratedSeedModels> {
  return async (
    options: SeedOptions<GeneratedPrismaClientType, GeneratedSeedModels>,
  ) => {
    /**
     * The wrapped function which handles the execution of
     * the seeding algorithm.
     */
    const opts = {
      seed: 42,
      // persist: true,
      ...options,
    }

    const faker = new Chance(opts.seed)

    const kit: SeedKit = { faker }
    const models: SeedModels = options.models
      ? options.models(kit)
      : { '*': { amount: 5 } }

    /* Fixture calculations */

    const orders: Order[] = getOrdersFromDMMF(dmmf, models)
    const steps: Step[] = getStepsFromOrders(orders)
    const tasks: Task[] = getTasksFromSteps(steps)

    debugger

    /* Creates mock data and pushes it to Prisma */

    const fixtures: Fixture[] = await seedTasks(
      options.client,
      faker,
      models,
      tasks,
    )

    debugger

    return fixtures
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
  type Order = {
    model: DMMF.Model
    mapping: DMMF.Mapping
    amount: number
    relations: Dictionary<Relation>
  }

  type RelationType = '1-to-1' | '1-to-many' | 'many-to-1' | 'many-to-many'

  type Relation = {
    type: RelationType
    relationTo: string
    field: DMMF.Field
    backRelationField: DMMF.Field // signifies the back relation
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
    model: DMMF.Model
    mapping: DMMF.Mapping
    amount: number // number of instances created in this step
    relations: Dictionary<Relation>
  }

  type Task = {
    order: number // the creation order of a step, starts with 0
    model: DMMF.Model
    mapping: DMMF.Mapping
    relations: Dictionary<Relation>
  }

  /**
   * Represents the virtual unit.
   */
  type Fixture = {
    model: DMMF.Model
    mapping: DMMF.Mapping
    seed: any
    data: FixtureData
    relations: Dictionary<{
      type: RelationType
      relationTo: string // determines the direction of relation
    }>
  }

  /* Helper functions */

  /**
   * Converts dmmf to orders. Orders represent the summary of a mock requirements
   * for particular model. During generation the function detects relation types,
   * and validates the bulk of the request.
   *
   * @param dmmf
   */
  function getOrdersFromDMMF(
    dmmf: DMMF.Document,
    seedModels: SeedModels,
  ): Order[] {
    type FixtureDefinition = {
      amount: number
      factory?: Dictionary<
        SeedModelFieldDefinition | (() => SeedModelFieldDefinition)
      >
    }

    return dmmf.datamodel.models.map(model => {
      /* User defined settings */
      const fakerModel = getSeedModel(seedModels, model.name)

      /* Find Photon mappings for seeding step */
      const mapping = dmmf.mappings.find(m => m.model === model.name)!

      /* Generate relations based on provided restrictions. */
      const relations: Order['relations'] = model.fields
        .filter(f => f.kind === 'object')
        .reduce<Order['relations']>((acc, field) => {
          const seedModelField: SeedModelFieldRelationConstraint = _.get(
            fakerModel,
            ['factory', field.name],
            {
              min: 1,
              max: 1,
            },
          ) as object

          switch (typeof seedModelField) {
            case 'object': {
              /* Calculate the relation properties */
              const {
                type,
                min,
                max,
                backRelationField,
                relationTo,
              } = getRelationType(
                dmmf.datamodel.models,
                seedModels,
                field,
                model,
                seedModelField,
              )

              return {
                ...acc,
                [field.name]: {
                  type: type,
                  min: min,
                  max: max,
                  relationTo: relationTo,
                  field,
                  backRelationField,
                },
              }
            }
            /* istanbul ignore next */
            default: {
              throw new Error(
                `Expected a relation constraint got ${typeof seedModelField}`,
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
     * Finds a model definition in seed models or returns the required
     * fallback seed model definition.
     */
    function getSeedModel(
      seedModels: SeedModels,
      model: string,
    ): FixtureDefinition {
      const fallback = seedModels['*']
      const definitionConstructor = _.get(seedModels, model)

      return withDefault(fallback, {
        amount: seedModels['*'].amount,
        ...definitionConstructor,
      })
    }

    /**
     * Finds the prescribed model from the DMMF models.
     */
    function getDMMFModel(models: DMMF.Model[], model: string): DMMF.Model {
      return models.find(m => m.name === model)!
    }

    /**
     * Derives the relation type, relation direction, and constraints from the field
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
     *  ~ We'll fill the pool with ids of this model (a parent model) or create nodes
     *    if the relation is required in both directions.
     * 4. many-to-many
     *  ~ A particular instance can have 0 to infinite connections (we'll use min/max spec).
     *  ~ We'll use `relationTo` to determine whether this is a parent or child model and
     *    create nodes accordingly.
     *
     * We presume that the field is a relation.
     */
    function getRelationType(
      dmmfModels: DMMF.Model[],
      seedModels: SeedModels,
      field: DMMF.Field,
      fieldModel: DMMF.Model,
      definition: SeedModelFieldRelationConstraint,
    ): {
      type: RelationType
      min: number
      max: number
      relationTo: string
      backRelationField: DMMF.Field
    } {
      /**
       * model A {
       *  field: Relation
       * }
       */
      /* Field definitions */
      const fieldSeedModel = getSeedModel(seedModels, fieldModel.name)

      /**
       * Relation definitions
       *
       * NOTE: relaitonField is a back reference to the examined model.
       */
      const relationModel = getDMMFModel(dmmfModels, field.type)
      const backRelationField = relationModel.fields.find(
        f => f.type === fieldModel.name,
      )!
      const relationSeedModel = getSeedModel(seedModels, field.type)

      /* Relation type definitions */
      if (field.isList && backRelationField.isList) {
        /**
         * many-to-many (A)
         *
         * model A {
         *  bs: B[]
         * }
         * model B {
         *  as: A[]
         * }
         */
        const min = withDefault(0, definition.min)
        const max = withDefault(min, definition.max)

        /* Validation */

        if (min > max) {
          /* istanbul ignore next */ /* Inconsistent mock definition. */

          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name}: number of minimum instances is higher than maximum.
            `,
          )
        } else if (max > relationSeedModel.amount) {
          /* istanbul ignore next */ /* Missing relation instances */
          const missingInstances = max - relationSeedModel.amount
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name} requests more(${max}) instances of | ${relationModel.name}(${relationSeedModel.amount}) than available.
            | Please add more(${missingInstances}) ${relationModel.name} instances.
            `,
          )
        } else {
          /* Valid declaration */
          return {
            type: 'many-to-many',
            min: min,
            max: max,
            relationTo: getRelationDirection(
              'many-to-many',
              field,
              backRelationField,
            ),
            backRelationField: backRelationField,
          }
        }
      } else if (!field.isList && backRelationField.isList) {
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
          min: field.isRequired ? 1 : withDefault(0, definition.min),
          max: 1,
          relationTo: getRelationDirection(
            'many-to-1',
            field,
            backRelationField,
          ),
          backRelationField: backRelationField,
        }
      } else if (field.isList && !backRelationField.isList) {
        /**
         * 1-to-many (A)
         *
         * model A {
         *  bs: b[]
         * }
         *
         * model B {
         *  a: A
         * }
         */

        const min = withDefault(field.isRequired ? 1 : 0, definition.min)
        const max = withDefault(min, definition.max)

        /* Validation */

        if (min > max) {
          /* istanbul ignore next */ /* Inconsistent mock definition. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name}: number of minimum instances is higher than maximum.
            `,
          )
        } else if (max > relationSeedModel.amount) {
          /* istanbul ignore next */ /* Missing relation instances */
          const missingInstances = max - relationSeedModel.amount
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name} requests more (${max}) instances of ${relationModel.name}(${relationSeedModel.amount}) than available.
            | Please add more (${missingInstances}) ${relationModel.name} instances.
            `,
          )
        } else {
          /* Valid declaration */
          return {
            type: '1-to-many',
            min: min,
            max: max,
            relationTo: getRelationDirection(
              '1-to-many',
              field,
              backRelationField,
            ),
            backRelationField: backRelationField,
          }
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

        /* Validation */

        if (
          field.isRequired &&
          backRelationField.isRequired &&
          fieldSeedModel.amount !== relationSeedModel.amount
        ) {
          /* Required 1-to-1 relation unit amount mismatch. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | A 1-to-1 required relation ${fieldModel.name}.${field.name}-${relationModel.name} has different number of units assigned.
            | Please make sure that number of ${fieldModel.name} and ${relationModel.name} match.
            `,
          )
        } else if (
          !field.isRequired &&
          backRelationField.isRequired &&
          fieldSeedModel.amount < relationSeedModel.amount
        ) {
          /* An optional 1-to-1 relation inadequate unit amount. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | A 1-to-1 relation ${relationModel.name} needs at least ${relationSeedModel.amount} ${fieldModel.name} units, but only ${fieldSeedModel.amount} were provided.
            | Please make sure there's an adequate amount of resources available.
            `,
          )
        } else {
          /* Sufficient amounts. */
          return {
            type: '1-to-1',
            min: field.isRequired ? 1 : withDefault(0, definition.min),
            max: 1,
            relationTo: getRelationDirection(
              '1-to-1',
              field,
              backRelationField,
            ),
            backRelationField: backRelationField,
          }
        }
      }
    }

    /**
     * Determines relation direction based on the type of fields
     * connecting the two types together.
     *
     * `relation direction` tells which of the two models should be created first.
     */
    function getRelationDirection(
      relationType: RelationType,
      field: DMMF.Field,
      backRelationField: DMMF.Field,
    ): string {
      switch (relationType) {
        /**
         * NOTE: field and backRelationField might seem inverted here.
         *      The trick is that to get the right type we have to examine
         *      back relation to get the current type, and vice versa.
         */
        case '1-to-1': {
          if (field.isRequired && backRelationField.isRequired) {
            /**
             * model A {
             *  b: B
             * }
             * model B {
             *  a: A
             * }
             *
             * -> Create B while creating A, the order doesn't matter.
             */
            return _.head([field.type, backRelationField.type].sort())!
          } else if (!field.isRequired && backRelationField.isRequired) {
            /**
             * model A {
             *  b: B?
             * }
             * model B {
             *  a: A
             * }
             *
             * We should create A first, and connect B with A once we create B.
             */
            return backRelationField.type
          } else if (field.isRequired && !backRelationField.isRequired) {
            /**
             * model A {
             *  b: B
             * }
             * model B {
             *  a: A?
             * }
             *
             * We should create B first.
             */
            return field.type
          } else {
            /**
             * model A {
             *  b: B?
             * }
             * model B {
             *  a: A?
             * }
             *
             * -> The order doesn't matter just be consistent.
             */
            return _.head([field.type, backRelationField.type].sort())!
          }
        }
        case '1-to-many': {
          /**
           * Fields are expected to be lists - not required.
           */
          if (!field.isRequired && backRelationField.isRequired) {
            /**
             * model A {
             *  b: B[]
             * }
             * model B {
             *  a: A
             * }
             *
             * -> We should create A and connect Bs to it later.
             */
            return backRelationField.type
          } else if (!field.isRequired && !backRelationField.isRequired) {
            /**
             * model A {
             *  b: B[]
             * }
             * model B {
             *  a: A?
             * }
             *
             * -> We should create B first.
             */
            return field.type
          } else {
            throw new Error('Someting unexpected happened!')
          }
        }
        case 'many-to-1': {
          /**
           * Back relations are expected to be lists - not required.
           */
          if (field.isRequired && !backRelationField.isRequired) {
            /**
             * model A {
             *  b: B
             * }
             * model B {
             *  a: A[]
             * }
             *
             * -> We should create B and connect As to it.
             */
            return field.type
          } else if (!field.isRequired && !backRelationField.isRequired) {
            /**
             * model A {
             *  b: B?
             * }
             * model B {
             *  a: A[]
             * }
             *
             * -> We should create A(s) first and then connect B with them.
             */
            return backRelationField.type
          } else {
            throw new Error('Someting unexpected happened!')
          }
        }
        case 'many-to-many': {
          /**
           * model A {
           *  b: B[]
           * }
           * model B {
           *  a: A[]
           * }
           *
           * -> The order doesn't matter, just be consistent.
           */
          return _.head([field.type, backRelationField.type].sort())!
        }
      }
    }
  }

  /**
   * Coverts orders to steps. Steps represent an ordered entity that specifies the creation
   * of a virtual data.
   *
   * Creates a pool of available instances and validates relation constraints. Using
   * `isOrderWellDefined` and `getStepsFromOrder` functions, you should be able to implement
   * the topological sort algorithm.
   *
   * @param orders
   */
  function getStepsFromOrders(orders: Order[]): Step[] {
    type Pool = Dictionary<{
      model: DMMF.Model
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
          /* istanbul ignore else */
          if (isOrderWellDefinedInPool(pool, o)) {
            const [steps] = getStepsFromOrder(allOrders, sortedSteps, pool, o)

            return steps
          } else {
            /**
             * Since this is the last order, we cannot obtain any new resources,
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
          relation.relationTo === order.model.name,
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

    const tasksWithCorrectOrder = _.sortBy(tasks, t => t.order).map(
      (task, i) => ({
        ...task,
        order: i,
      }),
    )

    return tasksWithCorrectOrder
  }

  /**
   * Converts tasks to fixtures by creating a pool of available instances
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
  async function seedTasks<Client extends PrismaClientType>(
    client: Client,
    faker: Chance.Chance,
    seedModels: SeedModels,
    tasks: Task[],
  ): Promise<Fixture[]> {
    /**
     * Pool describes the resources made available by a parent type to its children.
     */
    type Pool = Dictionary<{ [child: string]: ID[] }>

    const initialPool: Pool = {}

    const { fixtures } = await iterate(
      _.sortBy(tasks, t => t.order),
      initialPool,
    )

    return fixtures

    /**
     * Iteration represents a single seed exeuction cycle.
     */
    type Iteration = {
      fixtures: Fixture[]
      pool: Pool
    }

    /**
     * Recursively seeds tasks to database.
     */
    async function iterate(
      [currentTask, ...remainingTasks]: Task[],
      availablePool: Pool,
      iteration: number = 0,
    ): Promise<Iteration> {
      /* Edge case */
      if (currentTask === undefined) {
        return {
          fixtures: [],
          pool: availablePool,
        }
      }

      debugger

      /* Recursive step */
      /* Fixture calculation */
      // const id = getFixtureId(task, remainingTasks.length)
      const { data, pool: newPool, tasks: newTasks } = getMockForTask(
        availablePool,
        remainingTasks,
        currentTask,
      )

      debugger

      /**
       * Load the data to database.
       */
      const seed = await client[currentTask.mapping.model.toLowerCase()].create(
        {
          data,
        },
      )

      debugger

      const fixture: Fixture = {
        seed: seed,
        model: currentTask.model,
        mapping: currentTask.mapping,
        data: data,
        relations: currentTask.relations,
      }

      /**
       * Save the id to the pool by figuring out which fields are parents and which are children.
       */

      const poolWithTask = insertTaskIntoPool(seed.id, currentTask, newPool)

      debugger

      console.log(poolWithTask)

      /* Recurse */
      const recursed = await iterate(newTasks, poolWithTask, iteration + 1)

      return {
        fixtures: [fixture, ...recursed.fixtures],
        pool: recursed.pool,
      }
    }

    type Mock = {
      pool: Pool
      tasks: Task[]
      data: FixtureData
    }

    /**
     * Generates mock data from the provided model. Scalars return a mock scalar or
     * list of mock scalars, relations return an ID or lists of IDs.
     *
     * Generates mock data for scalars and relations, but skips id fields with default setting.
     */
    function getMockForTask(
      availablePool: Pool,
      otherTasks: Task[],
      task: Task,
    ): Mock {
      const initialMock: Mock = {
        pool: availablePool,
        tasks: otherTasks,
        data: {},
      }

      return task.model.fields
        .filter(
          field =>
            /* ID field shouldn't have a default setting. */
            !(field.isId && field.default !== undefined),
        )
        .reduce<Mock>(getMockDataForField, initialMock)

      function getMockDataForField(
        { pool, tasks, data }: Mock,
        field: DMMF.Field,
      ): Mock {
        const fieldModel = task.model

        /* Custom field mocks */

        if (
          seedModels[task.model.name] &&
          seedModels[task.model.name]!.factory
        ) {
          const mock = seedModels[task.model.name]!.factory![field.name]
          switch (typeof mock) {
            case 'function': {
              /* Custom function */
              const value = mock.call(faker)
              return {
                pool,
                tasks,
                data: { ...data, [field.name]: value },
              }
            }
            case 'object': {
              /* Relation constraint */
              break
            }
            case 'bigint':
            case 'boolean':
            case 'number':
            case 'string': {
              /* A constant value. */
              const value = mock
              return {
                pool,
                tasks,
                data: { ...data, [field.name]: value },
              }
            }
            case 'symbol':
            case 'undefined': {
              /* Skipped definitions */
              break
            }
            default: {
              throw new Error(`Unsupported type of mock "${typeof mock}".`)
            }
          }
        }

        /* ID field */

        if (field.isId) {
          switch (field.type) {
            case Scalar.string: {
              /* GUID id for strings */
              return {
                pool,
                tasks,
                data: { ...data, [field.name]: faker.guid() },
              }
            }
            case Scalar.int: {
              /* Autoincrement based on task order. */
              return {
                pool,
                tasks,
                data: { ...data, [field.name]: task.order },
              }
            }
            default: {
              throw new Error(`Unsupported ID type "${field.type}"`)
            }
          }
        }

        /* Scalar and relation field mocks */

        switch (field.kind) {
          case 'scalar': {
            switch (field.type) {
              /**
               * Scalars
               */
              case Scalar.string: {
                const string = faker.word()
                return {
                  pool,
                  tasks,
                  data: { ...data, [field.name]: string },
                }
              }
              case Scalar.int: {
                const number = faker.integer({
                  min: -2147483647,
                  max: 2147483647,
                })
                return {
                  pool,
                  tasks,
                  data: { ...data, [field.name]: number },
                }
              }
              case Scalar.float: {
                const float = faker.floating()

                return {
                  pool,
                  tasks,
                  data: { ...data, [field.name]: float },
                }
              }
              case Scalar.date: {
                const date = faker.date().toISOString()

                return {
                  pool,
                  tasks,
                  data: { ...data, [field.name]: date },
                }
              }
              case Scalar.bool: {
                const boolean = faker.bool()
                return {
                  pool,
                  tasks,
                  data: { ...data, [field.name]: boolean },
                }
              }
              /* Unsupported scalar */
              default: {
                throw new Error(
                  `Unsupported scalar field of type ${field.type}`,
                )
              }
            }
          }
          /**
           * Relations
           */
          case 'object': {
            /* Resources calculation */
            const relation = task.relations[field.name]

            switch (relation.type) {
              case '1-to-1': {
                /**
                 * model A {
                 *  b: B
                 * }
                 * model B {
                 *  a: A
                 * }
                 *
                 * 1-to-1 relation should take at most one id from the resource pool
                 * and submit no new ids. Because we already manage constraints during
                 * order creation step, we can ignore it now.
                 */
                if (
                  relation.relationTo === fieldModel.name &&
                  !relation.field.isRequired
                ) {
                  /* Will insert the ID of an instance into the pool. */
                  return { pool, tasks, data }
                } else if (
                  relation.relationTo === fieldModel.name &&
                  relation.field.isRequired
                ) {
                  /* Creates the instances while creating itself. */
                  const {
                    tasks: newTasks,
                    pool: newPool,
                    data: instance,
                  } = getMockOfModel(tasks, pool, relation.field.type)

                  return {
                    pool: newPool,
                    tasks: newTasks,
                    data: {
                      ...data,
                      [field.name]: {
                        create: instance,
                      },
                    },
                  }
                } else if (
                  !(relation.relationTo === fieldModel.name) &&
                  !relation.backRelationField.isRequired
                ) {
                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  /* Create an instance and connect it to the relation. */
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
                      return { pool: newPool, tasks, data }
                    }
                    case 1: {
                      const [id] = ids
                      return {
                        pool: newPool,
                        tasks,
                        data: {
                          ...data,
                          [field.name]: {
                            connect: { id: id! },
                          },
                        },
                      }
                    }
                    /* istanbul ignore next */
                    default: {
                      throw new Error(`Something truly unexpected happened.`)
                    }
                  }
                } else {
                  /* Is created by the parent. */
                  return { pool, tasks, data }
                }
              }
              case '1-to-many': {
                /**
                 * model A {
                 *  bs: B[]
                 * }
                 * model B {
                 *  a: A
                 * }
                 *
                 * 1-to-many creates the model instance and makes its ID available for later connections.
                 */
                if (relation.relationTo === fieldModel.name) {
                  /* Create the relation while creating this model instance. */
                  return { pool, tasks, data }
                } else {
                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  /* Create this instance and connect to others. */
                  const [newPool, ids] = getIDInstancesFromPool(
                    pool,
                    fieldModel.name,
                    field.type,
                    units,
                  )

                  const connections = ids.map<{ id: ID }>(id => ({ id }))

                  return {
                    pool: newPool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        connect: connections,
                      },
                    },
                  }
                }
              }
              case 'many-to-1': {
                /**
                 * model A {
                 *  b: B
                 * }
                 * model B {
                 *  a: A[]
                 * }
                 *
                 * Many-to-1 relations either create an instance and make it available for later use,
                 * or connect to existing instance.
                 */
                if (relation.relationTo === fieldModel.name) {
                  /* Insert IDs of model instance into the pool. */

                  return { pool, tasks, data }
                } else {
                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  /* Create this instance and connects it. */
                  const [newPool, [id]] = getIDInstancesFromPool(
                    pool,
                    fieldModel.name,
                    field.type,
                    units,
                  )

                  if (!id && relation.field.isRequired) {
                    throw new Error(
                      `Missing data for required relation: ${relation.field.relationName}`,
                    )
                  }

                  if (!id && !relation.field.isRequired) {
                    return { pool: newPool, tasks, data }
                  }

                  return {
                    pool: newPool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        connect: { id },
                      },
                    },
                  }
                }
              }
              case 'many-to-many': {
                /**
                 * model A {
                 *  bs: B[]
                 * }
                 * model B {
                 *  as: A[]
                 * }
                 *
                 * Many-to-many relationships simply have to follow consistency. They can either
                 * create ID instances in the pool or connect to them.
                 */
                if (relation.relationTo === fieldModel.name) {
                  /* Insert IDs of this instance to the pool. */

                  return { pool, tasks, data }
                } else {
                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  /* Create instances and connect to relation instances. */
                  const [newPool, ids] = getIDInstancesFromPool(
                    pool,
                    fieldModel.name,
                    field.type,
                    units,
                  )

                  const connections = ids.map<{ id: ID }>(id => ({ id }))

                  return {
                    pool: newPool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        connect: connections,
                      },
                    },
                  }
                }
              }
              /* end of relation kind switches */
            }
          }
          case 'enum': {
            throw new Error(
              `Enums are currently not supported as autogenerated mocks.`,
            )
          }
          /**
           * Default field type fallback.
           */
          default: {
            /* istanbul ignore next */
            throw new Error(
              /* prettier-ignore */
              mls`
                  | Unsupported field type "${field.type}".
                  | Please use a custom mock function or change your model definition.
                  `,
            )
          }
        }
      }
    }

    /**
     * Recursively retrives n unique ids and removes them from the pool.
     */
    function getIDInstancesFromPool(
      pool: Pool,
      parent: string,
      child: string,
      n: number,
      /* Internals */
      _ids: ID[] = [],
    ): [Pool, ID[]] {
      switch (n) {
        case 0: {
          return [pool, []]
        }
        default: {
          const [id, ...remainingIds] = _.get(pool, [parent, child], [])

          /* Makes sure that ids are unique */
          if (_ids.includes(id)) {
            /* istanbul ignore next */
            if (n > remainingIds.length) {
              throw new Error(`Requesting more ids than available.`)
            }

            return getIDInstancesFromPool(pool, parent, child, n, _ids)
          } else {
            const poolWithoutId = _.set(pool, [parent, child], remainingIds)
            const [newPool, ids] = getIDInstancesFromPool(
              poolWithoutId,
              parent,
              child,
              n - 1,
              _ids.concat(id),
            )
            return [newPool, [id, ...ids]]
          }
        }
      }
    }

    /**
     * Inserts n-replications of ID into the pool and returns the new pool.
     */
    function insertIDInstancesIntoPool(
      pool: Pool,
      parent: string,
      child: string,
      id: ID,
      n: number,
    ): Pool {
      const ids = _.get(pool, [parent, child], [])
      return _.set(pool, [parent, child], [...ids, ...Array(n).fill(id)])
    }

    /**
     * Inserts an id of a task into all parent fields it covers.
     *
     * @param id
     * @param task
     * @param pool
     */
    function insertTaskIntoPool(id: ID, task: Task, initialPool: Pool): Pool {
      return task.model.fields
        .filter(
          field => field.kind === 'object',
          /* Should either be an idField or a singular field definition. */
          // task.model.idFields.includes(field.name) || field.isId,
        )
        .reduce<Pool>(insertFieldIntoPool, initialPool)

      function insertFieldIntoPool(pool: Pool, field: DMMF.Field): Pool {
        const fieldModel = task.model

        switch (field.kind) {
          /**
           * Scalars, Enums
           */
          case 'scalar':
          case 'enum': {
            return pool
          }
          /**
           * Relations
           */
          case 'object': {
            /* Resources calculation */
            const relation = task.relations[field.name]

            switch (relation.type) {
              case '1-to-1': {
                /**
                 * model A {
                 *  b: B
                 * }
                 * model B {
                 *  a: A
                 * }
                 *
                 * 1-to-1 relation should take at most one id from the resource pool
                 * and submit no new ids. Because we already manage constraints during
                 * order creation step, we can ignore it now.
                 */
                if (
                  relation.relationTo === fieldModel.name &&
                  !relation.field.isRequired
                ) {
                  /* Insert the ID of an instance into the pool. */
                  const newPool = insertIDInstancesIntoPool(
                    pool,
                    field.type,
                    fieldModel.name,
                    id,
                    1,
                  )

                  return newPool
                } else {
                  /* Relation doesn't create any child properties. */
                  return pool
                }
              }
              case '1-to-many': {
                /**
                 * model A {
                 *  bs: B[]
                 * }
                 * model B {
                 *  a: A
                 * }
                 *
                 * 1-to-many creates the model instance and makes its ID available for later connections.
                 */
                if (relation.relationTo === fieldModel.name) {
                  /* Create the relation while creating this model instance. */

                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  const newPool = insertIDInstancesIntoPool(
                    pool,
                    field.type,
                    fieldModel.name,
                    id,
                    units,
                  )

                  return newPool
                } else {
                  return pool
                }
              }
              case 'many-to-1': {
                /**
                 * model A {
                 *  b: B
                 * }
                 * model B {
                 *  a: A[]
                 * }
                 *
                 * Many-to-1 relations either create an instance and make it available for later use,
                 * or connect to existing instance.
                 */
                if (relation.relationTo === fieldModel.name) {
                  /* Insert IDs of model instance into the pool. */

                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  const newPool = insertIDInstancesIntoPool(
                    pool,
                    field.type,
                    fieldModel.name,
                    id,
                    units,
                  )

                  return newPool
                } else {
                  return pool
                }
              }
              case 'many-to-many': {
                /**
                 * model A {
                 *  bs: B[]
                 * }
                 * model B {
                 *  as: A[]
                 * }
                 *
                 * Many-to-many relationships simply have to follow consistency. They can either
                 * create ID instances in the pool or connect to them.
                 */
                if (relation.relationTo === fieldModel.name) {
                  /* Insert IDs of this instance to the pool. */

                  const units = faker.integer({
                    min: relation.min,
                    max: relation.max,
                  })

                  const newPool = insertIDInstancesIntoPool(
                    pool,
                    field.type,
                    fieldModel.name,
                    id,
                    units,
                  )

                  return newPool
                } else {
                  return pool
                }
              }
              /* end of relation kind switches */
            }
          }
        }
      }
    }

    /**
     * Creates instances of a requested relation and drains the remaining tasks.
     */
    function getMockOfModel(
      tasks: Task[],
      availablePool: Pool,
      model: string,
    ): Mock {
      /* Find the requested tasks. */
      const mockTask = tasks.find(task => task.model.name === model)

      /* Validation check, though it should never trigger */
      /* istanbul ignore next */
      if (mockTask === undefined) {
        throw new Error('Something very unexpected occured.')
      }

      const remainingTasks = tasks.filter(task => task.order !== mockTask.order)

      return getMockForTask(availablePool, remainingTasks, mockTask)
    }
  }
}
