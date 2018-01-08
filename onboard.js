const _ = require('lodash')
const debug = require('debug')(require('./package.json').name)
const co = require('co').wrap
const { constants } = require('@tradle/engine')
const buildResource = require('@tradle/build-resource')
const models = require('./models')
const manageState = require('./state')
const { SIG, TYPE } = constants
const VERIFICATION = 'tradle.Verification'
const templateSettings = { interpolate: /{([\s\S]+?)}/g }
const STRINGS = {
  HEY: name => `Hey ${name}!`,
  REQUEST_PHOTO_ID: `Can I have your passport or driver license? Take your time, I'll wait here!`,
  REQUEST_SELFIE: `Can I have a selfie of your face?`,
  BANTER: [
    'being your personal assistant rocks my world :)',
    'I missed you!',
    "I've been looking everywhere for you!",
    "hey, you're back!",
    'yay! I was getting so lonely here :('
  ],
  THATS_ALL: "Yay! Your photo ID and selfie are now on your profile, and you can share them with other service providers",
  WELCOME: _.template(`Hey, I'm {name}, your on-device assistant!`, templateSettings)
}

module.exports = (opts={}) => yuki => {
  const { name='Yuki' } = opts
  const send = object => yuki.send({ object })
  yuki.hook('receive', co(function* ({ message }) {
    const { object } = message
    const type = object[TYPE]
    debug('received', type)
    switch (type) {
    case 'tradle.SimpleMessage':
      yield send(`Sorry, I'm new, I don't understand "${object.message}"`)

      // yield banter({ message: object.message })
      break
    case 'tradle.CustomerWaiting':
      yield banter({ message: object.message })
      break
    case 'tradle.SelfIntroduction':
    case 'tradle.IdentityPublishRequest':
      yield handleSelfIntroduction({ object })
      break
    case 'tradle.PhotoID':
      yield handlePhotoID({ object })
      break
    case 'tradle.Selfie':
      yield handleSelfie({ object })
      break
    default:
      throw new Error(`don't know how to respond to: ${type}`)
    }
  }))

  const state = manageState({
    db: yuki.storage,
    key: 'state'
  })

  // const getHistory = cachifyPromise(() => yuki.history.head(10, false))

  const handleSelfIntroduction = co(function* ({ object }) {
    const { profile } = object
    if (!profile) return

    const me = yield state.get('me')
    const isNew = !me
    if (me && me.name === profile.firstName) {
      return collectKYC()
    }

    const { firstName } = profile
    // const sendMessage = send(STRINGS.HEY(firstName))

    yield [
      // sendMessage,
      state.set('me', { name: firstName })
    ]

    yield collectKYC()
  })

  const banter = co(function* ({ message }) {
    yield send(randomElement(STRINGS.BANTER))
  })

  const collectKYC = co(function* () {
    const cur = yield state.get()
    if (!cur.havePhotoID) {
      return yield requestPhotoID()
    }

    if (!cur.haveSelfie) {
      return yield requestSelfie()
    }
  })

  const requestPhotoID = co(function* () {
    yield send({
      [TYPE]: 'tradle.FormRequest',
      form: 'tradle.PhotoID',
      message: STRINGS.REQUEST_PHOTO_ID
    })
  })

  const requestSelfie = co(function* () {
    yield send({
      [TYPE]: 'tradle.FormRequest',
      form: 'tradle.Selfie',
      message: STRINGS.REQUEST_SELFIE
    })
  })

  const verifyPhotoID = co(function* ({ object }) {
    const verification = createVerificationForPhotoID(object)
    yield send(verification)
  })

  function createVerificationForPhotoID (object) {
    const dateVerified = Date.now()
    const document = buildResource.stub({
      models,
      resource: object,
      validate: false
    })

    const blinkIDVerification = {
      [TYPE]: VERIFICATION,
      dateVerified,
      document,
      method: {
        [TYPE]: 'tradle.APIBasedVerificationMethod',
        api: {
          _t: 'tradle.API',
          name: 'BlinkID',
          provider: {
            title: 'MicroBlink, Inc.',
            id: 'tradle.Organization_fakeMicroblinkHash'
          }
        },
        rawData: {
          version: '2.9.1'
        },
        aspect: 'ocr'
      }
    }

    return blinkIDVerification
    // return {
    //   [TYPE]: VERIFICATION,
    //   dateVerified,
    //   document,
    //   sources: [
    //     blinkIDVerification
    //   ]
    // }
  }

  const handlePhotoID = co(function* ({ object }) {
    yield [
      state.set('havePhotoID', true),
      verifyPhotoID({ object })
    ]

    yield collectKYC()
  })

  const handleSelfie = co(function* ({ object }) {
    const had = yield state.get('haveSelfie')
    if (!had) {
      yield state.set('haveSelfie', true)
      yield onKYCd()
    }
  })

  const onKYCd = co(function* () {
    yield send(STRINGS.THATS_ALL)
  })

  const welcome = co(function* () {
    const len = yield yuki.history.length()
    if (len === 0) send(STRINGS.WELCOME({ name }))
  })

  return {
    welcome,
    createVerificationForPhotoID
  }
}

function randomElement (arr) {
  const idx = Math.floor(Math.random() * arr.length)
  return arr[idx]
}

function toObject (models) {
  const obj = {}
  for (let model of models) {
    obj[model.id] = model
  }

  return obj
}
