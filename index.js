const Emittery = require('emittery')
const { Transform } = require('streamx')
const eos = require('end-of-stream')
const jsonCodec = require('buffer-json-encoding')
const nanomessage = require('nanomessage')
const assert = require('nanocustomassert')
const { NanoresourcePromise } = require('nanoresource-promise')
const { encodeError, decodeError, ERR_ACTION_NAME_MISSING, ERR_ACTION_RESPONSE_ERROR } = require('./lib/errors')

const kNanomessage = Symbol('rpc.nanomessage')
const kOnmessage = Symbol('rpc.onmessage')
const kSend = Symbol('rpc.send')
const kSubscribe = Symbol('rpc.subscribe')
const kActions = Symbol('rpc.actions')
const kEmittery = Symbol('rpc.emittery')
const kStream = Symbol('rpc.stream')

class PassThrough extends Transform {
  _transform (data, callback) {
    callback(null, data)
  }
}

function createStreamIterator (socket, onCloseDestroyStream) {
  const stream = new PassThrough({
    destroy (cb) {
      if (onCloseDestroyStream) {
        !socket.destroyed && socket.destroy(this._readableState.error || this._writableState.error)
      } else {
        socket.unpipe(this)
      }
      cb()
    }
  })

  socket.pipe(stream)

  eos(socket, (err) => {
    stream.destroy(err)
  })

  stream.send = data => socket.write(data)

  return stream
}

class NanomessageRPC extends NanoresourcePromise {
  constructor (socket, opts = {}) {
    super()

    const { valueEncoding = jsonCodec, onCloseDestroyStream = true } = opts

    this[kStream] = createStreamIterator(socket, onCloseDestroyStream)
    this[kNanomessage] = nanomessage({
      valueEncoding,
      ...opts,
      onMessage: this[kOnmessage].bind(this),
      send: this[kSend].bind(this),
      subscribe: this[kSubscribe].bind(this)
    })
    this[kEmittery] = new Emittery()
    this[kActions] = new Map()

    this[kStream].once('close', () => {
      this
        .close()
        .catch(err => this[kEmittery].emit('rpc-error', err))
        .catch(() => {})
    })
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
    const request = this[kNanomessage].request({ action: name, data })
    const cancel = request.cancel

    const promise = this.open()
      .then(() => request)
      .then((result) => {
        if (result.err) {
          const ErrorDecoded = decodeError(result.code, result.unformatMessage)
          throw new ErrorDecoded(...result.args)
        } else {
          return result.data
        }
      })

    promise.cancel = cancel
    return promise
  }

  async emit (name, data) {
    assert(typeof name === 'string' && !name.startsWith('rpc-'), 'name must be a valid string and should not start with "rpc-"')

    await this.open()

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

  _open () {
    return this[kNanomessage].open()
  }

  async _close () {
    await Promise.all([
      new Promise(resolve => {
        if (this[kStream].destroyed) return resolve()
        eos(this[kStream], () => resolve())
        this[kStream].destroy()
      }),
      this[kNanomessage].close()
    ])
    return this[kEmittery].emit('rpc-closed')
  }

  [kSubscribe] (ondata) {
    let done = false
    ;(async () => {
      for await (const data of this[kStream]) {
        try {
          if (done) break
          await this[kEmittery].emit('rpc-data', data)
          if (done) break
          await ondata(data)
        } catch (err) {
          await this[kEmittery].emit('rpc-error', err)
        }
      }
    })().catch(() => {})

    return () => {
      done = true
    }
  }

  async [kSend] (chunk) {
    if (this[kStream].destroyed) return
    this[kStream].send(chunk)
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
module.exports.NanomessageRPC = NanomessageRPC
module.exports.errors = { ERR_ACTION_NAME_MISSING, ERR_ACTION_RESPONSE_ERROR }
