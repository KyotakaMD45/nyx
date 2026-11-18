// Quick switches for the main variables + the automatic behaviours they control.
const { bot, lang, config, setVar, logger } = require('../lib')

// on/off command that sets a boolean variable.
function toggle(name, variable) {
  bot(
    {
      pattern: `${name} ?(.*)`,
      desc: lang.plugins[name].desc,
      type: 'settings',
    },
    async (message, match) => {
      const value = (match || '').trim().toLowerCase()
      if (value !== 'on' && value !== 'off') {
        const state = config[variable] ? 'on' : 'off'
        return message.reply(lang.plugins[name].usage.format(state))
      }
      setVar(variable, value === 'on' ? 'true' : 'false')
      await message.reply(lang.plugins.settings.saved.format(variable, value))
    }
  )
}

toggle('online', 'ALWAYS_ONLINE')
toggle('read', 'SEND_READ')
toggle('call', 'REJECT_CALL')

bot(
  {
    pattern: 'mode ?(.*)',
    desc: lang.plugins.mode.desc,
    type: 'settings',
  },
  async (message, match) => {
    const value = (match || '').trim().toLowerCase()
    if (value !== 'public' && value !== 'private') return message.reply(lang.plugins.mode.usage.format(config.MODE))
    setVar('MODE', value)
    await message.reply(lang.plugins.mode[value])
  }
)

bot(
  {
    pattern: 'antidelete ?(.*)',
    desc: lang.plugins.antidelete.desc,
    type: 'settings',
  },
  async (message, match) => {
    const value = (match || '').trim().toLowerCase()
    if (!value) return message.reply(lang.plugins.antidelete.usage.format(config.ANTI_DELETE))
    if (!['p', 'g', 'off'].includes(value) && !/^\d{6,}$/.test(value.replace(/\D/g, ''))) {
      return message.reply(lang.plugins.antidelete.usage.format(config.ANTI_DELETE))
    }
    const stored = value === 'off' ? 'false' : ['p', 'g'].includes(value) ? value : value.replace(/\D/g, '')
    setVar('ANTI_DELETE', stored)
    await message.reply(lang.plugins.settings.saved.format('ANTI_DELETE', stored))
  }
)

// Calls: rejected when REJECT_CALL is on, with an optional message (REJECT_CALL_MSG).
bot({ on: 'call' }, async (sock, calls) => {
  if (!config.REJECT_CALL) return
  for (const call of calls) {
    if (call.status !== 'offer') continue
    try {
      await sock.rejectCall(call.id, call.from)
      if (config.REJECT_CALL_MSG) await sock.sendMessage(call.from, { text: config.REJECT_CALL_MSG.replace(/\\n/g, '\n') })
    } catch (error) {
      logger.warn(`rejet d'appel : ${error.message}`)
    }
  }
})
