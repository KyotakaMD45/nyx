// Message pipeline: anti-delete store, `on` listeners, then command dispatch.
const config = require('../config')
const { lang } = require('./lang')
const { logger } = require('./logger')
const { commands, listeners } = require('./plugins')
const { Message } = require('./message')
const { getBaileys } = require('./baileys')
const { num, bare, toJid } = require('./utils')

// Recent messages, kept to re-send deleted ones (ANTI_DELETE) and to answer Baileys retries.
const recent = new Map()
const RECENT_MAX = 1000
function remember(raw) {
  recent.set(raw.key.id, raw)
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value)
}

// Messages sent by the bot itself: never treated as commands (no reply loops).
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

function prefixes() {
  const raw = String(config.PREFIX ?? '.').trim()
  if (!raw || raw.toLowerCase() === 'false') return ['']
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
}

// Text after the prefix, or null if the message is not a command.
function commandBody(text) {
  for (const p of prefixes()) if (text.startsWith(p)) return text.slice(p.length).trimStart()
  return null
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
    // private mode: owner/sudo only. public mode: everyone, except commands marked fromMe.
    if (!sudo && (cmd.fromMe || config.MODE !== 'public')) return
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

// ANTI_DELETE: false | p (to the bot's own chat) | g (same chat) | <number> (to that number)
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

module.exports = { onMessagesUpsert, runListeners, trackSends, isSudo, recent, prefixes }
