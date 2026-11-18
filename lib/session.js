const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const SESSION_DIR = path.join(ROOT, 'session')
const DEAD_MARK = path.join(ROOT, 'data', 'dead_session')

const PORTABLE_RE = /^(?:nexora|nyx|knull)~/i
const SHARE_RE = /^(?:nexora|nyx|knull)_([a-z0-9]{10})([A-Za-z0-9_-]{22})$/i
const SHORT_RE = /^(?:nexora|nyx|knull|monbot)_[a-z0-9]{16}$/i
const SHARE_STORE = (process.env.NEXORA_STORE || 'https://raw.githubusercontent.com/KyotakaMD45/knull-sessions/main/').replace(/\/?$/, '/')

const fingerprint = (id) => crypto.createHash('sha256').update(String(id)).digest('hex')
const hasSession = () => fs.existsSync(path.join(SESSION_DIR, 'creds.json'))
const fixFileName = (name) => name.replace(/\//g, '__').replace(/:/g, '-')

function clearSession() {
  fs.rmSync(SESSION_DIR, { recursive: true, force: true })
}

function markDead(sessionId) {
  clearSession()
  if (!sessionId) return
  fs.mkdirSync(path.dirname(DEAD_MARK), { recursive: true })
  fs.writeFileSync(DEAD_MARK, fingerprint(sessionId))
}

function isDead(sessionId) {
  try {
    return fs.readFileSync(DEAD_MARK, 'utf8').trim() === fingerprint(sessionId)
  } catch {
    return false
  }
}

function clearDeadMark() {
  fs.rmSync(DEAD_MARK, { force: true })
}

function writeAuth(data) {
  if (!data || typeof data !== 'object' || !data.creds) throw new Error('corrupt')
  fs.mkdirSync(SESSION_DIR, { recursive: true })
  fs.writeFileSync(path.join(SESSION_DIR, 'creds.json'), JSON.stringify(data.creds))
  for (const [type, entries] of Object.entries(data.keys || {})) {
    for (const [id, value] of Object.entries(entries || {})) {
      if (value) fs.writeFileSync(path.join(SESSION_DIR, fixFileName(`${type}-${id}.json`)), JSON.stringify(value))
    }
  }
}

function decodePortable(sessionId) {
  return JSON.parse(zlib.gunzipSync(Buffer.from(sessionId.replace(PORTABLE_RE, ''), 'base64url')).toString('utf8'))
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'nyx-bot' }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const NEXORA_URL = 'https://nexora-inky-delta.vercel.app/json/'

async function fetchShort(sessionId, sessionUrl) {
  const base = (/^nyx_/i.test(sessionId) || process.env.SESSION_URL ? sessionUrl : NEXORA_URL).replace(/\/?$/, '/')
  return JSON.parse((await download(`${base}${sessionId}/nyx`)).toString('utf8'))
}

async function fetchShare(file, key) {
  const data = await download(`${SHARE_STORE}${file}?t=${Date.now()}`)
  if (data.subarray(0, 3).toString() !== 'NX1') throw new Error('unknown format')
  const decipher = crypto.createDecipheriv('aes-128-gcm', Buffer.from(key, 'base64url'), data.subarray(3, 15))
  decipher.setAuthTag(data.subarray(15, 31))
  const plain = Buffer.concat([decipher.update(data.subarray(31)), decipher.final()])
  return JSON.parse(zlib.gunzipSync(plain).toString('utf8'))
}

async function prepareSession(config) {
  if (hasSession()) return 'existing'
  const sessionId = config.SESSION_ID
  if (!sessionId) return 'none'
  if (isDead(sessionId)) return 'dead'

  let data
  if (PORTABLE_RE.test(sessionId)) {
    data = decodePortable(sessionId)
  } else if (SHARE_RE.test(sessionId)) {
    const [, file, key] = SHARE_RE.exec(sessionId)
    data = await fetchShare(file, key)
  } else if (SHORT_RE.test(sessionId)) {
    data = await fetchShort(sessionId, config.SESSION_URL)
  } else {
    throw new Error('invalid_session_id')
  }
  writeAuth(data)
  return 'imported'
}

module.exports = {
  SESSION_DIR,
  prepareSession,
  clearSession,
  markDead,
  clearDeadMark,
  hasSession,
  decodePortable,
  writeAuth,
}
