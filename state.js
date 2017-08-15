const co = require('co').wrap
const dotProp = require('dot-prop')
const { cachifyPromiser } = require('./utils')

module.exports = State

function State ({ db, key }) {
  this.db = db
  this.key = key
  this._init = cachifyPromiser(co(function* () {
    this.state = yield db.get(key)
  }))
}

State.prototype.set = co(function* (key, value) {
  yield this._init()
  dotProp.set(this.state, key, value)
  yield this.db.put(this.key, this.state)
})

State.prototype.get = co(function* (key, value) {
  yield this._init()
  return key ? dotProp.get(this.state, key) : this.state
})
