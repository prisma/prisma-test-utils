import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import Chance from 'chance'
import _ from 'lodash'
import { Dictionary } from 'lodash'
import mls from 'multilines'
import {
  Faker,
  FakerBag,
  FakerSchema,
  ID,
  RelationConstraint,
  FixtureDefinition,
} from './types'
import { withDefault } from './utils'

export interface SeedOptions<PhotonOptions> {
  seed?: number
  silent?: boolean
  instances?: number
  photon?: PhotonOptions
}

/**
 * Seed the database with mock data.
 *
 * @param fakerSchemaDefinition
 * @param opts
 */
export function seed<
  PhotonType extends { disconnect: () => void },
  PhotonOptions
>(
  client: {
    dmmf: DMMF.Document
    Photon: { new (opts?: PhotonOptions): PhotonType }
  },
  schemaDef?: Faker | SeedOptions<PhotonOptions>,
  _opts?: SeedOptions<PhotonOptions>,
): Promise<object[]> {
  /* Argument manipulation */

  const __opts = typeof schemaDef === 'object' ? schemaDef : _opts

  const opts = {
    seed: 42,
    silent: false,
    instances: 5,
    ...__opts,
  }

  /* FakerBag, SchemaDefinition */

  const faker = new Chance(opts.seed)

  const bag: FakerBag = { faker }
  const fakerSchema = typeof schemaDef === 'function' ? schemaDef(bag) : {}

  /* Fixture calculations */

  const orders: Order[] = getOrdersFromDMMF(client.dmmf)
  const steps: Step[] = getStepsFromOrders(orders)
  const tasks: Task[] = getTasksFromSteps(steps)
  const fixtures: Fixture[] = getFixturesFromTasks(fakerSchema, tasks)

  /* Creates Photon instance and pushes data. */

  const seeds = seedFixturesToDatabase(client.Photon, opts.photon, fixtures, {
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
    relation: DMMF.Field // signifies the back relation
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

  type FixtureData = Dictionary<
    ID | string | number | boolean | ID[] | string[] | number[] | boolean[]
  >

  /**
   * Represents the virtual unit.
   */
  type Fixture = {
    order: number // starts with 0
    id: string
    model: DMMF.Model
    mapping: DMMF.Mapping
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
  function getOrdersFromDMMF(dmmf: DMMF.Document): Order[] {
    return dmmf.datamodel.models.map(model => {
      /* User defined settings */
      const fakerModel = getFakerModel(fakerSchema, model.name)

      /* Find Photon mappings for seeding step */
      const mapping = dmmf.mappings.find(m => m.model === model.name)

      /* Generate relations based on provided restrictions. */
      const relations: Order['relations'] = model.fields
        .filter(f => f.kind === 'object')
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
              const { type, min, max, relation, relationTo } = getRelationType(
                dmmf.datamodel.models,
                fakerSchema,
                field,
                model,
                fakerField,
              )

              return {
                ...acc,
                [field.name]: {
                  type: type,
                  min: min,
                  max: max,
                  relationTo: relationTo,
                  field,
                  relation,
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
     * Finds a model definition in faker schema or returns default
     * faker model.
     */
    function getFakerModel(
      schema: FakerSchema,
      model: string,
    ): FixtureDefinition {
      return _.get(schema, model, {
        amount: opts.instances,
        factory: undefined,
      })
    }

    /**
     * Finds the prescribed model from the DMMF models.
     */
    function getDMMFModel(models: DMMF.Model[], model: string): DMMF.Model {
      return models.find(m => m.name === model)
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
      allModels: DMMF.Model[],
      schema: FakerSchema,
      field: DMMF.Field,
      fieldModel: DMMF.Model,
      definition: RelationConstraint,
    ): {
      type: RelationType
      min: number
      max: number
      relationTo: string
      relation: DMMF.Field
    } {
      /**
       * model A {
       *  field: Relation
       * }
       */
      /* Field definitions */
      const fieldFakerModel = getFakerModel(schema, fieldModel.name)

      /**
       * Relation definitions
       *
       * NOTE: relaitonField is a back reference to the examined model.
       */
      const relationModel = getDMMFModel(allModels, field.type)
      const relationField = withDefault<DMMF.Field>(
        {
          kind: 'object',
          name: '',
          isRequired: false,
          isList: false,
          isId: false,
          type: field.type,
          isGenerated: false,
          isUnique: false,
          dbName: '',
        },
        relationModel.fields.find(f => f.type === fieldModel.name),
      )
      const relationFakerModel = getFakerModel(schema, field.type)

      /* Relation type definitions */
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

        /* Validation */

        if (min > max) {
          /* Inconsistent mock definition. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name}: number of minimum instances is higher than maximum.
            `,
          )
        } else if (max > relationFakerModel.amount) {
          /* Missing relation instances */
          const missingInstances = max - relationFakerModel.amount
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name} requests more(${max}) instances of | ${relationModel.name}(${relationFakerModel.amount}) than available.
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
              relationField,
            ),
            relation: relationField,
          }
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
          relationTo: getRelationDirection('many-to-1', field, relationField),
          relation: relationField,
        }
      } else if (field.isList && !relationField.isList) {
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
          /* Inconsistent mock definition. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name}: number of minimum instances is higher than maximum.
            `,
          )
        } else if (max > relationFakerModel.amount) {
          /* Missing relation instances */
          const missingInstances = max - relationFakerModel.amount
          throw new Error(
            /* prettier-ignore */
            mls`
            | ${fieldModel.name}.${field.name} requests more (${max}) instances of ${relationModel.name}(${relationFakerModel.amount}) than available.
            | Please add more (${missingInstances}) ${relationModel.name} instances.
            `,
          )
        } else {
          /* Valid declaration */
          return {
            type: '1-to-many',
            min: min,
            max: max,
            relationTo: getRelationDirection('1-to-many', field, relationField),
            relation: relationField,
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
          relationField.isRequired &&
          fieldFakerModel.amount !== relationFakerModel.amount
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
          relationField.isRequired &&
          fieldFakerModel.amount < relationFakerModel.amount
        ) {
          /* An optional 1-to-1 relation inadequate unit amount. */
          throw new Error(
            /* prettier-ignore */
            mls`
            | A 1-to-1 relation ${relationModel.name} needs at least ${relationFakerModel.amount} ${fieldModel.name} units, but only ${fieldFakerModel.amount} were provided.
            | Please make sure there's an adequate amount of resources available.
            `,
          )
        } else {
          /* Sufficient amounts. */
          return {
            type: '1-to-1',
            min: field.isRequired ? 1 : 0,
            max: 1,
            relationTo: getRelationDirection('1-to-1', field, relationField),
            relation: relationField,
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
      relation: DMMF.Field,
    ): string {
      /**
       * Relation is binding if it's a required relation and not a list,
       * because lists can be empty and optional fields can be null.
       */
      const fieldBinding = field.isRequired && !field.isList
      const relationBinding = relation.isRequired && !field.isList

      switch (relationType) {
        case '1-to-1': {
          if (fieldBinding && relationBinding) {
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
            return _.head([field.type, relation.type].sort())
          } else if (!fieldBinding && relationBinding) {
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
            return relation.type
          } else if (fieldBinding && !relationBinding) {
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
            return _.head([field.type, relation.type].sort())
          }
        }
        case '1-to-many': {
          if (relationBinding) {
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
            return relation.type
          } else {
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
            return relation.type
          }
        }
        case 'many-to-1': {
          if (fieldBinding) {
            /**
             * model A {
             *  b: B
             * }
             * model B {
             *  a: A[]
             * }
             *
             * -> We should create As while creating B. B is required.
             */
            return field.type
          } else {
            /**
             * model A {
             *  b: B?
             * }
             * model B {
             *  a: A[]
             * }
             *
             * -> We should create A(s) first and then connect them with B.
             */
            return relation.type
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
          return _.head([field.type, relation.type].sort())
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

    return tasks
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
  function getFixturesFromTasks(schema: FakerSchema, tasks: Task[]): Fixture[] {
    /**
     * Pool describes the resources made available by a parent type to its children.
     */
    type Pool = Dictionary<{ [child: string]: ID[] }>

    const [fixtures] = iterate(_.sortBy(tasks, t => t.order), {})

    return fixtures

    /* Helper functions */

    /**
     * Recursively changes tasks to fixtures.
     */
    function iterate(
      tasks: Task[],
      pool: Pool,
      n: number = 0,
    ): [Fixture[], Pool] {
      switch (tasks.length) {
        case 0: {
          return [[], {}]
        }
        default: {
          const [task, ...remainingTasks] = tasks

          /* Fixture calculation */
          const id = getFixtureId()
          const [data, newPool, newTasks] = getMockDataForTask(
            id,
            pool,
            remainingTasks,
            task,
          )

          const fixture: Fixture = {
            order: n,
            id: id,
            model: task.model,
            mapping: task.mapping,
            data: data,
            relations: task.relations,
          }

          /* Recurse */
          const [recursedFixtures, recursedPool] = iterate(
            newTasks,
            newPool,
            n + 1,
          )
          return [[fixture, ...recursedFixtures], recursedPool]
        }
      }
    }

    /**
     * Generates a unique identifier based on the database kind.
     */
    function getFixtureId(): ID {
      return faker
        .guid()
        .replace(/\-/g, '')
        .slice(0, 25)
    }

    /**
     * Generates mock data from the provided model. Scalars return a mock scalar or
     * list of mock scalars, relations return an ID or lists of IDs.
     */
    function getMockDataForTask(
      id: ID,
      _pool: Pool,
      _tasks: Task[],
      task: Task,
    ): [FixtureData, Pool, Task[]] {
      const [finalPool, finalTasks, fixture] = task.model.fields.reduce(
        ([pool, tasks, acc], field) => {
          const fieldModel = task.model

          /* Custom field mocks */

          if (
            schema[task.model.name] &&
            schema[task.model.name].factory &&
            schema[task.model.name].factory[field.name]
          ) {
            const mock = schema[task.model.name].factory[field.name]
            switch (typeof mock) {
              case 'function': {
                const value = mock.call(faker)
                return [pool, tasks, { ...acc, [field.name]: value }]
              }
              case 'object': {
                /* Relation constraint */
                break
              }
              default: {
                const value = mock
                return [pool, tasks, { ...acc, [field.name]: value }]
              }
            }
          }

          /* ID fields */

          if (field.isId) {
            switch (field.type) {
              case 'ID': {
                return [pool, tasks, { ...acc, [field.name]: id }]
              }
              case 'String': {
                return [pool, tasks, { ...acc, [field.name]: id }]
              }
              case 'Int': {
                throw new Error('Int @ids are not yet supported!')
              }
            }
          }

          /* Scalar and relation field mocks */

          switch (field.type) {
            case 'ID': {
              return [pool, tasks, { ...acc, [field.name]: id }]
            }
            case 'String': {
              const string = faker.word()

              return [pool, tasks, { ...acc, [field.name]: string }]
            }
            case 'Int': {
              const number = faker.integer({
                min: -2147483647,
                max: 2147483647,
              })

              return [pool, tasks, { ...acc, [field.name]: number }]
            }
            case 'Float': {
              const float = faker.floating()

              return [pool, tasks, { ...acc, [field.name]: float }]
            }
            case 'Date': {
              const date = faker.date()

              return [pool, tasks, { ...acc, [field.name]: date }]
            }
            default: {
              /* Relations */

              if (!(field.kind === 'object')) {
                /* Fallback for unsupported scalars */
                throw new Error(
                  /* prettier-ignore */
                  mls`
                  | Unsupported field type "${field.type}".
                  | Please use a custom mock function or change your model definition.
                  `,
                )
              }

              /* Resources calculation */
              const relation = task.relations[field.name]
              const units = faker.integer({
                min: relation.min,
                max: relation.max,
              })

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
                  if (relation.relationTo === fieldModel.name) {
                    if (!relation.field.isRequired) {
                      /* Insert the ID of an instance into the pool. */
                      const newPool = insertIDInstancesIntoPool(
                        pool,
                        field.type,
                        fieldModel.name,
                        id,
                      )

                      return [newPool, tasks, acc]
                    } else {
                      /* Creates the instances while creating itself. */
                      const [newTasks, newPool, [instance]] = getInstances(
                        tasks,
                        pool,
                        relation.field.type,
                        1,
                      )

                      return [
                        newPool,
                        newTasks,
                        {
                          ...acc,
                          [field.name]: {
                            create: instance,
                          },
                        },
                      ]
                    }
                  } else {
                    /* Create an instance and connect it to the relation. */
                    if (!relation.relation.isRequired) {
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
                          return [newPool, tasks, acc]
                        }

                        case 1: {
                          const [id] = ids
                          return [
                            newPool,
                            tasks,
                            {
                              ...acc,
                              [field.name]: {
                                connect: { id },
                              },
                            },
                          ]
                        }

                        default: {
                          throw new Error(
                            `Something truly unexpected happened.`,
                          )
                        }
                      }
                    } else {
                      /* Is created by the parent. */
                      return [pool, tasks, acc]
                    }
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
                    const newPool = insertIDInstancesIntoPool(
                      pool,
                      field.type,
                      fieldModel.name,
                      id,
                      units,
                    )

                    return [newPool, tasks, acc]
                    // const [newTasks, newPool, instances] = getInstances(
                    //   tasks,
                    //   pool,
                    //   relation.field.type,
                    //   units,
                    // )

                    // return [
                    //   newPool,
                    //   newTasks,
                    //   {
                    //     ...acc,
                    //     [field.name]: {
                    //       create: instances,
                    //     },
                    //   },
                    // ]
                  } else {
                    /* Create this instance and connect to others. */
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
                      tasks,
                      {
                        ...acc,
                        [field.name]: {
                          connect: connections,
                        },
                      },
                    ]
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
                    const newPool = insertIDInstancesIntoPool(
                      pool,
                      field.type,
                      fieldModel.name,
                      id,
                      units,
                    )

                    return [newPool, tasks, acc]
                  } else {
                    /* Create this instance and connect to others. */
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
                      tasks,
                      {
                        ...acc,
                        [field.name]: {
                          connect: connections,
                        },
                      },
                    ]
                    // /* Create relation instances while creating this model instance. */
                    // const [newTasks, newPool, instances] = getInstances(
                    //   tasks,
                    //   pool,
                    //   relation.field.type,
                    //   units,
                    // )

                    // return [
                    //   newPool,
                    //   newTasks,
                    //   {
                    //     ...acc,
                    //     [field.name]: {
                    //       create: instances,
                    //     },
                    //   },
                    // ]
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
                    const newPool = insertIDInstancesIntoPool(
                      pool,
                      field.type,
                      fieldModel.name,
                      id,
                      units,
                    )

                    return [newPool, tasks, acc]
                  } else {
                    /* Create instances and connect to relation instances. */
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
                      tasks,
                      {
                        ...acc,
                        [field.name]: {
                          connect: connections,
                        },
                      },
                    ]
                  }
                }
              }
            }
          }
        },
        [_pool, _tasks, {}],
      )

      return [fixture, finalPool, finalTasks]
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

    /**
     * Creates instances of a requested relation and drains the remaining tasks.
     */
    function getInstances(
      _tasks: Task[],
      _pool: Pool,
      model: string,
      n: number = 1,
    ): [Task[], Pool, FixtureData[]] {
      /* Find the requested tasks. */
      const [instanceTasks, remainingTasks] = _tasks.reduce(
        ([acc, otherTasks], task) => {
          if (task.model.name === model && acc.length < n) {
            return [acc.concat(task), otherTasks]
          } else {
            return [acc, otherTasks.concat(task)]
          }
        },
        [[], []],
      )

      /* Validation check, though it should never trigger */
      if (instanceTasks.length !== n) {
        throw new Error('Something very unexpected occured.')
      }

      /* Generate mock data for them. */
      const [finalPool, finalTasks, instances] = instanceTasks.reduce(
        ([pool, tasks, acc], task) => {
          const id = getFixtureId()
          const [fixture, newPool, newTasks] = getMockDataForTask(
            id,
            pool,
            tasks,
            task,
          )

          return [newPool, newTasks, acc.concat(fixture)]
        },
        [_pool, remainingTasks, []],
      )

      return [finalTasks, finalPool, instances]
    }
  }

  /**
   * Seeds the fixtures to the database. Based on the `silent` option
   * it performs data push. Photon is provided globally.
   *
   * @param fixtures
   * @param opts
   */
  async function seedFixturesToDatabase(
    Photon: { new (opts: PhotonOptions): PhotonType },
    photonOptions: PhotonOptions,
    fixtures: Fixture[],
    opts: { silent: boolean } = { silent: false },
  ): Promise<object[]> {
    if (opts.silent) {
      /**
       * Create Map, reduce ID references, and return model-type based
       * collection of instances.
       */
      return _.sortBy(fixtures, f => f.order).map(f => f.data)
    } else {
      const photon = new Photon(photonOptions)
      try {
        /**
         * Generates a chain of promises that create DB instances.
         */
        const actions = _.sortBy(fixtures, f => f.order).reduce<
          Promise<object[]>
        >(async (acc, f) => {
          return acc.then(async res => {
            /* Create a single instance */
            // TODO:
            let seed
            try {
              seed = await photon[f.mapping.findMany]['create']({
                data: f.data,
              })
            } catch (err) {}

            return res.concat(seed)
          })
        }, Promise.resolve([]))

        /* Internally executes the chain. */
        const seeds = await actions
        return seeds
      } catch (err) {
        throw err
      } finally {
        photon.disconnect()
      }
    }
  }
}
