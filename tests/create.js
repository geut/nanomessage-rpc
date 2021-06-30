import { Duplex } from 'streamx'

import { NanomessageRPC, useSocket } from '../src/index.js'

export default function create (aliceOpts = { onMessage () {} }, bobOpts = { onMessage () {} }) {
  const stream1 = new Duplex({
    write (data, cb) {
      stream2.push(data)
      cb()
    }
  })
  const stream2 = new Duplex({
    write (data, cb) {
      stream1.push(data)
      cb()
    }
  })

  const alice = new NanomessageRPC({ ...aliceOpts, ...useSocket(stream1) })
  const bob = new NanomessageRPC({ ...bobOpts, ...useSocket(stream2) })

  return { alice, bob }
}
