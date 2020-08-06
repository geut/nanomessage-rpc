const { Duplex } = require('streamx')

const nanorpc = require('..')

module.exports = function create (aliceOpts = { onMessage () {} }, bobOpts = { onMessage () {} }) {
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

  const alice = nanorpc({ ...aliceOpts, ...nanorpc.useSocket(stream1) })
  const bob = nanorpc({ ...bobOpts, ...nanorpc.useSocket(stream2) })

  return { alice, bob }
}
