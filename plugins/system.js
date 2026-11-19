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
        await message.reportError?.(error)
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

const categoryName = (type) => lang.plugins.menu.categories?.[type] || `✨ ${textToStylist(type, 'smallcaps')}`
const plain = (text) => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function findCategory(groups, wanted) {
  if (!wanted) return null
  if (groups[wanted]) return wanted
  const key = plain(wanted)
  const names = lang.plugins.menu.category_names || {}
  return Object.keys(groups).find((type) => plain(names[type] || '').startsWith(key)) || null
}

bot(
  {
    pattern: 'menu ?(.*)',
    desc: lang.plugins.menu.desc,
    type: 'system',
    fromMe: false,
  },
  async (message, match) => {
    const t = lang.plugins.menu
    const groups = {}
    for (const cmd of commands) (groups[cmd.type.toLowerCase()] ||= []).push(cmd.name.trim())
    const only = findCategory(groups, String(match || '').trim().toLowerCase())
    const types = only ? [only] : Object.keys(groups).sort((a, b) => plain(categoryName(a).replace(/^\S+\s/, '')).localeCompare(plain(categoryName(b).replace(/^\S+\s/, ''))))
    const sections = types.map((type) => {
      const names = groups[type].sort((a, b) => a.localeCompare(b))
      return [`┏━━ ❮ ${categoryName(type)} ❯ ━━`, ...names.map((name) => `┃ ◈ ${textToStylist(name, 'smallcaps')}`), '┗━━━━━━━━━━━━━━'].join('\n')
    })
    await message.send([infoBox(t.menu, message), ...sections, t.footer.format(prefix())].join('\n\n'))
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
    const t = lang.plugins.menu
    const list = sortedCommands()
    const width = String(list.length).length
    const names = list.map((cmd, i) => `${String(i + 1).padStart(width, '0')} ◦ ${cmd.name}`)
    const column = Math.max(...names.map((n) => n.length)) + 2
    const rows = []
    for (let i = 0; i < names.length; i += 2) rows.push(names[i].padEnd(column) + (names[i + 1] || ''))
    await message.send([infoBox(t.help, message), '```' + rows.join('\n') + '```', t.help_footer.format(prefix())].join('\n\n'))
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
      .map((cmd) => `◈ *${prefix()}${cmd.name}*\n   ↳ _${cmd.desc || '-'}_`)
      .join('\n\n')
    await message.send(`🌙 *${config.BOT_NAME}* · ${commands.length}\n\n${text}`)
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
