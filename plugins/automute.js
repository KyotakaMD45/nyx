const { bot, lang, config, db, logger, nyx, isBotAdmin } = require('../lib')

// Fermeture / ouverture automatique des groupes, chaque jour à heure fixe (fuseau TZ).
// Données par groupe : db 'automute' -> { mute: 'HH:MM', unmute: 'HH:MM' }

const NS = 'automute'
const KINDS = {
  mute: { command: 'automute', alias: ['amute'], setting: 'announcement' },
  unmute: { command: 'autounmute', alias: ['aunmute'], setting: 'not_announcement' },
}

let current = null
const fired = new Map()

nyx.on('connection.open', (sock) => {
  current = sock
})

function parseTime(text) {
  const m = /^\s*(\d{1,2})\s*(?:[:hH.\s]\s*(\d{1,2})?)?\s*$/.exec(String(text || ''))
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2] || 0)
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function nowParts(date = new Date()) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: config.TZ }).formatToParts(date)
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).formatToParts(date)
  }
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

const planOf = (jid) => db.get(NS, jid, {})

function savePlan(jid, plan) {
  const clean = Object.fromEntries(Object.entries(plan).filter(([, v]) => v))
  if (Object.keys(clean).length) db.set(NS, jid, clean)
  else db.del(NS, jid)
}

async function tick(sock = current, date = new Date()) {
  if (!sock?.user) return
  const { day, time } = nowParts(date)
  for (const [jid, plan] of Object.entries(db.all(NS))) {
    for (const [kind, info] of Object.entries(KINDS)) {
      if (plan[kind] !== time) continue
      const key = `${jid}:${kind}`
      const stamp = `${day} ${time}`
      if (fired.get(key) === stamp) continue
      fired.set(key, stamp)
      try {
        await sock.groupSettingUpdate(jid, info.setting)
        await sock.sendMessage(jid, { text: lang.plugins[info.command].notice })
      } catch (error) {
        logger.warn(`${info.command} ${jid} : ${error?.message || error}`)
      }
    }
  }
}

setInterval(() => tick().catch(() => {}), 20000).unref?.()

for (const [kind, info] of Object.entries(KINDS)) {
  const other = kind === 'mute' ? 'unmute' : 'mute'
  bot(
    {
      pattern: `${info.command} ?(.*)`,
      alias: info.alias,
      desc: lang.plugins[info.command].desc,
      type: 'group',
      onlyGroup: true,
    },
    async (message, match) => {
      const t = lang.plugins[info.command]
      current = message.client
      const input = String(match || '').trim().toLowerCase()
      const plan = planOf(message.jid)

      if (!input || input === 'info') {
        return message.reply(plan[kind] ? t.info.format(plan[kind], config.TZ) : `${t.none}\n\n${t.usage}`)
      }
      if (['off', 'del', 'stop', 'reset'].includes(input)) {
        if (!plan[kind]) return message.reply(t.none)
        savePlan(message.jid, { ...plan, [kind]: null })
        return message.reply(t.off)
      }

      const time = parseTime(input)
      if (!time) return message.reply(t.usage)
      if (plan[other] === time) return message.reply(t.same)
      const meta = await message.client.groupMetadata(message.jid)
      if (!isBotAdmin(meta, message.client)) return message.reply(lang.extra.bot_not_admin)
      savePlan(message.jid, { ...plan, [kind]: time })
      await message.reply(t.set.format(time, config.TZ))
    }
  )
}

module.exports = { parseTime, nowParts, tick }
