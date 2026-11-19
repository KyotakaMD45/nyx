const { bot, lang, db, bare } = require('../lib')

const NS = 'afk'
const COOLDOWN = 60 * 1000
const lastReply = new Map()

const state = () => db.get(NS, 'state', null)

function since(seconds) {
  let s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  s %= 86400
  const h = Math.floor(s / 3600)
  s %= 3600
  const m = Math.floor(s / 60)
  s %= 60
  return [d && `${d}j`, h && `${h}h`, m && `${m}min`, `${s}s`].filter(Boolean).join(' ')
}

function awayText(afk) {
  const elapsed = since(Date.now() / 1000 - afk.since)
  const reason = afk.reason || lang.plugins.afk.default_reason
  if (reason.includes('#lastseen')) return reason.split('#lastseen').join(elapsed)
  return lang.plugins.afk.reply.format(reason, elapsed)
}

function stop() {
  db.del(NS, 'state')
  lastReply.clear()
}

bot(
  {
    pattern: 'afk ?(.*)',
    desc: lang.plugins.afk.desc,
    type: 'misc',
  },
  async (message, match) => {
    const t = lang.plugins.afk
    const input = String(match || '').trim()
    if (input.toLowerCase() === 'off') {
      const was = state()
      stop()
      return message.reply(was ? t.not_afk : t.already_off)
    }
    if (!input) {
      const current = state()
      return message.reply(current ? t.status.format(awayText(current)) : t.example)
    }
    db.set(NS, 'state', { reason: input, since: Math.floor(Date.now() / 1000) })
    lastReply.clear()
    await message.reply(t.enabled.format(input.split('#lastseen').join('0s')))
  }
)

bot({ on: 'message' }, async (message) => {
  const afk = state()
  if (!afk || !message.text && !message.type) return
  if (message.fromMe) {
    if (/^\s*\W?\s*afk\b/i.test(message.text || '')) return
    stop()
    return message.send(lang.plugins.afk.not_afk, { quoted: message.data }).catch(() => {})
  }
  if (message.jid === 'status@broadcast') return
  const own = [message.client.user?.id, message.client.user?.lid].filter(Boolean).map(bare)
  const mentioned = (message.mentions || []).some((jid) => own.includes(bare(jid)))
  const repliedToMe = !!message.reply_message?.fromMe
  if (message.isGroup && !mentioned && !repliedToMe) return
  const key = `${message.jid}|${message.sender}`
  const now = Date.now()
  if (now - (lastReply.get(key) || 0) < COOLDOWN) return
  lastReply.set(key, now)
  await message.send(awayText(afk), { quoted: message.data }).catch(() => {})
})

module.exports = { awayText, since }
