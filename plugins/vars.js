const { bot, lang, setVar, getVar, delVar, setVars, isSecret, mask, session, restart } = require('../lib')

function parse(match) {
  const m = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:=|\s)\s*([\s\S]*)$/.exec(match || '')
  return m ? { key: m[1].toUpperCase(), value: m[2].trim() } : null
}

function explain(error) {
  if (error.message === 'invalid_key') return lang.plugins.setvar.invalid_key
  if (error.message === 'protected_key') return lang.plugins.setvar.protected
  return error.message
}

bot(
  {
    pattern: 'setvar ?(.*)',
    desc: lang.plugins.setvar.desc,
    type: 'settings',
  },
  async (message, match) => {
    const parsed = parse(match)
    if (!parsed || parsed.value === '') return message.reply(lang.plugins.setvar.usage)
    try {
      setVar(parsed.key, parsed.value)
    } catch (error) {
      return message.reply(explain(error))
    }
    const shown = isSecret(parsed.key) ? mask(parsed.value) : parsed.value
    await message.reply(lang.plugins.setvar.done.format(parsed.key, shown))
    if (parsed.key === 'SESSION_ID') {
      await message.reply(lang.plugins.setvar.session_restart)
      session.clearSession()
      restart()
    }
  }
)

bot(
  {
    pattern: 'getvar ?(.*)',
    desc: lang.plugins.getvar.desc,
    type: 'settings',
  },
  async (message, match) => {
    const key = (match || '').trim().toUpperCase()
    if (!key) return message.reply(lang.plugins.getvar.usage)
    const value = getVar(key)
    if (value === undefined) return message.reply(lang.plugins.getvar.not_set.format(key))
    const shown = isSecret(key) && message.isGroup ? mask(value) : value
    await message.reply(`*${key}* = ${shown || '""'}`)
  }
)

bot(
  {
    pattern: 'delvar ?(.*)',
    desc: lang.plugins.delvar.desc,
    type: 'settings',
  },
  async (message, match) => {
    const key = (match || '').trim().toUpperCase()
    if (!key) return message.reply(lang.plugins.delvar.usage)
    try {
      const existed = delVar(key)
      await message.reply(existed ? lang.plugins.delvar.done.format(key) : lang.plugins.getvar.not_set.format(key))
    } catch (error) {
      await message.reply(explain(error))
    }
  }
)

bot(
  {
    pattern: 'allvar ?(.*)',
    desc: lang.plugins.allvar.desc,
    type: 'settings',
  },
  async (message) => {
    const vars = setVars()
    if (!vars.length) return message.send(lang.plugins.allvar.empty)
    await message.send(vars.map(({ key, value }) => `${key} = ${value}`).join('\n\n'))
  }
)
