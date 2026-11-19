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

function legacyAntiVv(value) {
  const raw = String(value || '').trim().toLowerCase()
  return ['', 'true', 'false', 'on', 'off', 'null'].includes(raw) ? 'false' : raw
}

const SEP = ';_;'
const SHARED = new Set(['SESSION_ID', 'SESSION_URL', 'STATUS_URL', 'SESSION_CHECK', 'AUTO_UPDATE', 'UPDATE_INTERVAL', 'BRANCH', 'TZ', 'LOG_LEVEL', 'LOG_MSG', 'YTDLP_PATH', 'COBALT_API', 'COBALT_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL'])
const sessionIndex = () => Math.max(0, (Number(process.env.NYX_INSTANCE) || 1) - 1)

function pick(key, value) {
  if (value === undefined || SHARED.has(key) || !String(value).includes(SEP)) return value
  return String(value).split(SEP)[sessionIndex()] ?? ''
}

function ownVars() {
  try {
    const file = require('./lib/instance').varsFile
    if (!file || !existsSync(file)) return {}
    const parsed = require('dotenv').parse(require('fs').readFileSync(file))
    for (const key of SHARED) delete parsed[key]
    return parsed
  } catch {
    return {}
  }
}

function sessionEnv() {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) env[key] = pick(key, value)
  return Object.assign(env, ownVars())
}

function build() {
  const env = sessionEnv()
  return {
    VERSION: require('./package.json').version,
    REPO_URL: 'https://github.com/KyotakaMD45/nyx',
    BOT_NAME: (env.BOT_NAME || 'Nyx').trim(),
    OWNER_NAME: (env.OWNER_NAME || '').trim(),
    BOT_LANG: (env.BOT_LANG || 'fr').trim().toLowerCase(),

    SESSION_ID: (env.SESSION_ID || '').trim(),
    SESSION_URL: (env.SESSION_URL || 'https://nyx-session.vercel.app/json/').trim(),
    STATUS_URL: (env.STATUS_URL || '').trim(),
    SESSION_CHECK: toBool(env.SESSION_CHECK, true),
    PAIRING_NUMBER: String(env.PAIRING_NUMBER || '').replace(/\D/g, ''),

    PREFIX: env.PREFIX === undefined || env.PREFIX === '' ? '^[.,!]' : String(env.PREFIX),
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
    ANTI_VV: (env.ANTI_VV || legacyAntiVv(env.VV)).trim().toLowerCase(),
    ANTI_DELETE: (env.ANTI_DELETE || 'false').trim().toLowerCase(),
    DISABLE_START_MESSAGE: toBool(env.DISABLE_START_MESSAGE),
    ALIVE_MSG: env.ALIVE_MSG || '',

    STICKER_PACKNAME: env.STICKER_PACKNAME || 'Nyx,Nyx Bot',

    GEMINI_API_KEY: (env.GEMINI_API_KEY || '').trim(),
    GEMINI_MODEL: (env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    GROQ_API_KEY: (env.GROQ_API_KEY || '').trim(),
    GROQ_MODEL: (env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim(),

    YTDLP_PATH: (env.YTDLP_PATH || '').trim(),
    COBALT_API: (env.COBALT_API || '').trim(),
    COBALT_KEY: (env.COBALT_KEY || '').trim(),

    TZ: (env.TZ || 'Africa/Abidjan').trim(),
    LOG_LEVEL: (env.LOG_LEVEL || 'info').trim().toLowerCase(),
    LOG_MSG: toBool(env.LOG_MSG),
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

Object.defineProperty(config, 'session', { enumerable: false, value: { SEP, SHARED, sessionIndex, pick, effective: (key) => sessionEnv()[key] } })

module.exports = config
