# nanomessage-rpc (aka nrpc)

![Test Status](https://github.com/geut/nanomessage-rpc/actions/workflows/test.yml/badge.svg)
[![Coverage](https://raw.githubusercontent.com/geut/nanomessage-rpc/gh-pages/badges/coverage.svg?raw=true)](https://geut.github.io/nanomessage-rpc/)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Tiny :hatched_chick: RPC on top of nanomessage

## <a name="install"></a> Install

```
$ npm install nanomessage-rpc
```

## <a name="usage"></a> Usage

```javascript
import { NanomessageRPC } from 'nanomessage-rpc'

;(async () => {
  const rpc = new NanomessageRPC({
    send(buf) {
      // implement how to send the message
    },
    subscribe(next) {
      // subscribe for incoming messages
    }
  })

  await rpc
    .action('sum', ({ a, b }) => a + b)
    .action('subtract', ({ a, b }) => a - b)
    .open()

  // from the other rpc socket side
  const result = await rpc.call('sum', { a: 2, b: 2 }) // 4
})()
```

We provide a socket helper:

```javascript
import { NanomessageRPC, useSocket } from 'nanomessage-rpc'

;(async () => {
  const rpc = new NanomessageRPC({ ...useSocket(socket) })

  // ...
})()
```

Also it has an [EventEmitter2](https://github.com/EventEmitter2/EventEmitter2) instance to emit events through the socket.

```javascript
;(async () => {
  const rpc = new NanomessageRPC(socket, opts)

  await rpc.open()

  rpc.on('ping', () => {
    console.log('ping')
  })

  // from the other rpc socket side
  const result = await rpc.emitAsync('ping') // 4
})()
```

And it has support for [nanoerror](https://github.com/geut/nanoerror).

```javascript
import { NanomessageRPC } from 'nanomessage-rpc'
import nanoerror from 'nanoerror'

const BAD_REQUEST = nanoerror('BAD_REQUEST', 'the request %s is wrong')

;(async () => {
  const rpc = new NanomessageRPC(socket, opts)

  await rpc
    .action('badrequest', () => {
      throw new BAD_REQUEST(1)
    })
    .open()

  // from the other rpc socket side
  try {
    const result = await rpc.call('badrequest', { a: 2, b: 2 }) // 4
  } catch (err) {
    // will throw BAD_REQUEST: the request 1 is wrong
  }
})()
```

## API

#### `const rpc = new NanomessageRPC(options)`

Create a new nanomessage-rpc.

Options include:

- `send: (buf: Buffer) => (Promise|undefined)`: Define a hook to specify how to send the data. `Required`.
- `subscribe: (next: function) => UnsubscribeFunction`: Define a handler to listen for incoming messages.
- `timeout: 10000`: Time (ms) to wait for the response of a request.
- `concurrency: { incoming: 256, outgoing: 256 }`: Defines how many requests do you want to run in concurrent.
- `valueEncoding: msgpackr`: Defines an [abstract-encoding](https://github.com/mafintosh/abstract-encoding) to encode/decode messages in nanomessage.

#### `rpc.open() => Promise`

Opens nanomessage and start listening for incoming data.

#### `rpc.close() => Promise`

Closes nanomessage and unsubscribe from incoming data.

#### `rpc.action(actionName, handler)`

Defines a rpc action and handler for incoming requests.

- `actionName: string`: Name of the action.
- `handler: function`: Handler, could be `async`.

#### `rpc.actions(actions)`

Shortcut to define multiple actions.

- `actions: { actionName: handler, ... }`: List of actions.

#### `rpc.call(actionName, data, [opts]) => Promise<Response>`

Call an action an wait for the response.

- `actionName: string`: Action name.
- `data: (Buffer|Object|String)`: Request data.
- `opts.timeout: number`: Define a custom timeout for the current request.
- `opts.signal: AbortSignal`: Set an abort signal object to cancel the request.

### Events

#### `rpc.emit(eventName, data, [opts])`

Emit an event in the remote side.

- `actionName: string`: Event name.
- `data: (Buffer|Object|String)`: Event data.

#### `rpc.emitAsync(eventName, data, [opts]) -> Promise`

- `actionName: string`: Event name.
- `data: (Buffer|Object|String)`: Event data.
- `opts.timeout: number`: Define a custom timeout for the current request. Use timeout = 0 to not wait for a response.
- `opts.signal: AbortSignal`: Set an abort signal object to cancel the request.

Emit an event in the remote side and wait for a response.

#### `rpc.on(eventName, handler) => unsubscribe`

Subscribe to a RPC event.

Returns an unsubscribe method.

#### `rpc.once(eventName)`

Subscribe to a RPC event only once. It will be unsubscribed after the first event.

#### `rpc.waitFor(eventName) -> Promise`

Subscribe to a RPC event only once and return a `Promise` to wait for the event.

> Alternative: NanomessageRPC.once(rpc, eventName)

#### `rpc.off(eventName)`

Remove a RPC event subscription.
```

### System events

You can listen for internal events:

- `on('nrpc.open', () => {})`: When the RPC was opened.
- `on('nrpc.opening', () => {})`: When the RPC is opening.
- `on('nrpc.close', () => {})`: When the RPC was closed.
- `on('nrpc.closing', () => {})`: When the RPC is closing.
- `on('nrpc.message', (message, info: RequestInfo) => {})`: When it comes a new message.
- `on('nrpc.error-message', (err, info: RequestInfo) => {})`: When the internal RPC gets an error message.
- `on('nrpc.error-subscribe', (err) => {})`: When the internal RPC gets an error subscription.
- `on('nrpc.error-socket', (err) => {})`: When the internal RPC gets an error socket.
- `on('nrpc.error*', (err) => {})`: Listen for all RPC errors.

## <a name="issues"></a> Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/nanomessage-rpc/issues). Please specify your OS and the actions to reproduce it.

## <a name="contribute"></a> Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/nanomessage-rpc/blob/main/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project
