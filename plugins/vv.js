// Reveal a view-once photo / video / voice note: reply to it with .vv
const { bot, lang } = require('../lib')

bot(
  {
    pattern: 'vv ?(.*)',
    desc: lang.plugins.vv.desc,
    type: 'media',
  },
  async (message) => {
    const quoted = message.reply_message
    if (!quoted || !(quoted.image || quoted.video || quoted.audio)) return message.reply(lang.plugins.vv.usage)
    const media = await quoted.download()
    const caption = lang.plugins.vv.caption
    if (quoted.image) return message.send(media, { caption, quoted: message.data }, 'image')
    if (quoted.video) return message.send(media, { caption, quoted: message.data }, 'video')
    return message.send(media, { mimetype: quoted.mimetype || 'audio/ogg; codecs=opus', ptt: true, quoted: message.data }, 'audio')
  }
)
