import nanoerror from 'nanoerror'
import { AbortController } from 'abortcontroller-polyfill/dist/abortcontroller'

import create from './create.js'

import { NRPC_ERR_RESPONSE_ERROR, NRPC_ERR_NAME_MISSING } from '../src/errors.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

test('actions', async () => {
  const { alice, bob } = create()

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
    subtract: async ({ a, b }) => {
      await delay(500)
      return a - b
    }
  }).open()

  await expect(alice.call('subtract', { a: 2, b: 2 })).resolves.toBe(0)
  await expect(bob.call('sum', { a: 2, b: 2 })).resolves.toBe(4)

  try {
    await bob.call('error')
  } catch (err) {
    expect(err).toBeInstanceOf(NRPC_ERR_RESPONSE_ERROR)
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
    expect(err).toBeInstanceOf(NRPC_ERR_NAME_MISSING)
    expect(err.message).toBe('missing action handler for: foo')
  }
})

test('events', async () => {
  const { alice, bob } = create()

  await alice.open()
  await bob.open()

  let finish = Promise.all([alice.once('ping'), bob.once('pong')])
  await Promise.all([alice.emit('pong', 'hi'), bob.emit('ping', 'hello')])
  await expect(finish).resolves.toEqual(['hello', 'hi'])

  let received = false
  finish = bob.once('notWait')
    .then(value => {
      received = true
      return value
    })
  await alice.emit('notWait', 'hi', { wait: false })
  expect(received).toBe(false)
  await expect(finish).resolves.toEqual('hi')
})

test('cancel', async () => {
  const { alice, bob } = create()

  await alice.actions({
    delay: async () => {
      await delay(500)
    }
  }).open()

  await bob.open()

  const request = bob.call('delay')
  process.nextTick(() => request.cancel())
  await expect(request).rejects.toThrow('request canceled')
})

test('abort signal', async () => {
  const { alice, bob } = create()

  await alice.actions({
    delay: async () => {
      await delay(500)
    }
  }).open()

  await bob.open()

  {
    const controller = new AbortController()
    const signal = controller.signal
    controller.abort()
    const request = bob.call('delay', 'test', { signal })
    await expect(request).rejects.toThrow('request canceled')
  }

  {
    const controller = new AbortController()
    const signal = controller.signal
    const request = bob.call('delay', 'test', { signal })
    setTimeout(() => controller.abort(), 200)
    await expect(request).rejects.toThrow('request canceled')
  }
})

test('custom timeout', async () => {
  const { alice, bob } = create()

  await alice.actions({
    delay: async () => {
      await delay(1000)
    }
  }).open()

  await bob.open()

  const request = bob.call('delay', 'test', { timeout: 100 })
  await expect(request).rejects.toThrow(/timeout/)
})
