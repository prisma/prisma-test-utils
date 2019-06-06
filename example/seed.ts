import { FakerBag, FakerSchema, seed } from '../src'

run()

async function run() {
  const data = seed(
    bag => ({
      User: {
        factory: {
          name: bag.faker.name.firstName,
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
