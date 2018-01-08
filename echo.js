const debug = require('debug')(require('./package.json').name)
const _ = require('lodash')
const co = require('co').wrap
const { constants } = require('@tradle/engine')
const { SIG } = constants

module.exports = () => yuki => {
  yuki.hook('receive', co(function* ({ message }) {
    debug('received', message)
    const echo = _.cloneDeep(message.object)
    delete echo[SIG]
    yield yuki.send({ object: echo })
  }))
}
