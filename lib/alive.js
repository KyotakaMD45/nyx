const fs = require('fs')
const path = require('path')
const config = require('../config')
const { db } = require('./db')
const { ram, runtime } = require('./utils')

const DIR = path.join(__dirname, '..', 'data')
const URL_RE = /https?:\/\/\S+/i

const MEDIA_TYPES = {
  'image/jpeg': ['image', 'jpg'],
  'image/png': ['image', 'png'],
  'image/webp': ['image', 'webp'],
  'image/gif': ['video', 'gif'],
  'video/mp4': ['video', 'mp4'],
  'video/webm': ['video', 'webm'],
}

function mediaFile(alive) {
  return alive?.ext ? path.join(DIR, `alive.${alive.ext}`) : null
}

async function downloadMedia(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const known = MEDIA_TYPES[mime]
  if (!known) throw new Error(`type ${mime || 'inconnu'}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return { type: known[0], ext: known[1], buffer }
}

async function getQuote() {
  try {
    const res = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(8000) })
    const [quote] = await res.json()
    return quote?.q ? `${quote.q} — ${quote.a}` : ''
  } catch {
    return ''
  }
}

async function fillPlaceholders(text, prefix) {
  let out = String(text)
    .replace(/#uptime/g, runtime(process.uptime()))
    .replace(/#name/g, config.BOT_NAME)
    .replace(/#version/g, config.VERSION)
    .replace(/#ram/g, ram())
    .replace(/#prefix/g, prefix)
    .replace(/\\n/g, '\n')
  if (out.includes('#quote')) out = out.replace(/#quote/g, await getQuote())
  return out.trim()
}

function getAlive() {
  return db.get('alive', 'current', null)
}

async function setAlive(input) {
  const text = String(input).trim()
  const url = URL_RE.exec(text)?.[0] || null
  const message = url ? text.replace(url, '').trim() : text
  const previous = mediaFile(getAlive())
  if (previous) fs.rmSync(previous, { force: true })
  let media = null
  if (url) {
    media = await downloadMedia(url)
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(path.join(DIR, `alive.${media.ext}`), media.buffer)
  }
  return db.set('alive', 'current', { message, url, type: media ? media.type : 'text', ext: media ? media.ext : null })
}

function resetAlive() {
  const previous = mediaFile(getAlive())
  if (previous) fs.rmSync(previous, { force: true })
  db.del('alive', 'current')
}

async function aliveMessage(prefix, defaultText) {
  const alive = getAlive()
  if (!alive) return { type: 'text', content: await fillPlaceholders(config.ALIVE_MSG || defaultText, prefix), options: {} }
  let caption = await fillPlaceholders(alive.message, prefix)
  const gif = caption.includes('&gif')
  caption = caption.replace(/&gif/g, '').trim()
  const file = mediaFile(alive)
  if (alive.type !== 'text' && file && fs.existsSync(file)) {
    return { type: alive.type, content: fs.readFileSync(file), options: { caption, gif: gif || alive.ext === 'gif' } }
  }
  if (alive.type !== 'text' && alive.url) {
    try {
      const media = await downloadMedia(alive.url)
      fs.mkdirSync(DIR, { recursive: true })
      fs.writeFileSync(path.join(DIR, `alive.${media.ext}`), media.buffer)
      return { type: media.type, content: media.buffer, options: { caption, gif: gif || media.ext === 'gif' } }
    } catch {}
  }
  return { type: 'text', content: caption, options: {} }
}

module.exports = { getAlive, setAlive, resetAlive, aliveMessage, fillPlaceholders }
