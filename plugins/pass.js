const { bot, lang, prefix, num } = require('../lib')
const pass = require('../lib/pass')

const where = (message) => (message.isGroup ? message.jid : `+${num(message.jid)}`)
const lines = (list) => list.map((n) => `- ${n}`).join('\n')

bot(
  {
    pattern: 'pass ?(.*)',
    desc: lang.plugins.pass.desc,
    type: 'owner',
  },
  async (message, match) => {
    const t = lang.plugins.pass
    const input = String(match || '').trim()

    if (!input) {
      const list = pass.listFor(message.jid)
      if (!list.length) return message.send(t.none.format(prefix()))
      return message.send(t.list.format(where(message), lines(list), list.length, prefix()))
    }

    const del = /^(?:del|remove|rm|off)\b\s*([\s\S]*)$/i.exec(input)
    if (del) {
      if (!del[1].trim()) return message.send(t.usage.format(prefix()))
      const { removed, missing } = pass.remove(message.jid, del[1])
      if (/^\s*all\s*$/i.test(del[1])) return message.send(t.cleared)
      const parts = []
      if (removed.length) parts.push(t.removed.format(where(message), lines(removed)))
      if (missing.length) parts.push(t.missing.format(missing.join(', ')))
      return message.send(parts.join('\n\n'))
    }

    const { added, already, unknown, locked } = pass.add(message.jid, input)
    const parts = []
    if (added.length) parts.push(t.added.format(where(message), lines(added)))
    if (already.length) parts.push(t.already.format(already.join(', ')))
    if (locked.length) parts.push(t.locked.format(locked.join(', ')))
    if (unknown.length) parts.push(t.unknown.format(unknown.join(', '), prefix()))
    await message.send(parts.join('\n\n') || t.usage.format(prefix()))
  }
)
