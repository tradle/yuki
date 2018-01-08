const co = require('co').wrap
const _ = require('lodash')
const { cachifyPromiser } = require('./utils')

module.exports = State

function State ({ db, key }) {
  if (!(this instanceof State)) {
    return new State({ db, key })
  }

  this.db = db
  this.key = key
  this._init = cachifyPromiser(co(function* () {
    try {
      this.state = yield db.get(key)
    } catch (err) {
      this.state = {}
    }
  }))
}

State.prototype.set = co(function* (key, value) {
  yield this._init()
  _.set(this.state, key, value)
  yield this.db.put(this.key, this.state)
})

State.prototype.get = co(function* (key) {
  yield this._init()
  return key ? _.get(this.state, key) : this.state
})
