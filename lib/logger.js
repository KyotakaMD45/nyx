const config = require('../config')

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' }
const RESET = '\x1b[0m'

function stamp() {
  try {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false, timeZone: config.TZ })
  } catch {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false })
  }
}

function write(level, message) {
  const max = LEVELS[config.LOG_LEVEL] ?? LEVELS.info
  if (LEVELS[level] > max) return
  const line = `${COLORS[level]}[${stamp()}] ${level.toUpperCase()}${RESET} ${message}`
  if (level === 'error') console.error(line)
  else console.log(line)
}

const logger = {
  error: (message) => write('error', message),
  warn: (message) => write('warn', message),
  info: (message) => write('info', message),
  debug: (message) => write('debug', message),
}

module.exports = { logger }
