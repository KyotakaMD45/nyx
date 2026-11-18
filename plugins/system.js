const os = require('os')
const { bot, lang, config, commands, prefixes, runtime, ram, restart } = require('../lib')

bot(
  {
    pattern: 'alive ?(.*)',
    desc: lang.plugins.alive.desc,
    type: 'system',
    fromMe: false,
  },
  async (message) => {
    const values = {
      '#name': config.BOT_NAME,
      '#version': config.VERSION,
      '#uptime': runtime(process.uptime()),
      '#ram': ram(),
      '#prefix': prefixes()[0] || '',
    }
    let text = config.ALIVE_MSG
    if (text) {
      for (const [key, value] of Object.entries(values)) text = text.split(key).join(value)
      text = text.replace(/\\n/g, '\n')
    } else {
      text = lang.plugins.alive.card.format(config.BOT_NAME, config.VERSION, values['#uptime'], values['#ram'], os.platform())
    }
    await message.reply(text)
  }
)

bot(
  {
    pattern: 'ping ?(.*)',
    desc: lang.plugins.ping.desc,
    type: 'system',
    fromMe: false,
  },
  async (message) => {
    const start = Date.now()
    const sent = await message.reply(lang.plugins.ping.wait)
    const ms = Date.now() - start
    const text = lang.plugins.ping.result.format(ms)
    try {
      await message.client.sendMessage(message.jid, { text, edit: sent.key })
    } catch {
      await message.reply(text)
    }
  }
)

const TYPE_ORDER = ['system', 'settings', 'owner', 'group', 'media', 'ai', 'misc']

bot(
  {
    pattern: 'menu ?(.*)',
    alias: ['help', 'list'],
    desc: lang.plugins.menu.desc,
    type: 'system',
    fromMe: false,
  },
  async (message) => {
    const prefix = prefixes()[0] || ''
    const groups = {}
    for (const cmd of commands) (groups[cmd.type] ||= []).push(cmd)
    const types = Object.keys(groups).sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a)
      const ib = TYPE_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    let text = lang.plugins.menu.header.format(config.BOT_NAME, config.VERSION, prefix, runtime(process.uptime()), commands.length)
    for (const type of types) {
      text += `\n\n*${lang.plugins.menu.types[type] || type.toUpperCase()}*`
      for (const cmd of groups[type].sort((a, b) => a.name.localeCompare(b.name))) {
        text += `\n› ${prefix}${cmd.name}${cmd.desc ? ` — ${cmd.desc}` : ''}`
      }
    }
    await message.reply(text)
  }
)

bot(
  {
    pattern: 'restart ?(.*)',
    desc: lang.plugins.restart.desc,
    type: 'system',
  },
  async (message) => {
    await message.reply(lang.plugins.restart.restarting)
    restart()
  }
)
