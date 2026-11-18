const { bot, lang, num, toJid, targetOf, isBotAdmin, participantJid } = require('../lib')

const t = lang.plugins

async function metadata(message) {
  return message.client.groupMetadata(message.jid)
}

async function asAdmin(message, fn) {
  const meta = await metadata(message)
  if (!isBotAdmin(meta, message.client)) return message.reply(lang.extra.bot_not_admin)
  return fn(meta)
}

function participantAction(name, action) {
  bot(
    {
      pattern: `${name} ?(.*)`,
      desc: t[name].desc,
      type: 'group',
      onlyGroup: true,
    },
    async (message, match) => {
      const target = targetOf(message, match)
      if (!target) return message.reply(t[name].usage)
      await asAdmin(message, async () => {
        const [result] = await message.client.groupParticipantsUpdate(message.jid, [target], action)
        const status = String(result?.status ?? '200')
        if (status !== '200') return message.reply(lang.extra.action_failed.format(status))
        await message.send(t[name].done.format(num(target)), { mentions: [target] })
      })
    }
  )
}

participantAction('kick', 'remove')
participantAction('promote', 'promote')
participantAction('demote', 'demote')

bot(
  {
    pattern: 'add ?(.*)',
    desc: t.add.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message, match) => {
    const digits = String(match || '').replace(/\D/g, '')
    if (digits.length < 6) return message.reply(t.add.usage)
    const target = toJid(digits)
    await asAdmin(message, async () => {
      const [result] = await message.client.groupParticipantsUpdate(message.jid, [target], 'add')
      const status = String(result?.status ?? '200')
      if (status === '200') return message.send(t.add.done.format(digits), { mentions: [target] })
      if (status === '403') return message.reply(t.add.privacy.format(digits))
      if (status === '409') return message.reply(t.add.already.format(digits))
      await message.reply(lang.extra.action_failed.format(status))
    })
  }
)

bot(
  {
    pattern: 'tagall ?(.*)',
    desc: t.tagall.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message, match) => {
    const meta = await metadata(message)
    const jids = meta.participants.map(participantJid)
    const lines = jids.map((jid) => `› @${num(jid)}`).join('\n')
    await message.send(`${match || t.tagall.default}\n\n${lines}`, { mentions: jids })
  }
)

bot(
  {
    pattern: 'tag ?(.*)',
    desc: t.tag.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message, match) => {
    const text = match || message.reply_message?.text
    if (!text) return message.reply(t.tag.usage)
    const meta = await metadata(message)
    await message.send(text, { mentions: meta.participants.map(participantJid) })
  }
)

bot(
  {
    pattern: 'link ?(.*)',
    desc: t.link.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message) => {
    await asAdmin(message, async () => {
      const code = await message.client.groupInviteCode(message.jid)
      await message.reply(`https://chat.whatsapp.com/${code}`)
    })
  }
)

bot(
  {
    pattern: 'revoke ?(.*)',
    desc: t.revoke.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message) => {
    await asAdmin(message, async () => {
      const code = await message.client.groupRevokeInvite(message.jid)
      await message.reply(t.revoke.done.format(`https://chat.whatsapp.com/${code}`))
    })
  }
)

function setting(name, value) {
  bot(
    {
      pattern: `${name} ?(.*)`,
      desc: t[name].desc,
      type: 'group',
      onlyGroup: true,
    },
    async (message) => {
      await asAdmin(message, async () => {
        await message.client.groupSettingUpdate(message.jid, value)
        await message.reply(t[name].done)
      })
    }
  )
}

setting('mute', 'announcement')
setting('unmute', 'not_announcement')

bot(
  {
    pattern: 'ginfo ?(.*)',
    desc: t.ginfo.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message) => {
    const meta = await metadata(message)
    const admins = meta.participants.filter((p) => p.admin).length
    const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('fr-FR') : '?'
    await message.reply(
      t.ginfo.card.format(meta.subject, meta.participants.length, admins, created, meta.announce ? 'on' : 'off', meta.desc || '—')
    )
  }
)

bot(
  {
    pattern: 'gname ?(.*)',
    desc: t.gname.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message, match) => {
    if (!match) return message.reply(t.gname.usage)
    await asAdmin(message, async () => {
      await message.client.groupUpdateSubject(message.jid, match)
      await message.reply(t.gname.done)
    })
  }
)

bot(
  {
    pattern: 'gdesc ?(.*)',
    desc: t.gdesc.desc,
    type: 'group',
    onlyGroup: true,
  },
  async (message, match) => {
    if (!match) return message.reply(t.gdesc.usage)
    await asAdmin(message, async () => {
      await message.client.groupUpdateDescription(message.jid, match)
      await message.reply(t.gdesc.done)
    })
  }
)
