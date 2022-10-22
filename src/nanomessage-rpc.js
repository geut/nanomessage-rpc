import { Nanomessage } from 'nanomessage'
import assert from 'nanocustomassert'
import EventEmitter2 from 'eventemitter2'

import codec from './codec.js'
import {
  NRPC_ERR_NAME_MISSING,
  NRPC_ERR_REQUEST_CANCELED,
  NRPC_ERR_INTERNAL_EVENT
} from './errors.js'

const kNanomessage = Symbol('nrpc.nanomessage')
const kOnmessage = Symbol('nrpc.onmessage')
const kSubscribe = Symbol('nrpc.subscribe')
const kActions = Symbol('nrpc.actions')
const kCreateRequest = Symbol('nrpc.createrequest')

const noop = () => {}

export const EVENTS = {
  open: 'nrpc.open',
  opened: 'nrpc.opened',
  close: 'nrpc.close',
  closed: 'nrpc.closed',
  message: 'nrpc.message',
  errorMessage: 'nrpc.error-message',
  errorSubscribe: 'nrpc.error-subscribe',
  errorSocket: 'nrpc.error-socket'
}

const EVENTS_INVERSE = Object.keys(EVENTS).reduce((events, prop) => {
  events[EVENTS[prop]] = true
  return events
}, {})

export class NanomessageRPC extends EventEmitter2 {
  constructor (opts = {}) {
    super()

    const { valueEncoding, send, subscribe, open = noop, close = noop, timeout, ...nanomessageOpts } = opts

    assert(send, 'send is required')

    this[kOnmessage] = this[kOnmessage].bind(this)

    this[kNanomessage] = new Nanomessage({
      ...nanomessageOpts,
      timeout: timeout || 10000,
      send: send.bind(this),
      open: open.bind(this),
      close: close.bind(this),
      onMessage: this[kOnmessage],
      subscribe: subscribe && this[kSubscribe](subscribe),
      valueEncoding: codec(valueEncoding)
    })

    this[kActions] = new Map()

    this[kNanomessage].on('open', async () => super.emitAsync(EVENTS.open))
    this[kNanomessage].on('opened', async () => super.emitAsync(EVENTS.opened))
    this[kNanomessage].on('close', async () => super.emitAsync(EVENTS.close))
    this[kNanomessage].on('closed', async () => super.emitAsync(EVENTS.closed))
    this[kNanomessage].on('error-message', (...args) => super.emit(EVENTS.errorMessage, ...args))
  }

  get opened () {
    return this[kNanomessage].opened
  }

  get opening () {
    return this[kNanomessage].opening
  }

  get closed () {
    return this[kNanomessage].closed
  }

  get closing () {
    return this[kNanomessage].closing
  }

  get actives () {
    return this[kNanomessage].actives
  }

  get requests () {
    return this[kNanomessage].requests
  }

  get inflightRequests () {
    return this[kNanomessage].inflightRequests
  }

  get requestTimeout () {
    return this[kNanomessage].requestTimeout
  }

  get concurrency () {
    return this[kNanomessage].concurrency
  }

  get nanomessage () {
    return this[kNanomessage]
  }

  get registeredActions () {
    const obj = {}
    this[kActions].forEach((handler, key) => {
      obj[key] = handler
    })
    return obj
  }

  setRequestTimeout (timeout) {
    this[kNanomessage].setRequestTimeout(timeout)
  }

  setConcurrency (concurrency) {
    this[kNanomessage].setConcurrency(concurrency)
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
    if (EVENTS_INVERSE[name]) throw new NRPC_ERR_INTERNAL_EVENT(name)
    this[kCreateRequest]({ name, data, event: true }, { ...opts, timeout: false }).catch(() => {})
  }

  async emitAsync (name, data, opts = {}) {
    if (EVENTS_INVERSE[name]) throw new NRPC_ERR_INTERNAL_EVENT(name)
    return this[kCreateRequest]({ name, data, event: true }, { ...opts })
  }

  async processIncomingMessage (...args) {
    return this[kNanomessage].processIncomingMessage(...args)
  }

  setMessageHandler (handler) {
    this._onMessage = handler
  }

  async _onMessage (message, info) {
    return message
  }

  async open () {
    await this[kNanomessage].open()
  }

  async close () {
    await this[kNanomessage].close()
  }

  [kSubscribe] (subscribe) {
    return (next) => {
      subscribe((data) => {
        next(data).catch(error => super.emit(EVENTS.errorSubscribe, error))
      })
    }
  }

  async [kCreateRequest] (packet, { timeout = this.requestTimeout, signal, context }) {
    assert(packet.name && typeof packet.name === 'string', 'name is required')

    if (packet.event && !timeout) {
      return this[kNanomessage].send(packet, { context })
    }

    const onCancel = (aborted) => new NRPC_ERR_REQUEST_CANCELED({ name: packet.name, event: packet.event, timeout, context, aborted })

    const res = await this[kNanomessage].request(packet, { timeout, signal, onCancel, context })
    return res.data
  }

  async [kOnmessage] (message, info) {
    try {
      super.emit(EVENTS.message, message, info)

      message = await this._onMessage(message, info)

      let data
      if (message.event) {
        if (info.ephemeral) {
          super.emit(message.name, message.data, message, info)
        } else {
          data = await super.emitAsync(message.name, message.data, message, info)
        }
        return { data }
      }

      const action = this[kActions].get(message.name)
      if (!action) throw new NRPC_ERR_NAME_MISSING(message.name)

      data = await action(message.data, message, info)
      return { data }
    } catch (err) {
      err.metadata = {
        name: message.name,
        event: message.event
      }
      throw err
    }
  }
}
