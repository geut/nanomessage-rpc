import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { spy } from 'tinyspy'

import { Nanomessage } from 'nanomessage'
import { AbortController } from 'abortcontroller-polyfill/dist/abortcontroller.js'

import create from './create.js'

import {
  NanomessageRPC,
  createError,
  EVENTS,
  NM_ERR_REMOTE_RESPONSE,
  NRPC_ERR_NAME_MISSING,
  NM_ERR_CLOSE,
  NRPC_ERR_INTERNAL_EVENT,
  NRPC_ERR_REQUEST_CANCELED,
  NM_ERR_TIMEOUT
} from '../src/index.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const assertHaveProperty = (obj, prop, defaultValue) => {
  assert.ok(prop in obj, 'have property')
  assert.equal(obj[prop], defaultValue)
}

const assertThrow = async (p, ErrorClass) => {
  try {
    await p
    assert.unreachable('should have thrown')
  } catch (err) {
    if (ErrorClass.isNanoerror) {
      assert.ok(ErrorClass.equals(err), `expect code: ${ErrorClass.code} resolve: ${err}`)
    } else {
      assert.instance(err, ErrorClass)
    }
    return err
  }
}

test('options', () => {
  const { alice } = create()

  const actions = {
    test: () => {}
  }
  alice.actions(actions)
  assertHaveProperty(alice, 'opened', false)
  assertHaveProperty(alice, 'opening', false)
  assertHaveProperty(alice, 'closed', false)
  assertHaveProperty(alice, 'closing', false)
  assertHaveProperty(alice, 'actives', 0)
  assertHaveProperty(alice, 'requests', [])
  assertHaveProperty(alice, 'inflightRequests', 0)
  assertHaveProperty(alice, 'requestTimeout', 10_000)
  assertHaveProperty(alice, 'concurrency', {
    incoming: 256,
    outgoing: 256
  })
  assert.instance(alice.nanomessage, Nanomessage)
  assertHaveProperty(alice, 'registeredActions', actions)

  alice.setRequestTimeout(5000)
  assertHaveProperty(alice, 'requestTimeout', 5000)

  alice.setConcurrency(100)
  assertHaveProperty(alice, 'concurrency', {
    incoming: 100,
    outgoing: 100
  })

  const onMessage = message => message
  alice.setMessageHandler(onMessage)
  assert.is(alice._onMessage, onMessage)
})

test('actions', async () => {
  const { alice, bob } = create()

  const sum = spy(({ a, b }) => a + b)

  const subtract = spy(async ({ a, b }) => {
    await delay(500)
    return a - b
  })

  const CUSTOM_ERROR = createError('CUSTOM_ERROR', 'error in %s')
  await alice.actions({
    sum,
    error: () => {
      throw new Error('wrong')
    },
    customError: () => {
      throw new CUSTOM_ERROR('bar')
    }
  }).open()

  await bob.actions({
    subtract
  }).open()

  assert.is(await alice.call('subtract', { a: 2, b: 2 }), 0)
  assert.is(await bob.call('sum', { a: 2, b: 2 }), 4)

  assert.ok(sum.called)
  assert.ok(subtract.called)

  assert.equal(sum.calls[0][0], { a: 2, b: 2 })
  assert.equal(subtract.calls[0][0], { a: 2, b: 2 })
  assert.is(sum.calls[0][1].event, false)
  assert.is(subtract.calls[0][1].event, false)
  assert.is(sum.calls[0][1].name, 'sum')
  assert.is(subtract.calls[0][1].name, 'subtract')
  assert.is(sum.calls[0][2].constructor.name, 'RequestInfo')
  assert.is(subtract.calls[0][2].constructor.name, 'RequestInfo')

  {
    const req = bob.call('error')
    const err = await assertThrow(req, NM_ERR_REMOTE_RESPONSE)
    assert.ok(err.message.includes('wrong'))
  }

  {
    const req = bob.call('customError')
    const err = await assertThrow(req, CUSTOM_ERROR)
    assert.ok(err.message.includes('bar'))
  }

  {
    const req = bob.call('foo')
    const err = await assertThrow(req, NRPC_ERR_NAME_MISSING)
    assert.ok(err.message.includes('missing action'))
  }
})

test('events', async () => {
  const { alice, bob } = create()

  await alice.open()
  await bob.open()

  let result = Promise.all([NanomessageRPC.once(alice, 'ping'), NanomessageRPC.once(bob, 'pong')])
  await Promise.all([alice.emitAsync('pong', 'hi'), bob.emitAsync('ping', 'hello')])
  result = await result
  assert.is(result[0][0], 'hello')
  assert.is(result[1][0], 'hi')

  result = NanomessageRPC.once(bob, 'notWait')
  alice.emit('notWait', 'hi')
  result = await result
  assert.is(result[0], 'hi')

  try {
    bob.emit(EVENTS.message)
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.ok(NRPC_ERR_INTERNAL_EVENT.equals(err), `expect code: ${NRPC_ERR_INTERNAL_EVENT.code} resolve: ${err}`)
  }

  await assertThrow(bob.emitAsync(EVENTS.message), NRPC_ERR_INTERNAL_EVENT)
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
    const err = await assertThrow(request, NRPC_ERR_REQUEST_CANCELED)
    assert.ok(err.message.includes('{"name":"delay","timeout":10000,"aborted":true}'))
  }

  {
    const controller = new AbortController()
    const signal = controller.signal
    const request = bob.call('delay', 'test', { signal })
    setTimeout(() => controller.abort(), 200)
    const err = await assertThrow(request, NRPC_ERR_REQUEST_CANCELED)
    assert.ok(err.message.includes('{"name":"delay","timeout":10000,"aborted":true}'))
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
  await assertThrow(request, NM_ERR_TIMEOUT)
})

test('processIncomingMessage', async () => {
  let alice = null
  let bob = null

  alice = new NanomessageRPC({
    send (buf) {
      bob.processIncomingMessage(buf)
    }
  }).action('sum', ({ a, b }) => a + b)
  await alice.open()

  bob = new NanomessageRPC({
    send (buf) {
      alice.processIncomingMessage(buf)
    }
  }).action('sum', ({ a, b }) => a + b)
  await bob.open()

  assert.equal(await Promise.all([
    alice.call('sum', { a: 1, b: 1 }),
    bob.call('sum', { a: 0, b: 1 })
  ]), [2, 1])
})

test('close', async () => {
  const { alice } = create()

  await alice.open()
  await alice.close()
})

test('socket destroy', async () => {
  const { alice } = create()

  await alice.open()

  alice.socket.destroy()
  await assertThrow(alice.emitAsync('test'), NM_ERR_CLOSE)
})

test.run()
