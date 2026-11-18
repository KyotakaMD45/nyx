const { bot, lang, config, setVar, logger } = require('../lib')
const { DELETE_SCOPES, parseAntiDelete } = require('../lib/handler')

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

function destinationCommand({ name, alias = [], variable, texts, onChange }) {
  bot(
    {
      pattern: `${name} ?(.*)`,
      alias,
      desc: texts().desc,
      type: 'settings',
    },
    async (message, match) => {
      const before = config[variable]
      const result = await applyDestination(message, match, variable, texts())
      if (result && onChange) await onChange(message, before, config[variable])
    }
  )
}

async function applyDestination(message, match, variable, t) {
  const fail = async (text) => {
    await message.send(text)
    return false
  }
  const parts = String(match || '').trim().split(/\s+/).filter(Boolean)
  const dest = (parts[0] || '').toLowerCase()
  const scope = (parts[1] || '').toLowerCase()
  const off = ['off', 'false', 'null'].includes(dest)
  const jid = !off && !['p', 'g'].includes(dest) ? deleteJid(parts[0] || '') : null

  if (!dest || (!off && !['p', 'g'].includes(dest) && !jid)) return fail(t.example)
  if (scope && !DELETE_SCOPES.includes(scope)) return fail(t.example)

  if (jid) {
    try {
      if (jid.endsWith('@g.us')) await message.client.groupMetadata(jid)
      else {
        const [found] = (await message.client.onWhatsApp(jid)) || []
        if (!found?.exists) return fail(t.invalid_jid)
      }
    } catch {
      return fail(t.invalid_jid)
    }
  }

  if (off) {
    setVar(variable, 'false')
    await message.send(t.disabled)
    return true
  }
  const stored = [jid ? (jid.endsWith('@g.us') ? jid : jid.split('@')[0]) : dest, scope].filter(Boolean).join(' ')
  setVar(variable, stored)
  const destText = jid ? t.dest_jid.format(jid.endsWith('@g.us') ? jid : `+${jid.split('@')[0]}`) : dest === 'p' ? t.dest_sudo : t.dest_chat
  const scopeText = scope ? `\n${t[`scope_${scope.replace('-', '_')}`]}` : ''
  await message.send(destText + scopeText)
  return true
}

destinationCommand({ name: 'delete', alias: ['antidelete'], variable: 'ANTI_DELETE', texts: () => lang.plugins.delete })

destinationCommand({
  name: 'antivv',
  variable: 'VV',
  texts: () => lang.plugins.antivv,
  onChange: async (message, before, after) => {
    const wasOn = !!parseAntiDelete(before)
    const isOn = !!parseAntiDelete(after)
    if (wasOn === isOn || typeof message.client.end !== 'function') return
    await message.send(lang.plugins.antivv.reconnecting)
    setTimeout(() => require('../lib/client').reconnect(), 1500)
  },
})

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
