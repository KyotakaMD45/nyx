const { bot, lang, config, setVar, logger } = require('../lib')
const { DELETE_SCOPES } = require('../lib/handler')

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

function deleteJid(dest) {
  if (/^\d[\d-]*@g\.us$/.test(dest)) return dest
  const digits = dest.replace(/\D/g, '')
  return /^\+?[\d\s-]+(@s\.whatsapp\.net)?$/.test(dest) && digits.length >= 6 ? `${digits}@s.whatsapp.net` : null
}

bot(
  {
    pattern: 'delete ?(.*)',
    alias: ['antidelete'],
    desc: lang.plugins.delete.desc,
    type: 'settings',
  },
  async (message, match) => {
    const t = lang.plugins.delete
    const parts = String(match || '').trim().split(/\s+/).filter(Boolean)
    const dest = (parts[0] || '').toLowerCase()
    const scope = (parts[1] || '').toLowerCase()
    const off = ['off', 'false', 'null'].includes(dest)
    const jid = !off && !['p', 'g'].includes(dest) ? deleteJid(parts[0] || '') : null

    if (!dest || (!off && !['p', 'g'].includes(dest) && !jid)) return message.send(t.example)
    if (scope && !DELETE_SCOPES.includes(scope)) return message.send(t.example)

    if (jid) {
      try {
        if (jid.endsWith('@g.us')) await message.client.groupMetadata(jid)
        else {
          const [found] = (await message.client.onWhatsApp(jid)) || []
          if (!found?.exists) return message.send(t.invalid_jid)
        }
      } catch {
        return message.send(t.invalid_jid)
      }
    }

    if (off) {
      setVar('ANTI_DELETE', 'false')
      return message.send(t.disabled)
    }
    const stored = [jid ? (jid.endsWith('@g.us') ? jid : jid.split('@')[0]) : dest, scope].filter(Boolean).join(' ')
    setVar('ANTI_DELETE', stored)
    const destText = jid ? t.dest_jid.format(jid.endsWith('@g.us') ? jid : `+${jid.split('@')[0]}`) : dest === 'p' ? t.dest_sudo : t.dest_chat
    const scopeText = scope ? `\n${t[`scope_${scope.replace('-', '_')}`]}` : ''
    await message.send(destText + scopeText)
  }
)

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
