// import { GeneratedSeedModels } from '../tests/seed/@generated/prisma-test-utils/seed'
// import { PrismaClient, dmmf } from '../tests/seed/@generated/client'
// import { getSeed, SeedFunction } from './static'

// async function test() {
//   const client: PrismaClient = new PrismaClient({})

//   const seed: SeedFunction<PrismaClient, GeneratedSeedModels> = getSeed(dmmf)

//   const dogo = await client.pet.create({
//     data: {
//       name: 'wubju',
//       nicknames: {
//         set: [
//           'Arthur Parker',
//           'Jack Chavez',
//           'Hunter Franklin',
//           'Betty Gill',
//           'Louis Reeves',
//         ],
//       },
//       animal: 'Dog',
//       birthday: '2040-07-14T19:13:01.534Z',
//     },
//   })

//   debugger

//   // const user = await client.user.create({
//   //   data: {
//   //     id: 'a98255ad-ed48-16a6dbd2687ac',
//   //     name: 'ed',
//   //     email: 'das',
//   //     isActive: true,
//   //     pet: { connect: { PetId: 26 } },
//   //   },
//   //   include: { husband: true, wife: true, pet: true, house: true },
//   // })

//   // const playlistTrack = await client.playlistTrack.create({
//   //   data: {
//   //     PlaylistId: 1,
//   //     TrackId: 2,
//   //   },
//   // })

//   const data = await seed({
//     seed: 1,
//     client,
//     models: kit => ({
//       '*': {
//         amount: 3,
//       },
//       Pet: {
//         factory: {
//           animal: 'Dog',
//           nicknames: () => kit.faker.n(kit.faker.name, 5),
//         },
//       },
//     }),
//   })

//   debugger

//   // const data = await seed({
//   //   seed: 42,
//   //   client,
//   //   models: kit => ({
//   //     '*': {
//   //       amount: 5,
//   //     },
//   //     House: {
//   //       amount: 3,
//   //       factory: {
//   //         residents: {
//   //           max: 3,
//   //         },
//   //       },
//   //     },
//   //     Pet: {
//   //       amount: 6,
//   //       factory: {
//   //         birthday: () => '2019-10-10T18:26:07.269Z',
//   //         toys: {
//   //           min: 3,
//   //         },
//   //       },
//   //     },
//   //     Toy: {
//   //       amount: 18,
//   //     },
//   //     User: {
//   //       factory: {
//   //         house: {
//   //           min: 1,
//   //         },
//   //       },
//   //     },
//   //   }),
//   // })

//   // // await client.toy.create({
//   // //   data: {
//   // //     id: 'abcd-c2cb-5a28-b4c6-5aa0680dac0c',
//   // //     name: 'hey',
//   // //     price: 2,
//   // //   },
//   // //   include: {},
//   // // })

//   // // const data = await seed({
//   // //   seed: 10,
//   // //   client,
//   // //   models: kit => ({
//   // //     '*': {
//   // //       amount: 5,
//   // //     },
//   // //     House: {
//   // //       amount: 3,
//   // //       factory: {
//   // //         residents: {
//   // //           max: 3,
//   // //         },
//   // //       },
//   // //     },
//   // //     User: {
//   // //       factory: {
//   // //         name: kit.faker.name,
//   // //         house: {
//   // //           min: 1,
//   // //         },
//   // //       },
//   // //     },
//   // //   }),
//   // // })

//   // console.log(JSON.stringify(data))

//   client.disconnect()
// }

// test()
