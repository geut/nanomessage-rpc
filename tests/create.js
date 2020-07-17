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

  const alice = nanorpc(stream1, aliceOpts)
  const bob = nanorpc(stream2, bobOpts)

  return { alice, bob }
}
