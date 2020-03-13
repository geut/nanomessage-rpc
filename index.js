const Emittery = require('emittery')
const eos = require('end-of-stream')
const jsonCodec = require('buffer-json-encoding')
const nanomessage = require('nanomessage')
const assert = require('nanocustomassert')
const { encodeError, decodeError, ERR_ACTION_NAME_MISSING, ERR_ACTION_RESPONSE_ERROR } = require('./lib/errors')

const kNanomessage = Symbol('rpc.nanomessage')
const kOnmessage = Symbol('rpc.onmessage')
const kSend = Symbol('rpc.send')
const kSubscribe = Symbol('rpc.subscribe')
const kActions = Symbol('rpc.actions')
const kEmittery = Symbol('rpc.emittery')

class NanomessageRPC {
  constructor (socket, opts = {}) {
    const { codec = jsonCodec } = opts

    this.socket = socket
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

  open () {
    return this[kNanomessage].open()
  }

  async close () {
    await Promise.all([
      new Promise(resolve => {
        if (this.socket.destroyed) return resolve()
        eos(this.socket, () => resolve())
        this.socket.destroy()
      }),
      this[kNanomessage].close()
    ])
    process.nextTick(() => this[kEmittery].emit('rpc-closed'))
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
      const ErrorDecoded = decodeError(result.code, result.unformatMessage)
      throw new ErrorDecoded(...result.args)
    }

    return result.data
  }

  emit (name, data) {
    assert(typeof name === 'string', 'name must be a valid string')

    if (name.startsWith('rpc-')) {
      return this[kEmittery].emit(name, data)
    } else {
      return this[kNanomessage].send({ event: name, data })
    }
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
        await this[kEmittery].emit('rpc-error', err)
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
      await this[kEmittery].emit(message.event, message.data)
      return
    }

    const action = this[kActions].get(message.action)

    if (!action) {
      return encodeError(new ERR_ACTION_NAME_MISSING(message.action))
    }

    try {
      const result = await action(message.data)
      return { action: message.action, data: result }
    } catch (err) {
      if (err.isNanoerror) {
        return encodeError(err)
      }
      return encodeError(new ERR_ACTION_RESPONSE_ERROR(err.message))
    }
  }
}

module.exports = (...args) => new NanomessageRPC(...args)
module.exports.RPC = NanomessageRPC
module.exports.errors = { ERR_ACTION_NAME_MISSING, ERR_ACTION_RESPONSE_ERROR }
