import { DMMF } from '@prisma/client/runtime'
import Chance from 'chance'
import _, { Dictionary } from 'lodash'
import mls from 'multilines'

import { Scalar } from './scalars'
import {
  SeedKit,
  SeedModels,
  SeedOptions,
  SeedModelFieldDefinition,
  SeedModelFieldRelationConstraint,
  SeedFunction,
  PrismaClientType,
  SeedModelScalarListDefinition,
} from './types'
import { withDefault, not, filterKeys, mapEntries } from './utils'

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
      ...options,
    }

    const faker = new Chance(opts.seed)

    const kit: SeedKit = {
      faker,
    }
    const models: SeedModels = options.models
      ? options.models(kit)
      : {
          '*': {
            amount: 5,
          },
        }

    /* Fixture calculations */

    const orders: Order[] = getOrdersFromDMMF(dmmf, models)
    const steps: Step[] = getStepsFromOrders(orders)
    const tasks: Task[] = getTasksFromSteps(steps)

    /* Creates mock data and pushes it to Prisma */

    const fixtures: Fixture[] = await seedTasks(
      options.client,
      faker,
      models,
      orders,
      tasks,
    )

    return groupFixtures(fixtures)
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
    enums: Dictionary<DMMF.Enum>
  }

  type RelationType = '1-to-1' | '1-to-many' | 'many-to-1' | 'many-to-many'
  type RelationDirection = { optional: boolean; from: string }
  type Relation = {
    type: RelationType
    direction: RelationDirection
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
    amount: number // number of instances created in this step
    model: DMMF.Model
    mapping: DMMF.Mapping
    relations: Dictionary<Relation>
    enums: Dictionary<DMMF.Enum>
  }

  type Task = {
    order: number // the creation order of a step, starts with 0
    model: DMMF.Model
    mapping: DMMF.Mapping
    relations: Dictionary<Relation>
    enums: Dictionary<DMMF.Enum>
  }

  /**
   * ID field packs the id itself and the id field name.
   * Examples:
   *  - { id: 1 }
   *  - { ArtistId: "uniqueid" }
   */
  type ID = Dictionary<string | number>
  type Scalar = string | number | boolean | Date

  type FixtureData = Dictionary<
    | Scalar
    | { set: Scalar[] }
    | { connect: ID }
    | { connect: ID[] }
    | { create: FixtureData }
  >

  /**
   * Represents the virtual unit.
   */
  type Fixture = {
    model: DMMF.Model
    seed: any
    relations: Dictionary<Relation>
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
            {},
          ) as object

          switch (typeof seedModelField) {
            case 'object': {
              /* Calculate the relation properties */

              return {
                ...acc,
                [field.name]: getRelationType(
                  dmmf.datamodel.models,
                  seedModels,
                  field,
                  model,
                  seedModelField,
                ),
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

      const enums: Order['enums'] = model.fields
        .filter(field => field.kind === 'enum')
        .reduce((acc, field) => {
          const enume = dmmf.datamodel.enums.find(
            enume => enume.name === field.type,
          )

          if (enume === undefined) {
            throw new Error(
              `Couldn't find enumerator declaration for ${field.type}`,
            )
          }

          return {
            ...acc,
            [field.name]: enume,
          }
        }, {})

      return {
        model: model,
        mapping: mapping,
        amount: fakerModel.amount,
        relations: relations,
        enums: enums,
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
    ): Relation {
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
        f => f.relationName === field.relationName,
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
            direction: getRelationDirection(field, backRelationField),
            field,
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
        if (
          field.isRequired &&
          relationSeedModel.amount < fieldSeedModel.amount
        ) {
          const missingInstances =
            fieldSeedModel.amount - relationSeedModel.amount
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name} requests more (${fieldSeedModel.amount}) instances of ${relationModel.name}(${relationSeedModel.amount}) than available.
            | Please add ${missingInstances} more ${relationModel.name} instances.
            `,
          )
        }

        const min = field.isRequired ? 1 : withDefault(0, definition.min)

        return {
          type: 'many-to-1',
          min: min,
          max: 1,
          direction: getRelationDirection(field, backRelationField),
          field,
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

        /**
         * TODO: This is not completely accurate, because there
         * could be more of this type than of backRelation, and this
         * setup doesn't allow for that.
         *
         * TODO: Intellisense: if back relation field required min should be at least 1.
         */
        // const min = backRelationField.isRequired
        //   ? 1
        //   : withDefault(0, definition.min)

        const min = withDefault(0, definition.min)
        const max = withDefault(fieldSeedModel.amount, definition.max)

        /* Validation */

        if (min > max) {
          /* istanbul ignore next */ /* Inconsistent mock definition. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name}: number of minimum instances is higher than maximum.
            `,
          )
        }
        // else if (max > relationSeedModel.amount) {
        //   /* istanbul ignore next */ /* Missing relation instances */
        //   const missingInstances = max - relationSeedModel.amount
        //   throw new Error(
        //     /* prettier-ignore */
        //     mls`
        //     | ${fieldModel.name}.${field.name} requests more (${max}) instances of ${relationModel.name}(${relationSeedModel.amount}) than available.
        //     | Please add more (${missingInstances}) ${relationModel.name} instances.
        //     `,
        //   )
        // }
        if (min * fieldSeedModel.amount > relationSeedModel.amount) {
          const missingInstances =
            min * fieldSeedModel.amount - relationSeedModel.amount
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name} requests more (${min * fieldSeedModel.amount}) instances of ${relationModel.name}(${relationSeedModel.amount}) than available.
            | Please add ${missingInstances} more ${relationModel.name} instances.
            `,
          )
        }

        /* Valid declaration */
        return {
          type: '1-to-many',
          min: min,
          max: max,
          direction: getRelationDirection(field, backRelationField),
          field,
          backRelationField: backRelationField,
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
            direction: getRelationDirection(field, backRelationField),
            field,
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
      field: DMMF.Field,
      backRelationField: DMMF.Field,
    ): RelationDirection {
      /* Model of the observed type. */

      const fieldModel = backRelationField.type
      const relationModel = field.type

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

        return {
          optional: true,
          from: _.head([fieldModel, relationModel].sort())!,
        }
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
        return {
          optional: false,
          from: relationModel,
        }
      } else if (field.isRequired && backRelationField.isList) {
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
        return {
          optional: false,
          from: relationModel,
        }
      } else if (field.isList && backRelationField.isRequired) {
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
        return {
          optional: false,
          from: fieldModel,
        }
      } else if (field.isList && !backRelationField.isRequired) {
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
        return {
          optional: true,
          from: _.head([fieldModel, relationModel].sort())!,
        }
      } else if (field.isList && backRelationField.isList) {
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
        return {
          optional: true,
          from: _.head([fieldModel, relationModel].sort())!,
        }
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
        return {
          optional: false,
          from: fieldModel,
        }
      } else if (!field.isRequired && !backRelationField.isRequired) {
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
        return {
          optional: true,
          from: _.head([fieldModel, relationModel].sort())!,
        }
      } else if (!field.isRequired && backRelationField.isList) {
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
        return {
          optional: true,
          from: _.head([fieldModel, relationModel].sort())!,
        }
      } else {
        throw new Error(`Uncovered relation type.`)
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
   * This function assumes that the graph is acylic.
   *
   * @param orders
   */
  function getStepsFromOrders(orders: Order[]): Step[] {
    type Pool = Dictionary<DMMF.Model>

    let graph: Order[] = orders.filter(not(isLeafOrder))
    let pool: Pool = {} // edges
    let sortedSteps: Step[] = [] // L
    let leafs: Order[] = orders.filter(isLeafOrder) // S

    while (leafs.length !== 0) {
      const leaf = leafs.shift()! // n
      const { pool: poolWithLeaf, step: leafStep } = insertOrderIntoPool(
        sortedSteps.length,
        pool,
        leaf,
      )

      pool = poolWithLeaf
      sortedSteps.push(leafStep)

      for (const order of graph) {
        if (isOrderWellDefinedInPool(pool, order)) {
          /* Remove the edge from the graph. */
          graph = graph.filter(({ model }) => model.name !== order.model.name)
          /* Update the leafs list. */
          leafs.push(order)
        }
      }
    }

    if (graph.length !== 0) {
      throw new Error(`${graph.map(o => o.model.name).join(', ')} have cycles!`)
    }

    return sortedSteps

    /* Helper functions */

    /**
     * Determines whether we can already process the order based on the pool
     * capacity.
     *
     * This function in combination with `getStepsFromOrder` should give you
     * all you need to implement meaningful topological sort on steps.
     */
    function isOrderWellDefinedInPool(pool: Pool, order: Order): boolean {
      return Object.values(order.relations).every(
        relation =>
          pool.hasOwnProperty(relation.field.type) ||
          relation.direction.from === order.model.name ||
          relation.direction.optional,
      )
    }

    /**
     * Tells whether the order has outgoing relations.
     *
     * @param order
     */
    function isLeafOrder(order: Order): boolean {
      return Object.values(order.relations).every(
        relation =>
          relation.direction.from === order.model.name ||
          relation.direction.optional,
      )
    }

    /**
     * Converts a well defined order to a step and adds it to the pool.
     *
     * This function in combination with `isOrderWellDefinedInPool` should give
     * you everything you need to implement meaningful topological sort on steps.
     */
    function insertOrderIntoPool(
      ordinal: number,
      pool: Pool,
      order: Order,
    ): {
      step: Step
      pool: Pool
    } {
      /**
       * Fix optional relations' direction.
       */
      const fixedRelations = mapEntries(order.relations, relation => {
        if (!relation.direction.optional) return relation

        return {
          ...relation,
          direction: {
            optional: false,
            /**
             * If pool already includes the model of the relation,
             * make the foreign relation first and create this model
             * afterwards.
             */
            from: pool.hasOwnProperty(relation.field.type)
              ? /* back relation model */ relation.field.type
              : /* this model */ relation.backRelationField.type,
          },
        }
      })

      /**
       * A step unit derived from the order.
       */
      const step: Step = {
        order: ordinal,
        amount: order.amount,
        model: order.model,
        mapping: order.mapping,
        relations: fixedRelations,
        enums: order.enums,
      }

      /**
       * Assumes that there cannot exist two models with the same name.
       */
      const newPool: Pool = {
        ...pool,
        [order.model.name]: order.model,
      }

      return {
        step,
        pool: newPool,
      }
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
        enums: step.enums,
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
    orders: Order[],
    tasks: Task[],
  ): Promise<Fixture[]> {
    /**
     * Pool describes the resources made available by a parent type to its children.
     */
    type Pool = Dictionary<{
      [child: string]: ID[]
    }>

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

      /* Recursive step */
      /* Fixture calculation */
      const { data, pool: newPool, tasks: newTasks, include } = getMockForTask(
        availablePool,
        remainingTasks,
        currentTask,
      )

      const methodName = _.lowerFirst(currentTask.mapping.model)
      /**
       * Make sure that client packs everyting.
       */
      if (!client[methodName]) {
        throw new Error(
          `Client is missing method for ${currentTask.model.name} (methodName = ${methodName}, mappingModel = ${currentTask.mapping.model})`,
        )
      }

      /**
       * Load the data to database.
       */
      const seed = await client[methodName].create({
        data,
        // TODO: include statement should possibly be empty
        ...(Object.keys(include).length
          ? {
              include,
            }
          : {}),
      })

      const fixture: Fixture = {
        model: currentTask.model,
        seed: seed,
        relations: currentTask.relations,
      }

      /**
       * Save the id to the pool by figuring out which fields are parents and which are children.
       */

      const poolWithFixture = insertFixtureIntoPool(fixture, newPool, orders)

      /* Recurse */
      const recursed = await iterate(newTasks, poolWithFixture, iteration + 1)

      return {
        fixtures: [fixture, ...recursed.fixtures],
        pool: recursed.pool,
      }
    }

    type Mock = {
      pool: Pool
      tasks: Task[]
      data: FixtureData
      include: {
        [field: string]: true | { include: Mock['include'] }
      }
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
        include: {},
      }

      return task.model.fields
        .filter(
          field =>
            /* ID fields with default shouldn't have a generated id. */
            !(field.isId && field.hasDefaultValue !== undefined),
        )
        .reduce<Mock>(getMockDataForField, initialMock)

      function getMockDataForField(
        { pool, tasks, data, include }: Mock,
        field: DMMF.Field,
      ): Mock {
        const fieldModel = task.model

        /* Custom field mocks */

        if (seedModels[task.model.name]?.factory) {
          const mock = seedModels[task.model.name]!.factory![field.name]
          switch (typeof mock) {
            case 'function': {
              /* Custom function */
              if (field.isList) {
                const values = (mock as () => SeedModelFieldDefinition[]).call(
                  faker,
                )
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: { set: values },
                  },
                  include,
                }
              } else {
                const value = (mock as () => SeedModelFieldDefinition).call(
                  faker,
                )
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: value,
                  },
                  include,
                }
              }
            }
            case 'object': {
              /* Relation or scalar list */
              if (field.isList) {
                /* Scalar list */
                const values = mock as SeedModelFieldDefinition[]
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: { set: values },
                  },
                  include,
                }
              } else {
                /* Relation */
                break
              }
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
                data: {
                  ...data,
                  [field.name]: value,
                },
                include,
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

        if (field.isId || fieldModel.idFields.includes(field.name)) {
          switch (field.type) {
            case Scalar.string: {
              /* GUID id for strings */
              return {
                pool,
                tasks,
                data: {
                  ...data,
                  [field.name]: faker.guid(),
                },
                include,
              }
            }
            case Scalar.int: {
              /* Autoincrement based on task order. */
              return {
                pool,
                tasks,
                data: {
                  ...data,
                  [field.name]: task.order,
                },
                include,
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
            /**
             * List scalar mocks.
             *
             * We provide good default mocks for functions. Anything more complex
             * or flexible can be achieved using the exposed Chance.js library.
             */
            if (field.isList) {
              switch (field.type) {
                /**
                 * Scalars
                 */
                case Scalar.string: {
                  const strings = faker.n(faker.string, 3)

                  return {
                    pool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        set: strings,
                      },
                    },
                    include,
                  }
                }
                case Scalar.int: {
                  const numbers = faker.n(faker.integer, 3, {
                    min: -2000,
                    max: 2000,
                  })

                  return {
                    pool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: { set: numbers },
                    },
                    include,
                  }
                }
                case Scalar.float: {
                  const floats = faker.n(faker.floating, 3, {
                    min: -1000,
                    max: 1000,
                    fixed: 2,
                  })

                  return {
                    pool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: { set: floats },
                    },
                    include,
                  }
                }
                case Scalar.date: {
                  const dates = faker.n(() => {
                    return faker.date({
                      min: new Date(Date.UTC(1970, 0, 1)),
                      max: new Date(Date.UTC(2038, 1, 19)),
                    })
                  }, 3)

                  return {
                    pool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: { set: dates },
                    },
                    include,
                  }
                }
                case Scalar.bool: {
                  const booleans = faker.n(faker.bool, 3)

                  return {
                    pool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: { set: booleans },
                    },
                    include,
                  }
                }
                /* Unsupported scalar */
                default: {
                  throw new Error(
                    `Unsupported scalar field ${task.model.name}${field.name} of type ${field.type}`,
                  )
                }
              }
            }

            /**
             * Scalar mocks.
             */

            switch (field.type) {
              /**
               * Scalars
               */
              case Scalar.json: {
                const json = JSON.stringify({
                  name: faker.word(),
                })
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: json,
                  },
                  include,
                }
              }
              case Scalar.string: {
                const string = faker.word()
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: string,
                  },
                  include,
                }
              }
              case Scalar.int: {
                const number = faker.integer({
                  min: -2000,
                  max: 2000,
                })
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: number,
                  },
                  include,
                }
              }
              case Scalar.float: {
                const float = faker.floating({
                  min: -1000,
                  max: 1000,
                  fixed: 2,
                })

                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: float,
                  },
                  include,
                }
              }
              case Scalar.date: {
                const date = faker.date({
                  min: new Date(Date.UTC(1970, 0, 1)),
                  max: new Date(Date.UTC(2038, 1, 19)),
                })

                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: date,
                  },
                  include,
                }
              }
              case Scalar.bool: {
                const boolean = faker.bool()
                return {
                  pool,
                  tasks,
                  data: {
                    ...data,
                    [field.name]: boolean,
                  },
                  include,
                }
              }
              /* Unsupported scalar */
              default: {
                throw new Error(
                  `Unsupported scalar field ${task.model.name}${field.name} of type ${field.type}`,
                )
              }
            }
          }
          /**
           * Relations
           *
           * NOTE: this function assumes that we've sorted orders in
           *   such an order that this is the most crucial step that
           *   needs to be finished.
           */
          case 'object': {
            /* Resources calculation */
            const relation = task.relations[field.name]

            switch (relation.type) {
              case '1-to-1': {
                if (relation.field.isRequired) {
                  /**
                   * model A {
                   *  b: B
                   * }
                   * model B {
                   *  a: A
                   * }
                   *
                   * We are creating model A.
                   *
                   * NOTE: field a in model B could also be optional.
                   *      This function assumes that the order is such that
                   *      this step should also create an instance of model B
                   *      regardless of the meaning.
                   */
                  /* Creates the instances while creating itself. */
                  /**
                   * The other part of this relation will be taken out by the
                   * creation step below using getMockOfModel.
                   */
                  const {
                    tasks: newTasks,
                    pool: newPool,
                    data: instance,
                    include: mockInclude,
                  } = getMockOfModel(tasks, pool, relation.field)

                  return {
                    pool: newPool,
                    tasks: newTasks,
                    data: {
                      ...data,
                      [field.name]: {
                        create: instance,
                      },
                    },
                    include: {
                      ...include,
                      [field.name]:
                        Object.keys(mockInclude).length !== 0
                          ? { include: mockInclude }
                          : true,
                    },
                  }
                } else if (
                  /* If this model is second made */
                  relation.direction.from !== fieldModel.name &&
                  !relation.backRelationField.isRequired
                ) {
                  /**
                   * model A {
                   *  b: B
                   * }
                   * model B {
                   *  a?: A
                   * }
                   *
                   * We are creating model B.
                   */
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
                      return {
                        pool: newPool,
                        tasks,
                        data,
                        include,
                      }
                    }
                    case 1: {
                      const [id] = ids
                      return {
                        pool: newPool,
                        tasks,
                        data: {
                          ...data,
                          [field.name]: {
                            connect: id,
                          },
                        },
                        include: {
                          ...include,
                          [field.name]: true,
                        },
                      }
                    }
                    /* istanbul ignore next */
                    default: {
                      throw new Error(`Something truly unexpected happened.`)
                    }
                  }
                } else {
                  /**
                   * It is possible that this is the other side of the relation
                   * that has already been created in another process.
                   *
                   * We should't do anything in that case.
                   */
                  return {
                    pool,
                    tasks,
                    data,
                    include,
                  }
                }
              }
              case '1-to-many': {
                if (
                  /* This model is created first. */
                  relation.direction.from === fieldModel.name
                ) {
                  /**
                   * model A {
                   *  bs: B[]
                   * }
                   * model B {
                   *  a: A
                   * }
                   *
                   * We are creating model A.
                   */
                  /* Skip creating the relation as we'll connect to it when creating model B. */
                  return {
                    pool,
                    tasks,
                    data,
                    include,
                  }
                } else {
                  /* This is the second model in relation. */
                  /**
                   * model A {
                   *  bs: B[]
                   * }
                   * model B {
                   *  a: A
                   * }
                   *
                   * We are creating model B, As already exist.
                   */
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

                  return {
                    pool: newPool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        connect: ids,
                      },
                    },
                    include: {
                      ...include,
                      [field.name]: true,
                    },
                  }
                }
              }
              case 'many-to-1': {
                if (
                  /* This is the first model to be created in the relation. */
                  relation.direction.from === fieldModel.name &&
                  relation.field.isRequired
                ) {
                  /**
                   * model A {
                   *  b: B
                   * }
                   * model B {
                   *  a: A[]
                   * }
                   *
                   * We are creating A.
                   */
                  const {
                    tasks: newTasks,
                    pool: newPool,
                    data: instance,
                    include: mockInclude,
                  } = getMockOfModel(tasks, pool, relation.field)

                  return {
                    pool: newPool,
                    tasks: newTasks,
                    data: {
                      ...data,
                      [field.name]: {
                        create: instance,
                      },
                    },
                    include: {
                      ...include,
                      [field.name]:
                        Object.keys(mockInclude).length !== 0
                          ? { include: mockInclude }
                          : true,
                    },
                  }
                } /* This model is created second. */ else if (
                  relation.direction.from !== fieldModel.name
                ) {
                  /**
                   * model A {
                   *  b: B
                   * }
                   * model B {
                   *  a: A[]
                   * }
                   *
                   * We are creating A, B already exists.
                   */
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
                    return {
                      pool: newPool,
                      tasks,
                      data,
                      include,
                    }
                  }

                  return {
                    pool: newPool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        connect: id,
                      },
                    },
                    include: {
                      ...include,
                      [field.name]: true,
                    },
                  }
                } else {
                  /* Some other task will create this relation. */
                  return {
                    pool,
                    tasks,
                    data,
                    include,
                  }
                }
              }
              case 'many-to-many': {
                if (relation.direction.from === fieldModel.name) {
                  /**
                   * model A {
                   *  bs: B[]
                   * }
                   * model B {
                   *  as: A[]
                   * }
                   */
                  /* Insert IDs of this instance to the pool. */

                  return {
                    pool,
                    tasks,
                    data,
                    include,
                  }
                } else {
                  /**
                   * model A {
                   *  bs: B[]
                   * }
                   * model B {
                   *  as: A[]
                   * }
                   */
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

                  return {
                    pool: newPool,
                    tasks,
                    data: {
                      ...data,
                      [field.name]: {
                        connect: ids,
                      },
                    },
                    include: {
                      ...include,
                      [field.name]: true,
                    },
                  }
                }
              }
              /* end of relation kind switches */
            }
          }
          /**
           * Enums
           */
          case 'enum': {
            const { values } = task.enums[field.name]!
            const enume = faker.pickone(values)
            return {
              pool,
              tasks,
              data: {
                ...data,
                [field.name]: enume,
              },
              include,
            }
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
      // _ids: ID[] = [],
    ): [Pool, ID[]] {
      /* All available ids for this field (includes duplicates). */
      const allIds: ID[] = _.get(pool, [parent, child], [])

      /* Used ids */
      let ids: ID[] = []
      let remainingIds: ID[] = []

      for (let index = 0; index < allIds.length; index++) {
        const id = allIds[index]

        /* Makes sure that ids are unique */
        if (ids.some(_id => isId(_id, id))) {
          remainingIds.push(id)
          continue
        }

        /* Fill the list. */
        if (ids.length < n) {
          ids.push(id)
        } else {
          remainingIds.push(id)
        }
      }

      if (ids.length < n) {
        throw new Error(
          `Requesting more ${parent}.${child} ids than available.`,
        )
      }

      /* Clear ids from the pool. */
      const poolWithoutIds = _.set(pool, [parent, child], remainingIds)

      return [poolWithoutIds, ids]
    }

    /**
     * Tells whether two ids are the same.
     *
     * @param id
     * @param comparable
     */
    function isId(id: ID, comparable: ID): boolean {
      return [...Object.keys(id), ...Object.keys(comparable)].every(
        key => id[key] === comparable[key],
      )
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
    function insertFixtureIntoPool(
      fixture: Fixture,
      initialPool: Pool,
      orders: Order[],
    ): Pool {
      /**
       * Calculates the id of this fixture.
       */
      const id = fixture.model.fields
        .filter(
          field => fixture.model.idFields.includes(field.name) || field.isId,
        )
        .reduce<ID>((acc, field) => {
          if (!fixture.seed.hasOwnProperty(field.name)) {
            throw new Error(
              `Return data of ${fixture.model.name} is missing id field data for ${field.name}.`,
            )
          }

          return {
            ...acc,
            [field.name]: fixture.seed[field.name],
          }
        }, {})

      return fixture.model.fields
        .filter(field => field.kind === 'object')
        .reduce<Pool>(insertFieldIntoPool, initialPool)

      /**
       * This complements getMockDataForField's relations part.
       *  * For every relation that returns unchanged mock, this should
       *    insert id into the pool.
       *  * For every nested create relation it should extract child fixture.
       *
       * @param pool
       * @param field
       */
      function insertFieldIntoPool(pool: Pool, field: DMMF.Field): Pool {
        const fieldModel = fixture.model

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
            const relation = fixture.relations[field.name]

            switch (relation.type) {
              case '1-to-1': {
                if (relation.field.isRequired) {
                  /**
                   * Extracts a subfixture from compound create relation.
                   */
                  const subfixtureOrder: Order = getFieldOrder(field)
                  const subfixture: Fixture = {
                    seed: fixture.seed[field.name]!,
                    model: {
                      ...subfixtureOrder.model,
                      fields: subfixtureOrder.model.fields.filter(
                        ({ relationName }) =>
                          relationName !== field.relationName,
                      ),
                    },
                    relations: filterKeys(
                      subfixtureOrder.relations,
                      (key, relation) =>
                        relation.field.relationName !== field.relationName,
                    ),
                  }
                  return insertFixtureIntoPool(subfixture, pool, orders)
                } else if (
                  relation.direction.from === fieldModel.name &&
                  !relation.field.isRequired
                ) {
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
                if (relation.direction.from === fieldModel.name) {
                  /* Create the relation while creating this model instance. */

                  // const units = faker.integer({
                  //   min: relation.min,
                  //   max: relation.max,
                  // })
                  const units = Math.max(1, relation.max)

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
                if (
                  /* This is the first model to be created in the relation. */
                  relation.direction.from === fieldModel.name &&
                  relation.field.isRequired
                ) {
                  /**
                   * Extracts a subfixture from compound create relation.
                   */
                  const subfixtureOrder: Order = getFieldOrder(field)
                  const subfixture: Fixture = {
                    seed: fixture.seed[field.name]!,
                    model: {
                      ...subfixtureOrder.model,
                      fields: subfixtureOrder.model.fields.filter(
                        ({ relationName }) =>
                          relationName !== field.relationName,
                      ),
                    },
                    relations: filterKeys(
                      subfixtureOrder.relations,
                      (key, relation) =>
                        relation.field.relationName !== field.relationName,
                    ),
                  }
                  return insertFixtureIntoPool(subfixture, pool, orders)
                } else if (
                  relation.direction.from === fieldModel.name &&
                  !relation.field.isRequired
                ) {
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
                  /* Insert IDs of model instance into the pool. */

                  // const units = faker.integer({
                  //   min: relation.min,
                  //   max: relation.max,
                  // })
                  const units = Math.max(1, relation.max)

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
                if (relation.direction.from === fieldModel.name) {
                  /* Insert IDs of this instance to the pool. */

                  // const units = faker.integer({
                  //   min: relation.min,
                  //   max: relation.max,
                  // })
                  const units = Math.max(1, relation.max)

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

      /**
       * Finds the order of type of the field.
       * @param field
       */
      function getFieldOrder(field: DMMF.Field): Order {
        return orders.find(order => order.model.name === field.type)!
      }
    }

    /**
     * Creates instances of a requested relation and drains the remaining tasks.
     */
    function getMockOfModel(
      tasks: Task[],
      availablePool: Pool,
      field: DMMF.Field,
    ): Mock {
      // TODO: this doesn't put an id into fixture in the end.
      /* Find the requested tasks. */
      const mockTask = tasks.find(task => task.model.name === field.type)

      /* Validation check, though it should never trigger */
      /* istanbul ignore next */
      if (mockTask === undefined) {
        throw new Error('Something very unexpected occured.')
      }

      /* Delete backrelation */

      const mockTaskWithoutBackrelation: Task = {
        ...mockTask,
        model: {
          ...mockTask.model,
          fields: mockTask.model.fields.filter(
            ({ relationName }) => relationName !== field.relationName,
          ),
        },
        relations: filterKeys(
          mockTask.relations,
          (key, relation) => relation.field.relationName !== field.relationName,
        ),
      }

      const remainingTasks = tasks.filter(task => task.order !== mockTask.order)

      return getMockForTask(
        availablePool,
        remainingTasks,
        mockTaskWithoutBackrelation,
      )
    }
  }

  /**
   * Cleverly groups the data so it's useful for the end user.
   *
   * @param fixtures
   */
  function groupFixtures(fixtures: Fixture[]): Dictionary<object[]> {
    return fixtures.reduce<Dictionary<object[]>>((acc, fixture) => {
      const model = fixture.model.name
      if (acc.hasOwnProperty(model)) {
        return {
          ...acc,
          [model]: acc[model].concat(fixture.seed),
        }
      } else {
        return {
          ...acc,
          [model]: [fixture.seed],
        }
      }
    }, {})
  }
}
