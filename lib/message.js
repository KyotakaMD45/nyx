// Message wrapper given to plugins (same spirit as Levanter's Message):
//   message.jid, message.isGroup, message.sender, message.text, message.fromMe
//   message.image / video / audio / sticker / document, message.viewOnce
//   message.reply_message (quoted message, same fields + download())
//   message.send(content, options, type), message.reply(text), message.react(emoji), message.download()
const pino = require('pino')
const { getBaileys } = require('./baileys')
const { num, bare } = require('./utils')

const silent = pino({ level: 'silent' })

function extractText(content, type) {
  if (!content || !type) return ''
  const m = content[type]
  if (typeof m === 'string') return m
  return (
    m?.text ||
    m?.caption ||
    m?.selectedButtonId ||
    m?.singleSelectReply?.selectedRowId ||
    m?.selectedId ||
    ''
  )
}

function mediaFlags(type) {
  return {
    image: type === 'imageMessage',
    video: type === 'videoMessage' || type === 'ptvMessage',
    audio: type === 'audioMessage',
    sticker: type === 'stickerMessage',
    document: type === 'documentMessage' || type === 'documentWithCaptionMessage',
  }
}

function isViewOnce(rawMessage, inner) {
  return !!(
    rawMessage?.viewOnceMessage ||
    rawMessage?.viewOnceMessageV2 ||
    rawMessage?.viewOnceMessageV2Extension ||
    inner?.viewOnce
  )
}

async function download(sock, waMessage) {
  const B = getBaileys()
  return B.downloadMediaMessage(waMessage, 'buffer', {}, { logger: silent, reuploadRequest: sock.updateMediaMessage })
}

class ReplyMessage {
  constructor(sock, contextInfo, chatJid) {
    const B = getBaileys()
    this.client = sock
    const quoted = contextInfo.quotedMessage
    const content = B.normalizeMessageContent(quoted) || {}
    this.type = B.getContentType(content)
    const inner = content[this.type] || {}
    this.message = quoted
    this.text = extractText(content, this.type)
    this.senderJid = contextInfo.participant || chatJid
    this.sender = num(this.senderJid)
    const own = [sock.user?.id, sock.user?.lid].filter(Boolean).map(bare)
    this.fromMe = own.includes(bare(this.senderJid))
    this.key = { remoteJid: chatJid, id: contextInfo.stanzaId, participant: contextInfo.participant, fromMe: this.fromMe }
    this.mimetype = inner.mimetype || ''
    this.viewOnce = isViewOnce(quoted, inner)
    Object.assign(this, mediaFlags(this.type))
  }

  download() {
    return download(this.client, { key: this.key, message: this.message })
  }
}

class Message {
  constructor(sock, raw) {
    const B = getBaileys()
    this.client = sock
    this.data = raw
    this.key = raw.key
    this.id = raw.key.id
    this.jid = raw.key.remoteJid
    this.isGroup = String(this.jid).endsWith('@g.us')
    this.fromMe = !!raw.key.fromMe
    this.pushName = raw.pushName || ''

    const content = B.normalizeMessageContent(raw.message) || {}
    this.type = B.getContentType(content)
    const inner = content[this.type] || {}
    this.text = extractText(content, this.type)
    this.mimetype = inner.mimetype || ''
    this.viewOnce = isViewOnce(raw.message, inner)
    Object.assign(this, mediaFlags(this.type))

    // Sender: prefer the phone-number form when Baileys gives both (LID world).
    if (this.isGroup) this.senderJid = raw.key.participantAlt || raw.key.participantPn || raw.key.participant
    else if (this.fromMe) this.senderJid = sock.user?.id
    else this.senderJid = raw.key.remoteJidAlt || this.jid
    this.senderIds = [raw.key.participant, raw.key.participantAlt, raw.key.participantPn, this.senderJid]
      .filter(Boolean)
      .map(bare)
    this.sender = num(this.senderJid)

    const context = inner.contextInfo || {}
    this.mentions = context.mentionedJid || []
    this.reply_message = context.quotedMessage ? new ReplyMessage(sock, context, this.jid) : null
  }

  async send(content, options = {}, type = 'text') {
    const { jid = this.jid, quoted, mentions, caption, mimetype, fileName, ptt, gif } = options
    const media = (value) => (Buffer.isBuffer(value) ? value : { url: String(value) })
    let payload
    switch (type) {
      case 'text':
        payload = { text: String(content), mentions }
        break
      case 'image':
        payload = { image: media(content), caption, mentions }
        break
      case 'video':
        payload = { video: media(content), caption, mimetype, mentions, gifPlayback: !!gif }
        break
      case 'audio':
        payload = { audio: media(content), mimetype: mimetype || 'audio/mpeg', ptt: !!ptt }
        break
      case 'sticker':
        payload = { sticker: media(content) }
        break
      case 'document':
        payload = { document: media(content), mimetype: mimetype || 'application/octet-stream', fileName: fileName || 'file', caption }
        break
      default:
        payload = content // raw Baileys content
    }
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]
    return this.client.sendMessage(jid, payload, quoted ? { quoted } : {})
  }

  reply(text, options = {}) {
    return this.send(text, { quoted: this.data, ...options })
  }

  react(emoji) {
    return this.client.sendMessage(this.jid, { react: { text: emoji, key: this.key } })
  }

  download() {
    return download(this.client, this.data)
  }
}

module.exports = { Message, ReplyMessage }
