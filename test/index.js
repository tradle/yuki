
const co = require('co').wrap
const test = require('tape')
const { constants } = require('@tradle/engine')
const { TYPE, SIG } = constants
const users = require('./users')
const createLiteNode = require('../').node

test('send/receive', co(function* (t) {
  try {
    const [alice, bob] = users.slice(2).map(createLiteNode)
    connect(alice, bob)

    const object = {
      [TYPE]: 'tradle.SimpleMessage',
      message: 'hey'
    }

    bob.hook('receive', function ({ message, from }) {
      t.ok(message.object[SIG])
      object[SIG] = message.object[SIG]
      t.same(object, message.object)
    })

    yield alice.send({
      to: {
        pubKey: bob.sigPubKey
      },
      object
    })

    t.end()
  } catch (err) {
    t.error(err)
  }
}))

function connect (a, b) {
  a._send = function ({ to, message }) {
    return b.receive({ message })
  }

  b._send = function ({ to, message }) {
    return a.receive({ message })
  }
}
