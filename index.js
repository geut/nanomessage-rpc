const Emittery = require('emittery')
const eos = require('end-of-stream')
const jsonCodec = require('buffer-json-encoding')
const nanomessage = require('nanomessage')
const { encodeError, decodeError } = require('./lib/errors')

const kSocket = Symbol('rpc.socket')
const kNanomessage = Symbol('rpc.nanomessage')
const kOnmessage = Symbol('rpc.onmessage')
const kSend = Symbol('rpc.send')
const kSubscribe = Symbol('rpc.subscribe')
const kActions = Symbol('rpc.actions')
const kEmittery = Symbol('rpc.emittery')

class RPC {
  constructor (socket, opts = {}) {
    const { codec = jsonCodec } = opts

    this[kSocket] = socket
    this[kNanomessage] = nanomessage({
      codec,
      ...opts,
      onMessage: this[kOnmessage].bind(this),
      send: this[kSend].bind(this),
      subscribe: this[kSubscribe].bind(this)
    })
    this[kEmittery] = new Emittery()
    this[kActions] = new Map()

    eos(socket, () => {
      this.close().catch(err => {
        process.nextTick(() => {
          throw err
        })
      })
    })
  }

  get socket () {
    return this[kSocket]
  }

  open () {
    return this[kNanomessage].open()
  }

  close () {
    return Promise.all([
      new Promise(resolve => {
        if (this[kSocket].destroyed) return resolve()
        eos(this[kSocket], () => resolve())
        this[kSocket].destroy()
      }),
      this[kNanomessage].close()
    ])
  }

  action (name, handler) {
    this[kActions].set(name, handler)
    return this
  }

  actions (actions) {
    Object.keys(actions).forEach(name => this.action(name, actions[name]))
    return this
  }

  async call (name, data) {
    const result = await this[kNanomessage].request({ action: name, data })

    if (result.err) {
      const ErrorDecoded = decodeError(result.code, result.message)
      throw new ErrorDecoded(...result.args)
    }

    return result.data
  }

  emit (name, data) {
    return this[kNanomessage].send({ event: name, data })
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

  [kSubscribe] (ondata) {
    const reader = async (data) => {
      try {
        await this[kEmittery].emit('rpc-data', data)
        await ondata(data)
      } catch (err) {
        await this[kEmittery].emit('rpc-subscribe-error', err)
      }
    }

    this[kSocket].on('data', reader)
    return () => this[kSocket].removeListener('data', reader)
  }

  async [kSend] (chunk) {
    if (this[kSocket].destroyed) return
    this[kSocket].write(chunk)
  }

  async [kOnmessage] (message) {
    if (message.event) {
      await this[kEmittery].emit(message.event, message.data)
      return
    }

    const action = this[kActions].get(message.action)

    if (!action) {
      return encodeError('ERR_ACTION_NAME_MISSING', 'missing action for: %s', message.action)
    }

    try {
      const result = await action(message.data)
      return { action: message.action, data: result }
    } catch (err) {
      return encodeError(err.code || 'ERR_ACTION_RESPONSE_ERROR', err.message)
    }
  }
}

module.exports = (...args) => new RPC(...args)
module.exports.RPC = RPC
module.exports.errors = require('./lib/errors')
