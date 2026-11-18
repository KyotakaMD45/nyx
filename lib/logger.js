const util = require('util')
const config = require('../config')

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[32m', debug: '\x1b[90m' }
const RESET = '\x1b[0m'
const color = process.stdout.isTTY || process.env.pm_id !== undefined || process.env.FORCE_COLOR

const original = { log: console.log, info: console.info, warn: console.warn, error: console.error }

function pad(n) {
  return String(n).padStart(2, '0')
}

function stamp() {
  let date = new Date()
  try {
    date = new Date(date.toLocaleString('en-US', { timeZone: config.TZ }))
  } catch {}
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)}`
}

function write(level, args) {
  const max = LEVELS[config.LOG_LEVEL] ?? LEVELS.info
  if (LEVELS[level] > max) return
  const name = level.toUpperCase()
  const head = color ? `${COLORS[level]}${name}${RESET}` : name
  const line = `${head} [${stamp()}]: ${util.format(...args)}`
  if (level === 'error') original.error(line)
  else original.log(line)
}

const logger = {
  error: (...args) => write('error', args),
  warn: (...args) => write('warn', args),
  info: (...args) => write('info', args),
  debug: (...args) => write('debug', args),
}

const NOISE = [
  /^Closing/,
  /^Removing old/,
  /^Decrypted message with closed session/,
  /^Session error/,
  /^Failed to decrypt/,
  /^Migrating session/,
  /^Session already closed/,
  /^V1 session storage migration/,
  /^WARNING: Expected pubkey/,
  /^Unhandled bucket type/,
  /punycode/,
]

const isNoise = (args) => {
  const text = util.format(...args)
  return NOISE.some((re) => re.test(text))
}

console.info = (...args) => (isNoise(args) ? undefined : logger.info(...args))
console.warn = (...args) => (isNoise(args) ? undefined : logger.warn(...args))
console.error = (...args) => (isNoise(args) ? undefined : logger.error(...args))

module.exports = { logger }
