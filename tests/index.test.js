const through = require('through2')
const duplexify = require('duplexify')
const nanoerror = require('nanoerror')

const nanorpc = require('..')

const { errors: { ERR_ACTION_RESPONSE_ERROR, ERR_ACTION_NAME_MISSING } } = nanorpc

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

  const CUSTOM_ERROR = nanoerror('CUSTOM_ERROR', 'error in %s')
  await alice.actions({
    sum: ({ a, b }) => a + b,
    error: () => {
      throw new Error('wrong')
    },
    customError: () => {
      throw new CUSTOM_ERROR('bar')
    }
  }).open()

  await bob.actions({
    subtract: ({ a, b }) => a - b
  }).open()

  await expect(alice.call('subtract', { a: 2, b: 2 })).resolves.toBe(0)
  await expect(bob.call('sum', { a: 2, b: 2 })).resolves.toBe(4)

  try {
    await bob.call('error')
  } catch (err) {
    expect(err).toBeInstanceOf(ERR_ACTION_RESPONSE_ERROR)
    expect(err.message).toBe('wrong')
  }

  try {
    await bob.call('customError')
  } catch (err) {
    expect(CUSTOM_ERROR.equals(err)).toBe(true)
    expect(err.message).toBe('error in bar')
  }

  try {
    await bob.call('foo')
  } catch (err) {
    expect(err).toBeInstanceOf(ERR_ACTION_NAME_MISSING)
    expect(err.message).toBe('missing action handler for: foo')
  }
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

test('cancel', async () => {
  const { alice, bob } = createConnection()

  await alice.actions({
    sum: ({ a, b }) => a + b
  }).open()

  await bob.actions({
    subtract: ({ a, b }) => a - b
  }).open()

  const request = alice.call('subtract', { a: 2, b: 2 })
  process.nextTick(() => request.cancel())
  await expect(request).rejects.toThrow('request canceled')
})
