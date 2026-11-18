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

require('./lib/client')
  .start()
  .catch((error) => {
    logger.error(lang.extra.start_failed.format(error?.stack || error))
    process.exit(1)
  })
