import { FakerBag, FakerModel, getFixtures } from '../src'

run()

async function run() {
  /**
   * #1
   * Pros: Flavian, easier TypeSafety
   * Cons: Large models require all-or-none definition, required post-execution check for defaults.
   */
  // const model = (b: FakerBag): FakerModel => ({
  //   User: {
  //     factory: () => ({
  //       name: b.faker.name.firstName(),
  //       posts: b.constraints.atMax(2),
  //     }),
  //   },
  // })

  /**
   * #2
   * Pros: easier to implement,
   *  supports granular implementation (optional implementation of fields, otherwise use defults),
   *  pre-execution setting.
   * Cons: Difficult type-safety
   */
  // const _model = (b: FakerBag): FakerModel => ({
  //   User: {
  //     factory: {
  //       name: b.faker.name.firstName,
  //       posts: b.constraints.atMax(2),
  //     },
  //   },
  // })

  /**
   * #4
   * Pros: easier to implement,
   *  supports granular implementation (optional implementation of fields, otherwise use defults),
   *  pre-execution setting, removes unnecessary contraint compelxity.
   * Cons: Difficult type-safety
   */
  const __model = (b: FakerBag): FakerModel => ({
    User: {
      factory: {
        name: b.faker.name.firstName,
        posts: {
          min: 3,
          max: 100,
        },
      },
    },
  })

  /**
   * #3
   * Pros: intutive, Flavian
   * Cons: No need for constructing the model before usage, OOP, unnecessary encapsulation.
   * +everything from #1
   */
  // const prismaFaker = new PrismaFaker(p => ({
  //   User: {
  //     factory: () => ({
  //       name: p.faker.name.firstName(),
  //       posts: p.constraints.atMax(2),
  //     }),
  //   },
  // }))

  const fixtures = getFixtures(__model, { seed: 42 })

  console.log(fixtures)
}
