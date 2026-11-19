process.noDeprecation = true
const config = require('./config')
const { lang } = require('./lib/lang')
const { logger } = require('./lib/logger')

const [major] = process.versions.node.split('.').map(Number)
if (major < 20) {
  console.error(lang.extra.node_version.format(process.versions.node))
  process.exit(1)
}

process.on('unhandledRejection', (error) => logger.error(`unhandledRejection: ${error?.stack || error}`))
process.on('uncaughtException', (error) => logger.error(`uncaughtException: ${error?.stack || error}`))

logger.info(lang.extra.starting.format(config.BOT_NAME, config.VERSION))

const multi = require('./lib/multi')
const ids = multi.sessionIds(config.SESSION_ID)

if (!process.env.NYX_INSTANCE && ids.length > 1) {
  multi.run(ids)
} else {
  multi.attachChild()
  require('./lib/client')
    .start()
    .catch((error) => {
      logger.error(lang.extra.start_failed.format(error?.stack || error))
      process.exit(1)
    })
}
