const { EventEmitter } = require('events')
const inherits = require('inherits')
const co = require('co').wrap
const debug = require('debug')(require('./package.json').name)
const clone = require('clone')
const bindAll = require('bindall')
const sub = require('subleveldown')
const createHooks = require('event-hooks')
const tradle = require('@tradle/engine')
const { utils, constants } = tradle
const { SIG } = constants
const createHistory = require('./history')
const createNode = require('./node')

module.exports = Yuki

function Yuki (opts) {
  if (!(this instanceof Yuki)) return new Yuki(opts)

  EventEmitter.call(this)

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
  this.sigPubKey = this.node.sigPubKey
  this.history = createHistory({
    keeper: counterparty.keeper,
    db: sub(db, 'h', { valueEncoding: 'json' })
  })

  this.hooks = createHooks()
  this.hook = this.hooks.hook.bind(this.hooks)
  this.hook('receive', ({ message }) => {
    return this.history.append({
      message,
      inbound: true
    })
  })
}

const proto = Yuki.prototype
inherits(Yuki, EventEmitter)

proto.send = co(function* (opts) {
  const { object } = opts
  const message = yield this.node.send({
    to: {
      pubKey: this.counterparty.sigPubKey
    },
    object
  })

  yield this.hooks.fire('send', message)
  yield this.history.append({ message })
  return message
})

proto.receive = co(function* (...args) {
  yield this.hooks.fire('receive', ...args)
  this.emit('message', ...args)
})

proto.use = function (strategy, opts) {
  strategy(this, opts)
}
