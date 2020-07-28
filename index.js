const { EventEmitter } = require('events')
const Emittery = require('emittery')
const eos = require('end-of-stream')
const nanomessage = require('nanomessage')
const assert = require('nanocustomassert')
const { NanoresourcePromise } = require('nanoresource-promise')

const Codec = require('./lib/codec')
const {
  encodeError,
  decodeError,
  NRPC_ERR_ACTION_NAME_MISSING,
  NRPC_ERR_ACTION_RESPONSE_ERROR,
  NRPC_ERR_CLOSE,
  NRPC_ERR_NOT_OPEN
} = require('./lib/errors')

const kNanomessage = Symbol('nrpc.nanomessage')
const kOnmessage = Symbol('nrpc.onmessage')
const kSend = Symbol('nrpc.send')
const kSubscribe = Symbol('nrpc.subscribe')
const kActions = Symbol('nrpc.actions')
const kEmittery = Symbol('nrpc.emittery')
const kOnCloseDestroyStream = Symbol('nrpc.onclosedestroystream')
const kFastCheckOpen = Symbol('nrpc.fastcheckopen')

class NanomessageRPC extends NanoresourcePromise {
  constructor (socket, opts = {}) {
    super()

    const { onCloseDestroyStream = true, onError = () => {}, valueEncoding, ...nanomessageOpts } = opts

    this.socket = socket
    this.ee = new EventEmitter()
    this[kOnCloseDestroyStream] = onCloseDestroyStream
    this[kNanomessage] = nanomessage({
      ...nanomessageOpts,
      valueEncoding: new Codec(valueEncoding),
      onMessage: this[kOnmessage].bind(this),
      send: this[kSend].bind(this),
      subscribe: this[kSubscribe].bind(this)
    })
    this[kEmittery] = new Emittery()
    this[kActions] = new Map()

    this._onError = onError

    this.ee.on('error', err => {
      this._onError(err)
    })

    eos(socket, () => {
      this
        .close()
        .catch(err => process.nextTick(() => this.ee.emit('error', err)))
    })
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

  call (name, data) {
    const request = this[kNanomessage].request({ name, data })
    const cancel = request.cancel

    const promise = this[kFastCheckOpen]()
      .then(() => request)
      .then((result) => {
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

    promise.cancel = cancel
    return promise
  }

  emit (name, data) {
    assert(typeof name === 'string', 'name must be a valid string')

    return this[kFastCheckOpen]()
      .then(() => this[kNanomessage].send({ name, data, event: true }))
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

  async _open () {
    await this[kNanomessage].open()
    this.ee.emit('opened')
  }

  async _close () {
    await Promise.all([
      new Promise(resolve => {
        if (this.socket.destroyed || !this[kOnCloseDestroyStream]) return resolve()
        eos(this.socket, () => resolve())
        this.socket.destroy()
      }),
      this[kNanomessage].close()
    ])
    this.ee.emit('closed')
  }

  async [kFastCheckOpen] () {
    if (this.closed || this.closing) throw new NRPC_ERR_CLOSE()
    if (this.opening) return this.open()
    if (!this.opened) throw new NRPC_ERR_NOT_OPEN()
  }

  [kSubscribe] (ondata) {
    const reader = (data) => {
      try {
        ondata(data)
      } catch (err) {
        process.nextTick(() => this.ee.emit('error', err))
      }
    }

    this.socket.on('data', reader)
    return () => this.socket.removeListener('data', reader)
  }

  async [kSend] (chunk) {
    if (this.socket.destroyed) return
    this.socket.write(chunk)
  }

  async [kOnmessage] (message) {
    if (message.event) {
      await this[kEmittery].emit(message.name, message.data).catch((err) => {
        process.nextTick(() => this.ee.emit('error', err))
      })
      return
    }

    const action = this[kActions].get(message.name)

    if (!action) {
      return encodeError(new NRPC_ERR_ACTION_NAME_MISSING(message.name))
    }

    try {
      const result = await action(message.data)
      return { data: result }
    } catch (err) {
      if (err.isNanoerror) {
        return encodeError(err)
      }
      const rErr = new NRPC_ERR_ACTION_RESPONSE_ERROR(err.message)
      rErr.stack = err.stack || rErr.stack
      return encodeError(rErr)
    }
  }
}

module.exports = (...args) => new NanomessageRPC(...args)
module.exports.NanomessageRPC = NanomessageRPC
module.exports.errors = { NRPC_ERR_ACTION_NAME_MISSING, NRPC_ERR_ACTION_RESPONSE_ERROR, NRPC_ERR_CLOSE, NRPC_ERR_NOT_OPEN }
