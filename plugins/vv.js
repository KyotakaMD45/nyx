const { bot, lang, getBaileys } = require('../lib')

const JID_RE = /\d+@(?:s\.whatsapp\.net|g\.us|lid)/

function targetJid(match, fallback) {
  const text = String(match || '').trim()
  const jid = JID_RE.exec(text)
  if (jid) return jid[0]
  const digits = text.replace(/\D/g, '')
  return digits.length >= 6 ? `${digits}@s.whatsapp.net` : fallback
}

function revealContent(quoted) {
  const B = getBaileys()
  const inner = B.normalizeMessageContent(quoted) || {}
  const type = Object.keys(inner).find((k) => ['imageMessage', 'videoMessage', 'audioMessage'].includes(k))
  if (!type) return null
  const content = B.proto.Message.decode(B.proto.Message.encode({ [type]: inner[type] }).finish())
  delete content[type].viewOnce
  content[type].contextInfo = {}
  return { type, content }
}

async function relay(sock, jid, content) {
  const B = getBaileys()
  const message = B.generateWAMessageFromContent(jid, content, { userJid: sock.user.id })
  await sock.relayMessage(jid, message.message, { messageId: message.key.id })
  return message
}

async function resend(message, jid, quoted, type) {
  const media = await quoted.download()
  const caption = quoted.text || undefined
  if (type === 'imageMessage') return message.send(media, { jid, caption }, 'image')
  if (type === 'videoMessage') return message.send(media, { jid, caption }, 'video')
  return message.send(media, { jid, mimetype: quoted.mimetype || 'audio/ogg; codecs=opus', ptt: true }, 'audio')
}

bot(
  {
    pattern: 'vv ?(.*)',
    desc: lang.plugins.vv.desc,
    type: 'media',
  },
  async (message, match) => {
    const quoted = message.reply_message
    if (!quoted || !(quoted.image || quoted.video || quoted.audio)) return message.send(lang.plugins.vv.usage)
    const jid = targetJid(match, message.jid)
    const reveal = revealContent(quoted.message)
    if (reveal) {
      try {
        return await relay(message.client, jid, reveal.content)
      } catch {}
    }
    try {
      await resend(message, jid, quoted, reveal?.type || (quoted.image ? 'imageMessage' : quoted.video ? 'videoMessage' : 'audioMessage'))
    } catch {
      await message.send(lang.plugins.vv.failed)
    }
  }
)
