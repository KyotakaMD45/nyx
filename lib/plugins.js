// Plugin registry, same contract as Levanter:
//   bot({ pattern: 'ping ?(.*)', desc, type, fromMe }, async (message, match) => { ... })
//   bot({ on: 'text' }, async (message) => { ... })            // runs on every text message
// pattern "name ?(.*)" means: the command "name", optionally followed by arguments (match).
// Other `on` events: 'message', 'status', 'call', 'group-participants'.
const fs = require('fs')
const path = require('path')

const commands = []
const listeners = { text: [], message: [], status: [], call: [], 'group-participants': [] }

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "name ?(.*)" -> name + optional arguments separated by whitespace ("tag" never matches "tagall").
function compile(pattern, alias = []) {
  const simple = /^(\S+?) \?\(\.\*\)$/.exec(pattern)
  if (simple) {
    const names = [simple[1], ...alias].map(escapeRegExp).join('|')
    return new RegExp(`^(?:${names})(?:\\s+([\\s\\S]*))?$`, 'i')
  }
  return new RegExp(`^${pattern}$`, 'is')
}

function bot(info, handler) {
  if (typeof handler !== 'function') throw new Error('bot(): handler must be a function')
  if (info.on) {
    if (!listeners[info.on]) listeners[info.on] = []
    listeners[info.on].push({ ...info, handler })
    return
  }
  const pattern = String(info.pattern || '').trim()
  if (!pattern) throw new Error('bot(): pattern is required')
  const name = pattern.split(/[\s?(]/)[0].toLowerCase()
  commands.push({
    fromMe: true,
    type: 'misc',
    desc: '',
    alias: [],
    ...info,
    name,
    regex: compile(pattern, info.alias || []),
    handler,
  })
}

function loadPlugins(dir, logger) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()
  for (const file of files) {
    try {
      require(path.join(dir, file))
    } catch (error) {
      logger.error(`plugin ${file}: ${error.message}`)
    }
  }
  return commands.length
}

module.exports = { bot, commands, listeners, loadPlugins }
