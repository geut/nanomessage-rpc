import { EventEmitter } from 'events'
import Emittery from 'emittery'
import { Nanomessage } from 'nanomessage'
import assert from 'nanocustomassert'
import { NanoresourcePromise } from 'nanoresource-promise'

import Codec from './codec.js'
import {
  encodeError,
  decodeError,
  NRPC_ERR_NAME_MISSING,
  NRPC_ERR_RESPONSE_ERROR,
  NRPC_ERR_REQUEST_CANCELED
} from './errors.js'

const kNanomessage = Symbol('nrpc.nanomessage')
const kOnmessage = Symbol('nrpc.onmessage')
const kSubscribe = Symbol('nrpc.subscribe')
const kActions = Symbol('nrpc.actions')
const kEmittery = Symbol('nrpc.emittery')
const kCreateRequest = Symbol('nrpc.createrequest')

const noop = () => {}

export class NanomessageRPC extends NanoresourcePromise {
  constructor (opts = {}) {
    super()

    const { onError = () => {}, valueEncoding, send, subscribe, open = noop, close = noop, ...nanomessageOpts } = opts

    assert(send, 'send is required')

    this.ee = new EventEmitter()

    this[kOnmessage] = this[kOnmessage].bind(this)

    this[kNanomessage] = new Nanomessage({
      ...nanomessageOpts,
      send: send.bind(this),
      open: open.bind(this),
      close: close.bind(this),
      onMessage: this[kOnmessage],
      subscribe: subscribe && this[kSubscribe](subscribe),
      valueEncoding: new Codec(valueEncoding)
    })
    this[kEmittery] = new Emittery()
    this[kActions] = new Map()

    this._onError = onError

    this.ee.on('error', err => {
      this._onError(err)
    })
  }

  get opened () {
    return this[kNanomessage].opened
  }

  get closed () {
    return this[kNanomessage].closed
  }

  get requests () {
    return this[kNanomessage].requests
  }

  get inflightRequests () {
    return this[kNanomessage].inflightRequests
  }

  get requestTimeout () {
    return this[kNanomessage].timeout
  }

  get concurrency () {
    return this[kNanomessage].concurrency
  }

  get emittery () {
    return this[kEmittery]
  }

  get registeredActions () {
    const obj = {}
    this[kActions].forEach((handler, key) => {
      obj[key] = handler
    })
    return obj
  }

  setRequestsTimeout (timeout) {
    this[kNanomessage].setRequestsTimeout(timeout)
  }

  setConcurrency (concurrency) {
    this[kNanomessage].setConcurrency(concurrency)
  }

  onError (cb) {
    this._onError = cb
  }

  action (name, handler) {
    this[kActions].set(name, handler)
    return this
  }

  actions (actions) {
    Object.keys(actions).forEach(name => this.action(name, actions[name]))
    return this
  }

  call (name, data, opts = {}) {
    return this[kCreateRequest]({ name, data }, opts)
  }

  emit (name, data, opts = {}) {
    return this[kCreateRequest]({ name, data, event: true }, opts)
  }

  on (...args) {
    return this[kEmittery].on(...args)
  }

  once (...args) {
    return this[kEmittery].once(...args)
  }

  off (...args) {
    return this[kEmittery].off(...args)
  }

  events (name) {
    return this[kEmittery].events(name)
  }

  async processIncomingMessage (buf, opts = {}) {
    await this.open()
    return this[kNanomessage].processIncomingMessage(buf, {
      onMessage: this[kOnmessage],
      ...opts
    })
  }

  async _onMessage (message, info) {
    return message
  }

  async _open () {
    await this[kNanomessage].open()
    this.ee.emit('opened')
  }

  async _close () {
    await this[kNanomessage].close()
    this.ee.emit('closed')
  }

  [kSubscribe] (subscribe) {
    return (next) => {
      subscribe((data) => {
        next(data).catch(err => {
          process.nextTick(() => this.ee.emit('error', err))
        })
      })
    }
  }

  [kCreateRequest] (packet, { timeout, signal, wait = true, args }) {
    assert(packet.name && typeof packet.name === 'string', 'name is required')

    if (packet.event && !wait) {
      return this.open().then(() => this[kNanomessage].send(packet))
    }

    let errCanceled
    let request
    const promise = this.open()
      .then(() => {
        if (errCanceled) throw errCanceled
        request = this[kNanomessage].request(packet, { timeout, signal, args })
        this.ee.emit('request-created', request, packet)
        return request
      })
      .then(result => {
        if (result.error) {
          const { code, unformatMessage, args, stack } = result.data
          const ErrorDecoded = decodeError(code, unformatMessage)
          const err = new ErrorDecoded(...args)
          err.stack = stack || err.stack
          throw err
        } else {
          return result.data
        }
      })

    promise.cancel = (err) => {
      if (!err) {
        err = new NRPC_ERR_REQUEST_CANCELED('request canceled')
      } else if (typeof err === 'string') {
        err = new NRPC_ERR_REQUEST_CANCELED(err)
      }

      if (request) return request.cancel(errCanceled)
      errCanceled = err
    }

    return promise
  }

  async [kOnmessage] (message, info) {
    this.ee.emit('message', message)
    try {
      message = await this._onMessage(message, info)

      if (message.event) {
        await this[kEmittery].emit(message.name, message.data)
        return { data: null }
      }

      const action = this[kActions].get(message.name)

      if (!action) {
        return encodeError(new NRPC_ERR_NAME_MISSING(message.name))
      }

      const result = await action(message.data)
      return { data: result }
    } catch (err) {
      if (err.isNanoerror) {
        return encodeError(err)
      }
      const rErr = new NRPC_ERR_RESPONSE_ERROR(err.message)
      rErr.stack = err.stack || rErr.stack
      return encodeError(rErr)
    }
  }
}
