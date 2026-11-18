const config = require('../config')
const { lang } = require('./lang')
const { logger } = require('./logger')
const { commands, listeners } = require('./plugins')
const { Message } = require('./message')
const { isPassed } = require('./pass')
const { getBaileys } = require('./baileys')
const { num, bare, toJid } = require('./utils')

const recent = new Map()
const RECENT_MAX = 1000
function remember(raw) {
  recent.set(raw.key.id, raw)
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value)
}

const sentByBot = new Set()
function trackSends(sock) {
  const send = sock.sendMessage.bind(sock)
  sock.sendMessage = async (...args) => {
    const result = await send(...args)
    if (result?.key?.id) {
      sentByBot.add(result.key.id)
      if (sentByBot.size > 500) sentByBot.delete(sentByBot.values().next().value)
    }
    return result
  }
}

function isSudo(sock, message) {
  if (message.fromMe) return true
  const own = num(sock.user?.id)
  const numbers = new Set([message.sender, ...message.senderIds.map(num)])
  return numbers.has(own) || config.SUDO.some((n) => numbers.has(n))
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let prefixCache = { raw: null }

function parsePrefix(raw) {
  const value = raw === 'null' || raw.toLowerCase() === 'false' ? '' : raw
  let pattern
  let first = ''
  if (value.startsWith('^') || value === '') {
    pattern = value
  } else if (value.includes(',')) {
    const parts = value
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    first = parts[0] || ''
    parts.sort((x, y) => y.length - x.length)
    pattern = '^(?:' + parts.map(escapeRegex).join('|') + ')'
  } else {
    pattern = value.replace('[', '').replace(']', '').replace(/\./g, '[.]')
  }
  if (!pattern.startsWith('^')) pattern = '^' + pattern
  let regex
  try {
    regex = new RegExp(pattern, 'u')
  } catch {
    pattern = '^[' + escapeRegex(value.replace(/^\^/, '')) + ']'
    regex = new RegExp(pattern, 'u')
  }
  let shown = ''
  if (value) {
    const unescape = (text) => text.replace(/\\(.)/gu, '$1')
    const charClass = /^\^\[((?:\\.|[^\]\\])+)\]/u.exec(pattern)
    const group = /^\^\(\?:((?:\\.|[^|)\\])+)/u.exec(pattern)
    if (charClass && (value.startsWith('^') || pattern === charClass[0])) shown = [...unescape(charClass[1])][0] || ''
    else if (group) shown = first || unescape(group[1])
    else shown = unescape(pattern.slice(1).replace(/\[(\\?.)\]/gu, '$1'))
  }
  return { raw, regex, shown: String(shown).trim() }
}

function prefixInfo() {
  const raw = String(config.PREFIX ?? '').trim()
  if (prefixCache.raw !== raw) prefixCache = parsePrefix(raw)
  return prefixCache
}

function prefix() {
  return prefixInfo().shown
}

function prefixes() {
  return [prefix()]
}

function commandBody(text) {
  const match = prefixInfo().regex.exec(text)
  if (!match) return null
  return text.slice(match[0].length).trimStart()
}

async function runListeners(event, ...args) {
  for (const listener of listeners[event] || []) {
    try {
      await listener.handler(...args)
    } catch (error) {
      logger.error(`[on:${event}] ${error?.stack || error}`)
    }
  }
}

async function runCommand(sock, message) {
  if (!message.text) return
  const body = commandBody(message.text)
  if (body === null || !body) return
  for (const cmd of commands) {
    const match = cmd.regex.exec(body)
    if (!match) continue
    const sudo = isSudo(sock, message)
    if (!sudo && !isPassed(message, cmd.name)) return
    if (cmd.onlyGroup && !message.isGroup) return message.reply(lang.extra.only_group)
    logger.debug(`commande ${cmd.name} par ${message.sender}`)
    try {
      await cmd.handler(message, (match[1] ?? '').trim(), { sock, sudo })
    } catch (error) {
      logger.error(`[${cmd.name}] ${error?.stack || error}`)
      await message.reply(lang.extra.command_error.format(cmd.name, error?.message || error)).catch(() => {})
    }
    return
  }
}

function antiDeleteTarget(sock, chatJid) {
  const mode = config.ANTI_DELETE
  if (!mode || mode === 'false') return null
  if (mode === 'g') return chatJid
  if (mode === 'p' || mode === 'true') return bare(sock.user.id)
  const digits = mode.replace(/\D/g, '')
  return digits ? toJid(digits) : null
}

async function onRevoke(sock, raw, protocol) {
  const target = antiDeleteTarget(sock, raw.key.remoteJid)
  if (!target) return
  const original = recent.get(protocol.key?.id)
  if (!original || original.key.fromMe) return
  const senderJid = original.key.participantAlt || original.key.participant || original.key.remoteJidAlt || original.key.remoteJid
  await sock.sendMessage(target, {
    text: lang.extra.deleted_message.format(num(senderJid), original.pushName || ''),
    mentions: [senderJid],
  })
  await sock.sendMessage(target, { forward: original })
}

async function onMessagesUpsert(sock, { messages, type }) {
  if (type !== 'notify') return
  const B = getBaileys()
  for (const raw of messages) {
    try {
      if (!raw.message || sentByBot.has(raw.key.id)) continue
      const jid = raw.key.remoteJid
      if (!jid || jid.endsWith('@newsletter')) continue

      if (jid === 'status@broadcast') {
        if (!raw.key.fromMe) await runListeners('status', sock, raw)
        continue
      }

      const protocol = raw.message.protocolMessage
      if (protocol) {
        if (protocol.type === B.proto.Message.ProtocolMessage.Type.REVOKE) await onRevoke(sock, raw, protocol)
        continue
      }

      remember(raw)
      if (config.SEND_READ && !raw.key.fromMe) sock.readMessages([raw.key]).catch(() => {})

      const message = new Message(sock, raw)
      await runListeners('message', message)
      if (message.text) await runListeners('text', message)
      await runCommand(sock, message)
    } catch (error) {
      logger.error(`message: ${error?.stack || error}`)
    }
  }
}

module.exports = { onMessagesUpsert, runListeners, trackSends, isSudo, recent, prefixes, prefix, parsePrefix }
