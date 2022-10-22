import { Bench } from 'tinybench'

import create from './create.js'
import { createPackr } from '../src/index.js'

const context = {
  basic: async () => {
    const { alice, bob } = create()

    alice.actions({
      ping: () => 'pong'
    })

    bob.actions({
      ping: () => 'pong'
    })

    alice.on('ping', () => {
      return 'pong'
    })

    bob.on('ping', () => {
      return 'pong'
    })

    await alice.open()
    await bob.open()

    return { alice, bob }
  },
  sharedStructures: async () => {
    const packr = createPackr({
      structures: []
    })

    const valueEncoding = {
      encode: (data) => packr.pack(data),
      decode: (data) => packr.unpack(data)
    }

    const { alice, bob } = create({
      valueEncoding
    }, {
      valueEncoding
    })

    alice.actions({
      ping: () => null
    })

    bob.actions({
      ping: () => null
    })

    await alice.open()

    await bob.open()

    return { alice, bob }
  }
}

const bench = new Bench({
  time: 0,
  iterations: 10_000,
  setup: async (task) => {
    if (task.name.includes('sharedStructures')) {
      task.context = await context.sharedStructures()
    } else {
      task.context = await context.basic()
    }
  }
})

bench
  .add('execute 10000 action calls x 2 peers', async function () {
    const { alice } = this.context
    const res = await alice.call('ping')
    if (res !== 'pong') throw new Error('wrong')
  })
  .add('execute 10000 ephemeral messages x 2 peers', async function () {
    const { alice } = this.context
    const [res] = await alice.emitAsync('ping')
    if (res !== 'pong') throw new Error('wrong')
  })
  .add('execute 10000 requests x 2 peers using sharedStructures', async function () {
    const { alice } = this.context
    const res = await alice.call('ping')
    if (res !== 'pong') throw new Error('wrong')
  })

await bench.run()

console.table(
  bench.tasks.map(({ name, result }) => (result
    ? ({
        'Task Name': name,
        'ops/sec': parseInt(result.hz, 10),
        'Total Time (ms)': Math.round(result.totalTime),
        'Average Time (ns)': Math.round(result.mean * 1000 * 1000),
        Margin: `\xb1${result.rme.toFixed(2)}%`,
        Samples: result.samples.length
      })
    : null))
)
