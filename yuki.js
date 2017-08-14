const co = require('co').wrap
const debug = require('debug')(require('./package.json').name)
const clone = require('clone')
const bindAll = require('bindall')
const sub = require('subleveldown')
const tradle = require('@tradle/engine')
const { utils, constants } = tradle
const { SIG } = constants
const createHistory = require('./history')
const createNode = require('./node')

module.exports = Yuki

function Yuki (opts) {
  if (!(this instanceof Yuki)) return new Yuki(opts)

  const { counterparty, db, link, identity, keys } = opts
  bindAll(this)

  this.counterparty = counterparty
  this.node = createNode({
    link,
    identity,
    keys
  })

  this.node._send = function ({ message }) {
    return counterparty.receive(message, {
      permalink: utils.getLinks(identity).permalink
    })
  }

  this.permalink = this.node.permalink
  this.history = createHistory({
    keeper: counterparty.keeper,
    db: sub(db, 'h', { valueEncoding: 'json' })
  })

  this.node.hook('receive', ({ message }) => {
    return this.history.append({
      message,
      inbound: true
    })
  })

  this.node.hook('receive', this.receive)
}

const proto = Yuki.prototype

proto.send = co(function* ({ object }) {
  const message = yield this.node.send({
    to: {
      pubKey: this.counterparty.sigPubKey
    },
    object
  })

  yield this.history.append(message)
  return message
})

proto.receive = co(function* ({ message }) {
  debug('received', message)
  const echo = clone(message.object)
  delete echo[SIG]
  yield this.send({ object: echo })
})
