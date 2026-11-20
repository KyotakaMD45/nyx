const { bot, lang, config, setVar, logger, getBaileys, parseStatusView, bare, num, toJid, ownerJid, parseEmojis } = require('../lib')

const statusEmojis = parseEmojis

const REPLY_COOLDOWN = 12 * 60 * 60 * 1000
const lastReply = new Map()

function forwardTarget(sock) {
  const value = config.STATUS_FORWARD_JID
  if (!value || value.toLowerCase() === 'false' || value.toLowerCase() === 'me') return ownerJid(sock)
  if (value.includes('@')) return value
  const digits = value.replace(/\D/g, '')
  return digits ? toJid(digits) : ownerJid(sock)
}

const SKIP_TYPES = new Set(['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage', 'messageContextInfo'])

function statusType(raw) {
  const B = getBaileys()
  const content = B.normalizeMessageContent(raw.message) || {}
  const type = B.getContentType(content)
  return { content, type: type && !SKIP_TYPES.has(type) ? type : null }
}

async function forwardStatus(sock, raw, number) {
  const B = getBaileys()
  const { content, type } = statusType(raw)
  if (!type) return
  const target = forwardTarget(sock)
  const header = lang.plugins.status.header.format(raw.pushName || '', number)
  if (type === 'conversation' || type === 'extendedTextMessage') {
    const text = content.conversation || content.extendedTextMessage?.text || ''
    return sock.sendMessage(target, { text: `${header}\n\n${text}` }, { quoted: raw })
  }
  const copy = B.proto.Message.decode(B.proto.Message.encode(raw.message).finish())
  const generated = B.generateWAMessageFromContent(target, copy, { quoted: raw, userJid: sock.user.id })
  await sock.relayMessage(target, generated.message, { messageId: generated.key.id })
}

function rememberLid(sock, raw) {
  const ids = [raw.key.participant || raw.participant, raw.key.participantAlt || raw.key.participantPn].filter(Boolean)
  const lid = ids.find((j) => j.endsWith('@lid'))
  const pn = ids.find((j) => j.endsWith('@s.whatsapp.net'))
  if (!lid || !pn) return
  try {
    const B = getBaileys()
    sock.signalRepository?.lidMapping?.storeLIDPNMappings?.([{ lid: B.jidNormalizedUser(lid), pn: B.jidNormalizedUser(pn) }])?.catch?.(() => {})
  } catch {}
}

async function handleStatus(sock, raw) {
  const options = parseStatusView(config.AUTO_STATUS_VIEW)
  if (!options.enabled) return
  const author = raw.key.participant || raw.participant
  if (!author || !statusType(raw).type) return
  const own = [sock.user?.id, sock.user?.lid].filter(Boolean).map(bare)
  if (own.includes(bare(author))) return
  const numbers = [raw.key.participantAlt, raw.key.participantPn, author].filter(Boolean).map(num)
  if (options.only && !numbers.some((n) => options.only.has(n))) return
  if (options.except && numbers.some((n) => options.except.has(n))) return

  rememberLid(sock, raw)
  const run = async () => {
    if (!options.hideView) await sock.readMessages([raw.key]).catch(() => {})

    const emojis = statusEmojis(config.STATUS_VIEW_EMOJI)
    if (emojis.length) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)]
      await sock
        .sendMessage('status@broadcast', { react: { text: emoji, key: raw.key } }, { statusJidList: [author, sock.user.id] })
        .catch((error) => logger.warn(`réaction statut : ${error.message}`))
    }

    if (config.STATUS_VIEW_MSG) {
      const last = lastReply.get(numbers[0]) || 0
      if (Date.now() - last > REPLY_COOLDOWN) {
        lastReply.set(numbers[0], Date.now())
        const to = raw.key.participantAlt || raw.key.participantPn || author
        await sock.sendMessage(to, { text: config.STATUS_VIEW_MSG.replace(/\\n/g, '\n') }, { quoted: raw }).catch(() => {})
      }
    }

    if (!options.noDownload) await forwardStatus(sock, raw, numbers[0]).catch((error) => logger.warn(`renvoi du statut : ${error.message}`))
  }

  if (options.delay) setTimeout(() => run().catch(() => {}), 1000 + Math.floor(Math.random() * 299000)).unref?.()
  else await run()
}

bot({ on: 'status' }, handleStatus)


const OPTION_WORDS = ['no-dl', 'hide-view', 'delay', 'only-view', 'except-view']

bot(
  {
    pattern: 'status ?(.*)',
    desc: lang.plugins.status.desc,
    type: 'settings',
  },
  async (message, match) => {
    const t = lang.plugins.status
    const value = (match || '').trim()
    const lower = value.toLowerCase()
    const saved = (key, shown) => message.reply(lang.plugins.settings.saved.format(key, shown))

    const emoji = /^emoji\s+(.+)$/i.exec(value)
    if (emoji) {
      const v = emoji[1].trim().toLowerCase() === 'off' ? '' : emoji[1].trim()
      setVar('STATUS_VIEW_EMOJI', v)
      let note = ''
      if (v && !parseStatusView(config.AUTO_STATUS_VIEW).enabled) {
        setVar('AUTO_STATUS_VIEW', 'true')
        note = t.auto_on
      }
      return message.reply(lang.plugins.settings.saved.format('STATUS_VIEW_EMOJI', v || 'off') + note)
    }
    const msg = /^msg\s+([\s\S]+)$/i.exec(value)
    if (msg) {
      const v = msg[1].trim().toLowerCase() === 'off' ? '' : msg[1].trim()
      setVar('STATUS_VIEW_MSG', v)
      return saved('STATUS_VIEW_MSG', v || 'off')
    }
    const forward = /^forward\s+(.+)$/i.exec(value)
    if (forward) {
      const v = forward[1].trim().toLowerCase() === 'me' ? '' : forward[1].replace(/[^\d@.a-z]/gi, '')
      setVar('STATUS_FORWARD_JID', v)
      return saved('STATUS_FORWARD_JID', v || t.own_chat)
    }

    if (['on', 'true'].includes(lower)) {
      setVar('AUTO_STATUS_VIEW', 'true')
      return saved('AUTO_STATUS_VIEW', 'true')
    }
    if (['off', 'false'].includes(lower)) {
      setVar('AUTO_STATUS_VIEW', 'false')
      return saved('AUTO_STATUS_VIEW', 'false')
    }
    if (OPTION_WORDS.some((w) => lower.includes(w))) {
      setVar('AUTO_STATUS_VIEW', value)
      return saved('AUTO_STATUS_VIEW', value)
    }

    await message.reply(
      t.usage.format(
        config.AUTO_STATUS_VIEW,
        config.STATUS_VIEW_EMOJI || 'off',
        config.STATUS_VIEW_MSG || 'off',
        config.STATUS_FORWARD_JID || t.own_chat
      )
    )
  }
)

module.exports = { handleStatus, forwardTarget, statusEmojis }
