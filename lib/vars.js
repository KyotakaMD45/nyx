const fs = require('fs')
const path = require('path')
const config = require('../config')

const ENV_FILE = path.join(__dirname, '..', 'config.env')
const KEY_RE = /^[A-Z][A-Z0-9_]*$/
const SECRET_RE = /(SESSION_ID|API_KEY|TOKEN|PASSWORD|SECRET)/
const PROTECTED = new Set([
  'PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'TEMP', 'TMP', 'APPDATA', 'USERPROFILE',
  'SYSTEMROOT', 'NODE_ENV', 'NODE_OPTIONS', 'PM2_HOME',
])

const KNOWN = [
  'BOT_NAME', 'OWNER_NAME', 'BOT_LANG', 'PREFIX', 'SUDO',
  'SESSION_ID', 'SESSION_URL', 'PAIRING_NUMBER',
  'AUTO_UPDATE', 'BRANCH', 'UPDATE_INTERVAL',
  'ALWAYS_ONLINE', 'SEND_READ', 'REJECT_CALL', 'REJECT_CALL_MSG',
  'AUTO_STATUS_VIEW', 'STATUS_VIEW_EMOJI', 'STATUS_VIEW_MSG', 'STATUS_FORWARD_JID', 'ANTI_DELETE', 'VV',
  'DISABLE_START_MESSAGE', 'ALIVE_MSG', 'STICKER_PACKNAME',
  'GEMINI_API_KEY', 'GEMINI_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL',
  'TZ', 'LOG_LEVEL',
]

const normalizeKey = (key) => String(key || '').trim().toUpperCase()
const isSecret = (key) => SECRET_RE.test(key)
const mask = (value) => (value ? `${String(value).slice(0, 4)}… (${String(value).length})` : '')

function readLines() {
  try {
    return fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)
  } catch {
    return []
  }
}

function formatValue(value) {
  const text = String(value).replace(/\r?\n/g, '\\n')
  return text.includes('"') ? `'${text}'` : `"${text}"`
}

function writeEnv(key, value) {
  const re = new RegExp(`^\\s*${key}\\s*=`)
  const out = []
  let found = false
  for (const line of readLines()) {
    if (re.test(line)) {
      if (!found && value !== null) out.push(`${key}=${formatValue(value)}`)
      found = true
    } else {
      out.push(line)
    }
  }
  if (!found && value !== null) {
    while (out.length && out[out.length - 1].trim() === '') out.pop()
    out.push(`${key}=${formatValue(value)}`)
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop()
  fs.writeFileSync(ENV_FILE, out.length ? `${out.join('\n')}\n` : '')
}

function assertEditable(key) {
  if (!KEY_RE.test(key)) throw new Error('invalid_key')
  if (PROTECTED.has(key)) throw new Error('protected_key')
}

function setVar(key, value) {
  key = normalizeKey(key)
  assertEditable(key)
  value = String(value ?? '').trim()
  process.env[key] = value
  writeEnv(key, value)
  config.reload()
  return { key, value }
}

function getVar(key) {
  return process.env[normalizeKey(key)]
}

function delVar(key) {
  key = normalizeKey(key)
  assertEditable(key)
  const existed = process.env[key] !== undefined || readLines().some((l) => l.startsWith(`${key}=`))
  delete process.env[key]
  writeEnv(key, null)
  config.reload()
  return existed
}

function listVars() {
  const extra = readLines()
    .map((l) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((k) => k && !KNOWN.includes(k))
  return [...KNOWN, ...extra].map((key) => {
    const raw = process.env[key]
    return { key, value: raw === undefined ? '' : isSecret(key) ? mask(raw) : raw, set: raw !== undefined }
  })
}

function setVars() {
  let parsed = {}
  try {
    parsed = require('dotenv').parse(fs.readFileSync(ENV_FILE))
  } catch {
    return []
  }
  return Object.keys(parsed)
    .filter((key) => !key.startsWith('SECRET_') && String(parsed[key]).trim() !== '')
    .sort()
    .map((key) => ({ key, value: isSecret(key) ? mask(parsed[key]) : parsed[key] }))
}

module.exports = { setVar, getVar, delVar, listVars, setVars, isSecret, mask, KNOWN, ENV_FILE }
