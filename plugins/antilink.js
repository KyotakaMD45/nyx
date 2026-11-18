// Antilink per group: "delete" removes the message, "kick" also removes the sender.
// Group admins and sudo users are never affected.
const { bot, lang, db, num, isSudo, isAdmin, isBotAdmin, logger } = require('../lib')

const LINK_RE = /(chat\.whatsapp\.com\/\S+|https?:\/\/\S+|wa\.me\/\S+)/i

bot(
  {
    pattern: 'antilink ?(.*)',
    desc: lang.plugins.antilink.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message, match) => {
    const value = (match || '').trim().toLowerCase()
    const current = db.get('antilink', message.jid, 'off')
    if (value === 'on' || value === 'delete') {
      db.set('antilink', message.jid, 'delete')
      return message.reply(lang.plugins.antilink.enabled.format('delete'))
    }
    if (value === 'kick') {
      db.set('antilink', message.jid, 'kick')
      return message.reply(lang.plugins.antilink.enabled.format('kick'))
    }
    if (value === 'off') {
      db.del('antilink', message.jid)
      return message.reply(lang.plugins.antilink.disabled)
    }
    await message.reply(lang.plugins.antilink.usage.format(current))
  }
)

bot({ on: 'text' }, async (message) => {
  if (!message.isGroup || message.fromMe) return
  const mode = db.get('antilink', message.jid)
  if (!mode || !LINK_RE.test(message.text)) return
  if (isSudo(message.client, message)) return
  const meta = await message.client.groupMetadata(message.jid)
  if (isAdmin(meta, message.senderIds)) return
  if (!isBotAdmin(meta, message.client)) return
  try {
    await message.client.sendMessage(message.jid, { delete: message.key })
    const author = message.key.participant || message.senderJid
    await message.send(lang.plugins.antilink.warning.format(num(author)), { mentions: [author] })
    if (mode === 'kick') await message.client.groupParticipantsUpdate(message.jid, [author], 'remove')
  } catch (error) {
    logger.warn(`antilink : ${error.message}`)
  }
})
