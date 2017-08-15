const { EventEmitter } = require('events')
const inherits = require('inherits')
const co = require('co').wrap
const promisify = require('pify')
const debug = require('debug')(require('./package.json').name)
const clone = require('clone')
const bindAll = require('bindall')
const sub = require('subleveldown')
const createHooks = require('event-hooks')
const createPromiseQueue = require('ya-promise-queue')
const tradle = require('@tradle/engine')
const { utils, constants, typeforce, types, protocol } = tradle
const sign = promisify(protocol.sign)
const { TYPE, TYPES, SIG, PERMALINK } = constants
const { MESSAGE } = TYPES
const createHistory = require('./history')

module.exports = Yuki

function Yuki (opts) {
  if (!(this instanceof Yuki)) return new Yuki(opts)

  EventEmitter.call(this)
  bindAll(this)

  const { counterparty, db, link, identity, keys } = opts
  this.counterparty = counterparty
  this.identity = identity
  this.keys = keys.map(key => utils.importKey(key))
  this.sigKey = utils.sigKey(this.keys)
  this.sigPubKey = utils.toECKeyObj(this.sigKey.toJSON())
  this.identityVersioningKey = utils.identityVersioningKey(this.keys)
  this.identityVersioningPubKey = utils.identityVersioningPubKey(this.identity)
  this.link = link || utils.hexLink(this.identity)
  this.permalink = this.identity[PERMALINK] || this.link
  this.shortlink = utils.shortlink(this.permalink)
  this._authorOpts = {
    sigPubKey: this.sigPubKey,
    sign: (data, cb) => {
      this.sigKey.sign(data, cb)
    }
  }

  this.history = createHistory({
    keeper: counterparty.keeper,
    db: sub(db, 'h', { valueEncoding: 'json' })
  })

  this.storage = promisify(sub(db, 's', { valueEncoding: 'json' }), {
    include: ['get', 'put', 'del', 'batch', 'close']
  })

  this.hooks = createHooks()
  this.hook = this.hooks.hook.bind(this.hooks)
  this.hook('receive', ({ message }) => {
    return this.history.append({
      message,
      inbound: true
    })
  })

  this.receiveQueue = createPromiseQueue()
}

inherits(Yuki, EventEmitter)
const proto = Yuki.prototype

proto.sign = function ({ object }) {
  object = clone(object)
  delete object[SIG]
  return sign({
    object,
    author: this._authorOpts
  })
}

proto.send = co(function* ({ object, other={} }) {
  if (typeof object === 'string') {
    object = {
      [TYPE]: 'tradle.SimpleMessage',
      message: object
    }
  }

  if (!object[SIG]) {
    const signed = yield this.sign({ object })
    object = signed.object
  }

  const message = utils.extend({
    [TYPE]: MESSAGE,
    recipientPubKey: this.counterparty.sigPubKey,
    object
  }, other)

  const result = yield this.sign({ object: message })
  const signedMessage = result.object
  yield this.counterparty.receive(signedMessage, {
    permalink: this.permalink
  })

  yield this.hooks.fire('send', signedMessage)
  yield this.history.append({ message: signedMessage })
  return signedMessage
})

proto.receive = function (...args) {
  const self = this
  return this.receiveQueue.push(co(function* () {
    try {
      yield self.hooks.fire('receive', ...args)
    } catch (err) {
      debug('failed to process message', ...args)
      return
    }

    self.emit('message', ...args)
  }))
}

proto.use = function (strategy, opts) {
  return strategy(this, opts)
}
