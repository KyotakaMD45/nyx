const { bot, lang } = require('../lib')

bot(
  {
    pattern: 'react ?(.*)',
    desc: lang.plugins.react.desc,
    type: 'media',
    fromMe: false,
  },
  async (message, match) => {
    if (!message.reply_message) return message.reply(lang.plugins.react.usage)
    const raw = String(match || '').trim()
    const emoji = ['off', 'remove', 'none'].includes(raw.toLowerCase()) ? '' : raw
    if (!raw) return message.reply(lang.plugins.react.usage)
    await message.client.sendMessage(message.jid, { react: { text: emoji, key: message.reply_message.key } })
  }
)
