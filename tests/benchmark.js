import bench from 'nanobench'

import create from './create.js'

bench('execute 10000 action calls x 2 peers', async function (b) {
  const { alice, bob } = create()
  await alice.open()
  await bob.open()

  alice.actions({
    ping: () => null
  })

  bob.actions({
    ping: () => null
  })

  b.start()

  await Promise.all([
    Promise.all([...Array(10000).keys()].map(i => {
      return alice.call('ping')
    })),
    Promise.all([...Array(10000).keys()].map(i => {
      return bob.call('ping')
    }))
  ])

  b.end()
})

bench('execute 10000 an event x 2 peers', async function (b) {
  let aliceTotal = 0
  let bobTotal = 0
  let done = null
  const waitFor = new Promise(resolve => {
    done = resolve
  })
  const { alice, bob } = create()
  await alice.open()
  await bob.open()

  alice.on('ping', () => {
    aliceTotal++
    if (aliceTotal === 10000 && bobTotal === 10000) done()
  })

  bob.on('ping', () => {
    bobTotal++
    if (aliceTotal === 10000 && bobTotal === 10000) done()
  })

  b.start()

  await Promise.all([
    Promise.all([...Array(10000).keys()].map(i => {
      return alice.emit('ping')
    })),
    Promise.all([...Array(10000).keys()].map(i => {
      return bob.emit('ping')
    }))
  ])
  await waitFor
  b.end()
})
