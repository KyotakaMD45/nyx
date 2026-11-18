const { existsSync } = require('fs')
const path = require('path')

const configPath = path.join(__dirname, 'config.env')
if (existsSync(configPath)) require('dotenv').config({ path: configPath, quiet: true })

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  return String(value).trim().toLowerCase() === 'true'
}
const toList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
const toNumber = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function build() {
  const env = process.env
  return {
    VERSION: require('./package.json').version,
    BOT_NAME: (env.BOT_NAME || 'Nyx').trim(),
    OWNER_NAME: (env.OWNER_NAME || '').trim(),
    BOT_LANG: (env.BOT_LANG || 'fr').trim().toLowerCase(),

    SESSION_ID: (env.SESSION_ID || '').trim(),
    SESSION_URL: (env.SESSION_URL || 'https://nexora-inky-delta.vercel.app/json/').trim(),
    PAIRING_NUMBER: String(env.PAIRING_NUMBER || '').replace(/\D/g, ''),

    PREFIX: env.PREFIX === undefined ? '.' : String(env.PREFIX),
    MODE: (env.MODE || 'private').trim().toLowerCase(),
    SUDO: toList(env.SUDO).map((n) => n.replace(/\D/g, '')).filter(Boolean),

    AUTO_UPDATE: toBool(env.AUTO_UPDATE),
    BRANCH: (env.BRANCH || '').trim(),
    UPDATE_INTERVAL: toNumber(env.UPDATE_INTERVAL, 6),

    ALWAYS_ONLINE: toBool(env.ALWAYS_ONLINE),
    SEND_READ: toBool(env.SEND_READ),
    REJECT_CALL: toBool(env.REJECT_CALL),
    REJECT_CALL_MSG: env.REJECT_CALL_MSG || '',
    AUTO_STATUS_VIEW: (env.AUTO_STATUS_VIEW || 'false').trim(),
    STATUS_VIEW_EMOJI: (env.STATUS_VIEW_EMOJI || '').trim(),
    STATUS_VIEW_MSG: env.STATUS_VIEW_MSG || '',
    STATUS_FORWARD_JID: (env.STATUS_FORWARD_JID || '').trim(),
    ANTI_DELETE: (env.ANTI_DELETE || 'false').trim().toLowerCase(),
    DISABLE_START_MESSAGE: toBool(env.DISABLE_START_MESSAGE),
    ALIVE_MSG: env.ALIVE_MSG || '',

    STICKER_PACKNAME: env.STICKER_PACKNAME || 'Nyx,Nyx Bot',

    GEMINI_API_KEY: (env.GEMINI_API_KEY || '').trim(),
    GEMINI_MODEL: (env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    GROQ_API_KEY: (env.GROQ_API_KEY || '').trim(),
    GROQ_MODEL: (env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim(),

    TZ: (env.TZ || 'Africa/Abidjan').trim(),
    LOG_LEVEL: (env.LOG_LEVEL || 'info').trim().toLowerCase(),
  }
}

const config = build()

Object.defineProperty(config, 'reload', {
  enumerable: false,
  value() {
    const fresh = build()
    for (const key of Object.keys(config)) delete config[key]
    Object.assign(config, fresh)
    return config
  },
})

module.exports = config
