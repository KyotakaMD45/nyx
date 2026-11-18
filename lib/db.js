// Small JSON key/value store (data/db.json), grouped by namespace.
// Writes are debounced and atomic (temp file + rename), so a crash never leaves a half file.
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'data')
const FILE = path.join(DIR, 'db.json')

let data = {}
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
} catch {
  data = {}
}

let timer = null

function flush() {
  clearTimeout(timer)
  timer = null
  try {
    fs.mkdirSync(DIR, { recursive: true })
    const tmp = `${FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, FILE)
  } catch {
    // disk errors are not fatal for the bot
  }
}

function persist() {
  clearTimeout(timer)
  timer = setTimeout(flush, 300)
  timer.unref?.()
}

process.on('exit', () => {
  if (timer) flush()
})

const db = {
  get(ns, key, fallback = undefined) {
    const value = data[ns]?.[key]
    return value === undefined ? fallback : value
  },
  set(ns, key, value) {
    data[ns] ||= {}
    data[ns][key] = value
    persist()
    return value
  },
  del(ns, key) {
    if (data[ns] && key in data[ns]) {
      delete data[ns][key]
      persist()
      return true
    }
    return false
  },
  all(ns) {
    return { ...(data[ns] || {}) }
  },
  flush,
}

module.exports = { db }
