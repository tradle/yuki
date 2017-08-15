const co = require('co').wrap
const promisify = require('pify')
const changesFeed = require('changes-feed')
const bindAll = require('bindall')
const collect = promisify(require('stream-collector'))
const pump = require('pump')
const map = require('map-stream')
const { utils, constants } = require('@tradle/engine')
const { TYPE, SEQ } = constants

module.exports = History

function History (opts) {
  if (!(this instanceof History)) return new History(opts)

  bindAll(this)

  const { keeper, db } = opts
  this.db = promisify(db, {
    include: ['get', 'put', 'del', 'batch']
  })

  this._feed = changesFeed(db, { start: 0 })
  this._append = promisify(this._feed.append.bind(this._feed))
  this.length = promisify(this._feed.count.bind(this._feed))
  this._get = promisify(keeper.get.bind(keeper))
}

History.prototype.append = function ({ message, inbound }) {
  return this._append({
    inbound: !!inbound,
    seq: message[SEQ],
    type: message.object[TYPE],
    link: utils.hexLink(message.object)
  })
}

History.prototype.dump = function (body=true) {
  const stream = this._feed.createReadStream({ keys: false })
  return collect(body ? this._withBodies(stream) : stream)
}

History.prototype.head = co(function* (n, body=true) {
  const count = yield this.length()
  const stream = this._feed.createReadStream({
    keys: false,
    since: count - n - 1
  })

  return collect(body ? this._withBodies(stream) : stream)
})

History.prototype._withBodies = function _withBodies (stream) {
  return pump(
    stream,
    map(this._addBody)
  )
}

History.prototype._addBody = co(function* (data, cb) {
  try {
    data.object = yield this._get(data.link)
  } catch (err) {
    cb(err)
    return
  }

  cb(null, data)
})
