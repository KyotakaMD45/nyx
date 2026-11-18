const { bot, lang, db, num, logger } = require('../lib')

function register(kind) {
  bot(
    {
      pattern: `${kind} ?(.*)`,
      desc: lang.plugins[kind].desc,
      type: 'group',
      onlyGroup: true,
    },
    async (message, match) => {
      const value = (match || '').trim()
      const current = db.get(kind, message.jid)
      if (value.toLowerCase() === 'on') {
        db.set(kind, message.jid, { on: true, text: current?.text || '' })
        return message.reply(lang.plugins[kind].enabled)
      }
      if (value.toLowerCase() === 'off') {
        db.set(kind, message.jid, { on: false, text: current?.text || '' })
        return message.reply(lang.plugins[kind].disabled)
      }
      if (value) {
        db.set(kind, message.jid, { on: true, text: value })
        return message.reply(lang.plugins[kind].saved)
      }
      const state = current?.on ? 'on' : 'off'
      await message.reply(lang.plugins[kind].usage.format(state, current?.text || lang.plugins[kind].default))
    }
  )
}

register('welcome')
register('goodbye')

bot({ on: 'group-participants' }, async (sock, event) => {
  const kind = event.action === 'add' ? 'welcome' : event.action === 'remove' ? 'goodbye' : null
  if (!kind) return
  const settings = db.get(kind, event.id)
  if (!settings?.on) return
  let subject = ''
  try {
    subject = (await sock.groupMetadata(event.id)).subject
  } catch (error) {
    logger.debug(`${kind} : ${error.message}`)
  }
  for (const participant of event.participants || []) {
    const jid = typeof participant === 'string' ? participant : participant.id
    const template = settings.text || lang.plugins[kind].default
    const text = template.split('&mention').join(`@${num(jid)}`).split('&group').join(subject).replace(/\\n/g, '\n')
    await sock.sendMessage(event.id, { text, mentions: [jid] }).catch(() => {})
  }
})
