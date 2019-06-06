import { FakerBag, FakerSchema, seed } from '../src'

run()

async function run() {
  const data = seed(
    (b: FakerBag): FakerSchema => ({
      User: {
        factory: {
          name: b.faker.name.firstName,
          posts: {
            min: 3,
            max: 100,
          },
        },
      },
    }),
    {
      silent: true,
      seed: 1,
    },
  )

  console.log(data)
}
