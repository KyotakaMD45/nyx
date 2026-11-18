const os = require('os')
const { bot, lang, config, commands, prefix, prefixes, runtime, ram, restart, textToStylist, addSpace, getRam, getUptime, getDate, getPlatform } = require('../lib')
const alive = require('../lib/alive')

bot(
  {
    pattern: 'alive ?(.*)',
    desc: lang.plugins.alive.desc,
    type: 'system',
    fromMe: false,
  },
  async (message, match, ctx = {}) => {
    const t = lang.plugins.alive
    const input = String(match || '').trim()
    if (input && ctx.sudo) {
      if (input.toLowerCase() === 'get') {
        const current = alive.getAlive()
        return message.send(current ? [current.message, current.url].filter(Boolean).join('\n') : t.not_set)
      }
      if (['reset', 'off', 'del'].includes(input.toLowerCase())) {
        alive.resetAlive()
        return message.send(t.reset)
      }
      try {
        await alive.setAlive(input)
      } catch (error) {
        return message.send(t.media_failed.format(error.message))
      }
    }
    const card = t.card.format(config.BOT_NAME, config.VERSION, runtime(process.uptime()), ram(), os.platform())
    const { type, content, options } = await alive.aliveMessage(prefix(), card)
    await message.send(content, { ...options, quoted: message.data }, type)
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

const sortedCommands = () => commands.slice().sort((a, b) => a.name.localeCompare(b.name))

function infoBox(template, message) {
  const { time, day, date } = getDate()
  return template.format(
    prefix(),
    message.pushName || '-',
    time,
    day,
    date,
    config.VERSION,
    commands.length,
    getRam(),
    getUptime(),
    getPlatform(),
    textToStylist(config.BOT_NAME.toUpperCase(), 'smallcaps')
  )
}

bot(
  {
    pattern: 'menu ?(.*)',
    desc: lang.plugins.menu.desc,
    type: 'system',
    fromMe: false,
  },
  async (message, match) => {
    const groups = {}
    for (const cmd of commands) (groups[cmd.type.toLowerCase()] ||= []).push(cmd.name.trim())
    const wanted = String(match || '').trim().toLowerCase()
    const types = wanted && groups[wanted] ? [wanted] : Object.keys(groups).sort()
    let text = infoBox(lang.plugins.menu.menu, message) + '\n'
    for (const type of types) {
      text += ` ╭─❏ ${textToStylist(type, 'smallcaps')} ❏\n`
      for (const name of groups[type].sort((a, b) => a.localeCompare(b))) {
        text += ` │ ${textToStylist(name.toUpperCase(), 'mono')}\n`
      }
      text += ' ╰─────────────────\n'
    }
    await message.send(text.trim())
  }
)

bot(
  {
    pattern: 'help ?(.*)',
    desc: lang.plugins.menu.help_desc,
    type: 'system',
    fromMe: false,
  },
  async (message) => {
    const list = sortedCommands()
    const lines = [infoBox(lang.plugins.menu.help, message), '╭────────────────']
    list.forEach((cmd, i) => {
      lines.push(`│ ${i + 1} ${addSpace(i + 1, list.length)}${textToStylist(cmd.name.toUpperCase(), 'mono')}`)
    })
    lines.push('╰────────────────')
    await message.send(lines.join('\n'))
  }
)

bot(
  {
    pattern: 'list ?(.*)',
    desc: lang.plugins.menu.list_desc,
    type: 'system',
    fromMe: false,
  },
  async (message) => {
    const text = sortedCommands()
      .map((cmd) => `- *${cmd.name}*\n${cmd.desc || ''}\n`)
      .join('\n')
    await message.send(text.trim())
  }
)

bot(
  {
    pattern: 'restart ?(.*)',
    alias: ['reboot'],
    desc: lang.plugins.restart.desc,
    type: 'system',
  },
  async (message) => {
    await message.reply(lang.plugins.restart.restarting)
    restart()
  }
)
