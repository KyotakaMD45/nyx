const config = require('../config')
const { lang } = require('./lang')
const { logger } = require('./logger')
const { bot, commands } = require('./plugins')
const { db } = require('./db')
const { getBaileys } = require('./baileys')
const { isSudo, prefixes, prefix } = require('./handler')
const session = require('./session')
const vars = require('./vars')
const update = require('./update')
const utils = require('./utils')
const status = require('./status')
const style = require('./style')

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
  prefix,
  session,
  ...vars,
  ...update,
  ...utils,
  ...status,
  ...style,
}
