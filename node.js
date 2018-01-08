
const co = require('co').wrap
const _ = require('lodash')
const promisify = require('pify')
const {
  utils,
  node,
  constants,
  protocol,
  typeforce,
  types
} = require('@tradle/engine')

const { TYPE, TYPES, SIG, PERMALINK } = constants
const { MESSAGE } = TYPES
const sign = promisify(protocol.sign)

function Lite ({ link, identity, keys }) {
  if (!(this instanceof Lite)) return new Lite({ identity, keys })

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
}

module.exports = Lite
const proto = Lite.prototype

proto.sign = function ({ object }) {
  object = _.cloneDeep(object)
  delete object[SIG]
  return sign({
    object,
    author: this._authorOpts
  })
}

proto.send = co(function* ({ to, object, other={} }) {
  typeforce({
    pubKey: types.ecPubKey
  }, to)

  if (!object[SIG]) {
    const signed = yield this.sign({ object })
    object = signed.object
  }

  const message = utils.extend({
    [TYPE]: MESSAGE,
    recipientPubKey: to.pubKey,
    object
  }, other)

  const signedMessage = yield this.sign({ object: message })
  yield this._send({
    to,
    message: signedMessage.object
  })

  return signedMessage.object
})

proto._send = function () {
  throw new Error('override me')
}
