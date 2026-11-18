const { bot, lang, config, setVar, num, targetOf } = require('../lib')

const sudoList = () => [...config.SUDO]

bot(
  {
    pattern: 'setsudo ?(.*)',
    desc: lang.plugins.setsudo.desc,
    type: 'owner',
  },
  async (message, match) => {
    const target = targetOf(message, match)
    if (!target) return message.reply(lang.plugins.setsudo.usage)
    const number = num(target)
    const list = sudoList()
    if (list.includes(number)) return message.reply(lang.plugins.setsudo.already.format(number))
    setVar('SUDO', [...list, number].join(','))
    await message.reply(lang.plugins.setsudo.added.format(number))
  }
)

bot(
  {
    pattern: 'delsudo ?(.*)',
    desc: lang.plugins.delsudo.desc,
    type: 'owner',
  },
  async (message, match) => {
    const target = targetOf(message, match)
    if (!target) return message.reply(lang.plugins.delsudo.usage)
    const number = num(target)
    const list = sudoList()
    if (!list.includes(number)) return message.reply(lang.plugins.delsudo.not_sudo.format(number))
    setVar('SUDO', list.filter((n) => n !== number).join(','))
    await message.reply(lang.plugins.delsudo.removed.format(number))
  }
)

bot(
  {
    pattern: 'getsudo ?(.*)',
    desc: lang.plugins.getsudo.desc,
    type: 'owner',
  },
  async (message) => {
    const list = sudoList()
    if (!list.length) return message.reply(lang.plugins.getsudo.empty)
    await message.reply(`${lang.plugins.getsudo.title}\n${list.map((n) => `• +${n}`).join('\n')}`)
  }
)

bot(
  {
    pattern: 'block ?(.*)',
    desc: lang.plugins.block.desc,
    type: 'owner',
  },
  async (message, match) => {
    const target = targetOf(message, match) || (!message.isGroup ? message.jid : null)
    if (!target) return message.reply(lang.plugins.block.usage)
    await message.client.updateBlockStatus(target, 'block')
    await message.reply(lang.plugins.block.blocked.format(num(target)))
  }
)

bot(
  {
    pattern: 'unblock ?(.*)',
    desc: lang.plugins.unblock.desc,
    type: 'owner',
  },
  async (message, match) => {
    const target = targetOf(message, match) || (!message.isGroup ? message.jid : null)
    if (!target) return message.reply(lang.plugins.unblock.usage)
    await message.client.updateBlockStatus(target, 'unblock')
    await message.reply(lang.plugins.unblock.unblocked.format(num(target)))
  }
)

bot(
  {
    pattern: 'jid ?(.*)',
    desc: lang.plugins.jid.desc,
    type: 'owner',
  },
  async (message, match) => {
    const target = targetOf(message, match) || message.jid
    await message.reply(target)
  }
)
