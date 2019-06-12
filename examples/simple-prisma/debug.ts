import { seed } from '../../packages/prisma-faker/src'
import * as photon from '@generated/photon'

debugger
;(seed(photon, bag => ({})) as Promise<object[]>)
  .then(res => {
    console.log(res)
  })
  .catch(err => {
    throw err
  })
