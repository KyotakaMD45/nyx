// Quick switches for the main variables + the automatic behaviours they control.
const { bot, lang, config, setVar, logger, bare } = require('../lib')

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
    pattern: 'status ?(.*)',
    desc: lang.plugins.status.desc,
    type: 'settings',
  },
  async (message, match) => {
    const value = (match || '').trim()
    const lower = value.toLowerCase()
    if (lower === 'on' || lower === 'off') {
      setVar('AUTO_STATUS_VIEW', lower === 'on' ? 'true' : 'false')
      return message.reply(lang.plugins.settings.saved.format('AUTO_STATUS_VIEW', lower))
    }
    if (lower === 'emoji off') {
      setVar('STATUS_VIEW_EMOJI', '')
      return message.reply(lang.plugins.settings.saved.format('STATUS_VIEW_EMOJI', 'off'))
    }
    const emoji = /^emoji\s+(.+)$/i.exec(value)
    if (emoji) {
      setVar('STATUS_VIEW_EMOJI', emoji[1].trim())
      return message.reply(lang.plugins.settings.saved.format('STATUS_VIEW_EMOJI', emoji[1].trim()))
    }
    const state = config.AUTO_STATUS_VIEW ? 'on' : 'off'
    await message.reply(lang.plugins.status.usage.format(state, config.STATUS_VIEW_EMOJI || 'off'))
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

// Statuses: mark as seen (AUTO_STATUS_VIEW) and react (STATUS_VIEW_EMOJI, comma-separated = random).
bot({ on: 'status' }, async (sock, raw) => {
  if (!config.AUTO_STATUS_VIEW) return
  await sock.readMessages([raw.key])
  const emojis = config.STATUS_VIEW_EMOJI.split(',').map((e) => e.trim()).filter(Boolean)
  if (!emojis.length) return
  const emoji = emojis[Math.floor(Math.random() * emojis.length)]
  const author = raw.key.participant || raw.participant
  if (!author) return
  await sock.sendMessage(
    'status@broadcast',
    { react: { text: emoji, key: raw.key } },
    { statusJidList: [author, bare(sock.user.id)] }
  )
})

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
