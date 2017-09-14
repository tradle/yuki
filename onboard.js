const _ = require('lodash')
const debug = require('debug')(require('./package.json').name)
const clone = require('clone')
const co = require('co').wrap
const deepEqual = require('deep-equal')
const { constants } = require('@tradle/engine')
const buildResource = require('@tradle/build-resource')
const models = require('./models')
const manageState = require('./state')
const { SIG, TYPE } = constants
const VERIFICATION = 'tradle.Verification'
const PHOTO_ID = 'tradle.PhotoID'
const SELFIE = 'tradle.Selfie'
const SIMPLE_MESSAGE = 'tradle.SimpleMessage'
const FORM_REQUEST = 'tradle.FormRequest'
const templateSettings = { interpolate: /{([\s\S]+?)}/g }
const STRINGS = {
  HEY: name => `Hey ${name}!`,
  UNFORGETTABLE: `No way!`,
  FORM_REQUESTS: {
    [PHOTO_ID]: `Can I have your passport or driver license? Take your time, I'll wait here!`,
    [SELFIE]: `Can I have a selfie of your face?`,
  },
  FORM_REQUEST_REMINDERS: {
    [PHOTO_ID]: `Btw, you never got back to me with your passport or driver license...`,
    [SELFIE]: `So...not to be a pain, but I asked you for a selfie`,
  },
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
  const getHistory = () => yuki.history.tail(10)
  const checkIfSentRecently = co(function* (filter) {
    const history = yield getHistory()
    return history.some(filter)
  })

  const sendIfNotRepeat = co(function* (object) {
    const isRepeat = checkIfSentRecently(recent => deepEqual(object, recent))
    if (!isRepeat) {
      yield send(object)
      return true
    }
  })

  yuki.hook('receive', co(function* ({ message }) {
    const { object } = message
    const type = object[TYPE]
    debug('received', type)
    switch (type) {
    case SIMPLE_MESSAGE:
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
    case 'tradle.ForgetMe':
      yield send(STRINGS.UNFORGETTABLE)
      break
    default:
      debug(`don't know how to respond to: ${type}`)
      break
    }
  }))

  const state = manageState({
    db: yuki.storage,
    key: 'state'
  })

  // const getHistory = cachifyPromise(() => yuki.history.tail(10, false))

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
      return yield requestForm(PHOTO_ID)
    }

    if (!cur.haveSelfie) {
      return yield requestForm(SELFIE)
    }
  })

  const requestForm = co(function* (form) {
    const message = STRINGS.FORM_REQUESTS[form]
    const req = {
      [TYPE]: FORM_REQUEST,
      form: 'tradle.PhotoID',
      message: STRINGS.REQUEST_PHOTO_ID
    }

    const sentReq = yield sendIfNotRepeat(req)
    if (sentReq) return

    const sentReminder = yield sendIfNotRepeat(STRINGS.FORM_REQUEST_REMINDERS[form])
    if (sentReminder) return

    debug('pouting and not saying anything')
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
