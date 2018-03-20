const debug = require('debug')(require('./package.json').name)
const cloneDeep = require('lodash/cloneDeep')
const co = require('co').wrap
const { constants } = require('@tradle/engine')
const { SIG } = constants

module.exports = () => yuki => {
  yuki.hook('receive', co(function* ({ message }) {
    debug('received', message)
    const echo = cloneDeep(message.object)
    delete echo[SIG]
    yield yuki.send({ object: echo })
  }))
}
