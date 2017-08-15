
const co = require('co').wrap

module.exports = {
  loudCo,
  cachifyPromiser
}

function loudCo (gen) {
  return co(function* (...args) {
    try {
      yield co(gen)(...args)
    } catch (err) {
      console.error(err)
      throw err
    }
  })
}

function cachifyPromiser (fn) {
  let promise
  return function (...args) {
    if (!promise) promise = fn.apply(this, args)

    return promise
  }
}
