
const co = require('co').wrap
const test = require('tape')
const memdb = require('memdb')
const omit = require('object.omit')
const tradle = require('@tradle/engine')
const mergeModels = require('@tradle/merge-models')
const buildResource = require('@tradle/build-resource')
const { TYPE, SIG } = tradle.constants
const createLiteNode = require('../').node
const createYuki = require('../').yuki
const models = require('../models')
const echo = require('../echo')
const onboard = require('../onboard')
const { loudCo } = require('../utils')
const users = require('./users')

// test('send/receive', loudCo(function* (t) {
//   const [alice, bob] = users.slice(2).map(createLiteNode)
//   connect(alice, bob)

//   const object = {
//     [TYPE]: 'tradle.SimpleMessage',
//     message: 'hey'
//   }

//   bob.hook('receive', function ({ message, from }) {
//     t.ok(message.object[SIG])
//     object[SIG] = message.object[SIG]
//     t.same(object, message.object)
//   })

//   yield alice.send({
//     to: {
//       pubKey: bob.sigPubKey
//     },
//     object
//   })

//   t.end()
// }))

test('yuki', loudCo(function* (t) {
  const alice = createLiteNode(users[0])
  const { identity, keys } = users[1]

  const object = {
    [TYPE]: 'tradle.SimpleMessage',
    message: 'hey'
  }

  const objects = {}

  let aliceReceived
  const aliceReceivedPromise = new Promise(resolve => {
    aliceReceived = resolve
  })

  const yuki = createYuki({
    identity,
    keys,
    counterparty: {
      sigPubKey: alice.sigPubKey,
      keeper: {
        get: function (link, cb) {
          if (link in objects) return cb(null, objects[link])

          cb(new Error('NotFound'))
        }
      },
      receive: function (message, from) {
        objects[tradle.utils.hexLink(message.object)] = message.object
        t.ok(message.object[SIG])
        object[SIG] = message.object[SIG]
        t.same(object, message.object)
        aliceReceived({ message })
        return aliceReceivedPromise
      }
    },
    db: memdb()
  })

  yuki.use(echo())
  yuki.hook('receive', function ({ message }) {
    objects[tradle.utils.hexLink(message.object)] = message.object
  })

  connect(alice, yuki)
  // yuki.receive = function ({ message }) {
  //   t.ok(message.object[SIG])
  //   object[SIG] = message.object[SIG]
  //   t.same(object, message.object)
  // }

  const yukiReceivedPromise = new Promise(resolve => {
    yuki.once('message', resolve)
  })

  yield alice.send({
    to: {
      pubKey: yuki.sigPubKey
    },
    object
  })

  const [forYuki, forAlice] = yield [yukiReceivedPromise, aliceReceivedPromise]
  const messages = yield yuki.history.dump()
  t.notSame(forYuki.message.object, forAlice.message.object)
  t.same(omit(forYuki.object, [SIG]), omit(forAlice.object, [SIG]))
  t.same(messages[0].object, forYuki.message.object)
  t.same(messages[1].object, forAlice.message.object)

  const head = yield yuki.history.head(1)
  t.equal(head.length, 1)
  t.same(head[0].object, forAlice.message.object)
  t.end()
}))

// test('onboard', function (t) {
//   const alice = createLiteNode(users[0])
//   const { identity, keys } = users[1]
//   const objects = {}
//   const yuki = createYuki({
//     identity,
//     keys,
//     counterparty: {
//       sigPubKey: alice.sigPubKey,
//       keeper: {
//         get: function (link, cb) {
//           if (link in objects) return cb(null, objects[link])

//           cb(new Error('NotFound'))
//         }
//       },
//       receive: function (message, from) {
//         return Promise.resolve()
//       }
//     },
//     db: memdb()
//   })

//   const onboardAPI = yuki.use(onboard())
//   yuki.hook('receive', function ({ message }) {
//     objects[tradle.utils.hexLink(message.object)] = message.object
//   })

//   const photoID = buildResource.fake({
//     models,
//     model: models['tradle.PhotoID'],
//     signed: true
//   })

//   const v = onboardAPI.createVerificationForPhotoID(photoID)
//   console.log(JSON.stringify(v, null, 2))
//   t.end()
// })

function connect (a, b) {
  a._send = function ({ to, message }) {
    return b.receive({ message })
  }

  b._send = function ({ to, message }) {
    return a.receive({ message })
  }
}
