import { seed } from '../../../packages/prisma-faker/src'
import * as photon from '@generated/photon'

debugger
;(seed(photon, bag => ({})) as Promise<object[]>)
  .then(res => {
    console.log(res)
  })
  .catch(err => {
    throw err
  })
// beforeAll(async () => {
//   debugger
//   const data = await seed(photon, bag => ({}))

//   console.log(data)
// })

// test('user is queried correctly', async () => {
//   const client = new photon.Photon()
//   const posts = await client.blogs.create()

//   expect(posts.length).toBe(5)

//   client.disconnect()
// })
