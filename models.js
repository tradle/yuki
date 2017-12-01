const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')
const mergeModels = require('@tradle/merge-models')
const models = mergeModels()
  .add(baseModels, { validate: false })
  .add(customModels, { validate: false })
  .get()

module.exports = models
