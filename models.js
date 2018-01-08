const _ = require('lodash')
const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')

module.exports = _.extend(
  {},
  baseModels,
  customModels
)
