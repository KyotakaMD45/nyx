const { bot, lang, num, config, setVar } = require('../lib')

function targetJid(match, fallback) {
  const text = String(match || '').trim()
  const group = /\d[\d-]*@g\.us/.exec(text)
  if (group) return group[0]
  const digits = text.replace(/\D/g, '')
  return digits.length >= 6 ? `${digits}@s.whatsapp.net` : fallback
}

bot(
  {
    pattern: 'vv ?(.*)',
    desc: lang.plugins.vv.desc,
    type: 'media',
  },
  async (message, match, ctx = {}) => {
    const t = lang.plugins.vv
    const option = String(match || '').trim().toLowerCase()
    if (['on', 'off'].includes(option) && ctx.sudo) {
      const before = require('../lib/client').viewOnceIdentity()
      setVar('VV', option === 'on' ? 'true' : 'false')
      await message.send(option === 'on' ? t.enabled : t.disabled)
      return require('./settings').applyIdentity(message, before)
    }
    const quoted = message.reply_message
    if (!quoted || !(quoted.image || quoted.video || quoted.audio)) return message.send(t.usage.format(config.VV ? '✅' : '❎'))
    let media
    try {
      media = await quoted.download()
    } catch {
      return message.send(t.failed)
    }
    const jid = targetJid(match, message.jid)
    const quote = jid === message.jid ? message.data : undefined
    const caption = [t.caption.format(num(quoted.senderJid)), quoted.text].filter(Boolean).join('\n\n')
    if (quoted.image) return message.send(media, { jid, caption, quoted: quote }, 'image')
    if (quoted.video) return message.send(media, { jid, caption, quoted: quote }, 'video')
    return message.send(media, { jid, mimetype: quoted.mimetype || 'audio/ogg; codecs=opus', ptt: true, quoted: quote }, 'audio')
  }
)
