const extend = require('lodash/extend')
const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')

module.exports = extend(
  {},
  baseModels,
  customModels
)
