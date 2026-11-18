const { db } = require('./db')
const { commands } = require('./plugins')
const { num } = require('./utils')

const NS = 'pass'

const LOCKED = new Set([
  'pass',
  'setvar',
  'getvar',
  'delvar',
  'allvar',
  'setsudo',
  'delsudo',
  'getsudo',
  'update',
  'restart',
  'block',
  'unblock',
])

const chatKey = (jid) => (String(jid).endsWith('@g.us') ? jid : num(jid))

function resolve(name) {
  const wanted = String(name).toLowerCase()
  const cmd = commands.find((c) => c.name === wanted || (c.alias || []).some((a) => a.toLowerCase() === wanted))
  return cmd ? cmd.name : null
}

function splitNames(text) {
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9_-]+/g) || [])]
}

function listFor(jid) {
  return db.get(NS, chatKey(jid), [])
}

function add(jid, text) {
  const current = listFor(jid)
  const added = []
  const already = []
  const unknown = []
  const locked = []
  for (const raw of splitNames(text)) {
    const name = resolve(raw)
    if (!name) unknown.push(raw)
    else if (LOCKED.has(name)) locked.push(name)
    else if (current.includes(name) || added.includes(name)) already.push(name)
    else added.push(name)
  }
  if (added.length) db.set(NS, chatKey(jid), [...current, ...added])
  return { added, already, unknown, locked }
}

function remove(jid, text) {
  const current = listFor(jid)
  if (/^\s*all\s*$/i.test(text)) {
    db.del(NS, chatKey(jid))
    return { removed: current, missing: [] }
  }
  const names = splitNames(text).map((n) => resolve(n) || n)
  const removed = names.filter((n) => current.includes(n))
  const missing = names.filter((n) => !current.includes(n))
  const left = current.filter((n) => !removed.includes(n))
  if (left.length) db.set(NS, chatKey(jid), left)
  else db.del(NS, chatKey(jid))
  return { removed, missing }
}

function isPassed(message, name) {
  if (LOCKED.has(name)) return false
  const keys = new Set([chatKey(message.jid), message.sender, ...(message.senderIds || []).filter(Boolean).map(num)])
  for (const key of keys) if (db.get(NS, key, []).includes(name)) return true
  return false
}

module.exports = { LOCKED, listFor, add, remove, isPassed }
