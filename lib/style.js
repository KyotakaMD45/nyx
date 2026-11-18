const os = require('os')
const config = require('../config')

const SMALLCAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
}

function mono(char) {
  const code = char.codePointAt(0)
  if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d670 + code - 65)
  if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d68a + code - 97)
  if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7f6 + code - 48)
  return char
}

function textToStylist(text, style) {
  const chars = [...String(text)]
  if (style === 'mono') return chars.map(mono).join('')
  if (style === 'smallcaps') return chars.map((c) => SMALLCAPS[c.toLowerCase()] || c).join('')
  return String(text)
}

function addSpace(index, total) {
  return ' '.repeat(Math.max(0, String(total).length - String(index).length))
}

function getRam() {
  return `${Math.floor(os.freemem() / 1048576)}/${Math.floor(os.totalmem() / 1048576)}MB`
}

function getUptime() {
  let s = Math.floor(process.uptime())
  const d = Math.floor(s / 86400)
  s %= 86400
  const h = Math.floor(s / 3600)
  s %= 3600
  const m = Math.floor(s / 60)
  s %= 60
  return [d && `${d}j`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

function getDate() {
  const now = new Date()
  const options = (extra) => ({ ...extra, timeZone: config.TZ })
  const safe = (fn) => {
    try {
      return fn(true)
    } catch {
      return fn(false)
    }
  }
  const time = safe((tz) => now.toLocaleTimeString('fr-FR', tz ? options({ hour: '2-digit', minute: '2-digit' }) : { hour: '2-digit', minute: '2-digit' }))
  const day = safe((tz) => now.toLocaleDateString('fr-FR', tz ? options({ weekday: 'long' }) : { weekday: 'long' }))
  const date = safe((tz) => now.toLocaleDateString('fr-FR', tz ? options({}) : {}))
  return { time, day: day.charAt(0).toUpperCase() + day.slice(1), date }
}

function getPlatform() {
  const env = process.env
  let host = 'VPS'
  if (env.DYNO) host = 'Heroku'
  else if (env.KOYEB_APP_NAME || env.KOYEB_SERVICE_NAME) host = 'Koyeb'
  else if (env.RENDER) host = 'Render'
  else if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) host = 'Railway'
  else if (env.REPL_ID) host = 'Replit'
  else if (env.TERMUX_VERSION || (env.HOME || '').includes('com.termux')) host = 'Termux'
  else if (process.platform === 'win32') host = 'Windows'
  else if (process.platform === 'darwin') host = 'macOS'
  return `${host} (${os.type()})`
}

module.exports = { textToStylist, addSpace, getRam, getUptime, getDate, getPlatform }
