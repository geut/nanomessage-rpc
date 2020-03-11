const through = require('through2')
const duplexify = require('duplexify')

const nanorpc = require('..')

const createConnection = ({ alice: aliceOpts, bob: bobOpts } = {}) => {
  const t1 = through()
  const t2 = through()

  const stream1 = duplexify(t1, t2)
  const alice = nanorpc(stream1, aliceOpts)

  const stream2 = duplexify(t2, t1)
  const bob = nanorpc(stream2, bobOpts)

  return { alice, bob }
}

test('actions', async () => {
  const { alice, bob } = createConnection()

  await alice.actions({
    sum: ({ a, b }) => a + b,
    error: () => {
      throw new Error('something went wrong')
    }
  }).open()

  await bob.actions({
    subtract: ({ a, b }) => a - b
  }).open()

  await expect(alice.call('subtract', { a: 2, b: 2 })).resolves.toBe(0)
  await expect(bob.call('sum', { a: 2, b: 2 })).resolves.toBe(4)
  await expect(bob.call('error')).rejects.toThrow('something went wrong')
})

test('events', async () => {
  const { alice, bob } = createConnection()

  await alice.open()
  await bob.open()

  const finish = Promise.all([alice.once('ping'), bob.once('pong')])

  await alice.emit('pong', 'hi')
  await bob.emit('ping', 'hello')

  await expect(finish).resolves.toEqual(['hello', 'hi'])
})
