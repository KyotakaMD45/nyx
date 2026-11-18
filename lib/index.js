// Public API for plugins: const { bot, lang, config, ... } = require('../lib')
const config = require('../config')
const { lang } = require('./lang')
const { logger } = require('./logger')
const { bot, commands } = require('./plugins')
const { db } = require('./db')
const { getBaileys } = require('./baileys')
const { isSudo, prefixes } = require('./handler')
const session = require('./session')
const vars = require('./vars')
const update = require('./update')
const utils = require('./utils')

module.exports = {
  bot,
  commands,
  lang,
  config,
  logger,
  db,
  getBaileys,
  isSudo,
  prefixes,
  session,
  ...vars,
  ...update,
  ...utils,
}
