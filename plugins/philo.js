const path = require('path')
const { bot, lang, config, db, logger, nyx } = require('../lib')
const { parseTime, nowParts } = require('./automute')
const { ownerJid } = require('../lib/owner')

// Citations de philosophie classées selon le programme ivoirien (Terminales A et C-D-E).
// Envoi automatique chaque jour aux heures choisies, comme automute.
// db 'autophilo' -> { [jid]: { times: ['07:00'], theme: 'liberte' | null, i: 0 } }

const NS = 'autophilo'
const MAX_TIMES = 4
const VAR_KEY = '__var__'
const DATA = require(path.join(__dirname, '..', 'media', 'philo.json'))

const ALL = []
for (const comp of DATA.competences) {
  for (const lecon of comp.lecons) {
    for (const c of lecon.citations) ALL.push({ ...c, comp, lecon })
  }
}

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// Mélange les leçons : une citation de chaque leçon à tour de rôle, pour varier les thèmes.
function rotation(filter) {
  const groups = []
  for (const comp of DATA.competences) {
    for (const lecon of comp.lecons) {
      const list = ALL.filter((q) => q.lecon === lecon && (!filter || filter(q)))
      if (list.length) groups.push(list)
    }
  }
  const out = []
  for (let k = 0; groups.some((g) => k < g.length); k++) for (const g of groups) if (k < g.length) out.push(g[k])
  return out
}

// Trouve une compétence ou une leçon à partir d'un mot : liberte, verite, bonheur, religion…
function findTheme(word) {
  const w = normalize(word)
  if (!w) return null
  for (const comp of DATA.competences) {
    if (comp.id === w || normalize(comp.numero) === w || normalize(comp.theme).includes(w)) return { id: comp.id, label: comp.theme }
    for (const lecon of comp.lecons) {
      if (lecon.id === w || normalize(lecon.titre).includes(w) || lecon.notions.some((n) => normalize(n).includes(w)))
        return { id: lecon.id, label: lecon.titre }
    }
  }
  return null
}

const matches = (themeId) => (q) => !themeId || q.comp.id === themeId || q.lecon.id === themeId

const any = (list, random = Math.random) => list[Math.floor(random() * list.length)]

function format(q, title = lang.plugins.philo.title, random = Math.random) {
  const sujet = any(q.lecon.sujets, random)
  return lang.plugins.philo.card.format(title, q.comp.numero, q.comp.theme, q.lecon.titre, q.t, q.a, q.o, q.n, sujet, any(DATA.encouragements, random))
}

// Heures de la variable AUTO_PHILO / AUTO_ANIME : "07:00,19:00" (vide ou off = rien).
function varTimes(value) {
  const raw = String(value || '').trim()
  if (!raw || /^(off|false|non|no|0)$/i.test(raw)) return []
  return [...new Set(raw.split(/[\s,;]+/).map(parseTime).filter(Boolean))].slice(0, 4).sort()
}

function pick(themeId, index) {
  const list = rotation(matches(themeId))
  return list.length ? list[((index % list.length) + list.length) % list.length] : null
}

const planOf = (jid) => db.get(NS, jid, null)

let current = null
const fired = new Map()
nyx.on('connection.open', (sock) => {
  current = sock
})

async function tick(sock = current, date = new Date()) {
  if (!sock?.user) return
  const { day, time } = nowParts(date)
  const plans = Object.entries(db.all(NS)).filter(([jid]) => jid !== VAR_KEY)
  if (varTimes(config.AUTO_PHILO).length) plans.push([VAR_KEY, { ...db.get(NS, VAR_KEY, {}), times: varTimes(config.AUTO_PHILO), theme: null }])
  for (const [key0, plan] of plans) {
    const jid = key0 === VAR_KEY ? ownerJid(sock) : key0
    if (!plan?.times?.includes(time)) continue
    const key = `${key0}:${time}`
    const stamp = `${day} ${time}`
    if (fired.get(key) === stamp) continue
    fired.set(key, stamp)
    const q = pick(plan.theme, plan.i || 0)
    if (!q) continue
    db.set(NS, key0, key0 === VAR_KEY ? { i: (plan.i || 0) + 1 } : { ...plan, i: (plan.i || 0) + 1 })
    try {
      await sock.sendMessage(jid, { text: format(q, lang.plugins.autophilo.title) })
    } catch (error) {
      logger.warn(`autophilo ${jid} : ${error?.message || error}`)
    }
  }
}

setInterval(() => tick().catch(() => {}), 20000).unref?.()

function themesText() {
  const lines = DATA.competences.map((comp) => {
    const lecons = comp.lecons
      .map((l) => `   › ${l.titre}${l.series ? ` (${l.series})` : ''} — _${l.id}_ (${l.citations.length})`)
      .join('\n')
    return `*${comp.numero}. ${comp.theme}* — _${comp.id}_\n${lecons}`
  })
  return lang.plugins.philo.themes.format(lines.join('\n\n'), ALL.length)
}

bot(
  {
    pattern: 'philo ?(.*)',
    alias: ['citation'],
    desc: lang.plugins.philo.desc,
    type: 'misc',
  },
  async (message, match) => {
    const t = lang.plugins.philo
    const input = String(match || '').trim()
    if (/^(themes?|th[eè]mes?|programme|liste)$/i.test(input)) return message.reply(themesText())
    const sujets = /^sujets?\s*(.*)$/i.exec(input)
    if (sujets) {
      const theme = sujets[1] ? findTheme(sujets[1]) : null
      if (sujets[1] && !theme) return message.reply(t.unknown.format(sujets[1]))
      const blocks = []
      for (const comp of DATA.competences) {
        for (const lecon of comp.lecons) {
          if (theme && comp.id !== theme.id && lecon.id !== theme.id) continue
          blocks.push(`*${lecon.titre}*\n${lecon.sujets.map((x) => `› ${x}`).join('\n')}`)
        }
      }
      return message.reply(t.sujets.format(theme?.label || t.all_label, blocks.join('\n\n'), any(DATA.encouragements)))
    }
    const theme = input ? findTheme(input) : null
    if (input && !theme) return message.reply(t.unknown.format(input))
    const list = rotation(matches(theme?.id))
    const q = list[Math.floor(Math.random() * list.length)]
    await message.reply(format(q))
  }
)

bot(
  {
    pattern: 'autophilo ?(.*)',
    alias: ['aphilo'],
    desc: lang.plugins.autophilo.desc,
    type: 'misc',
  },
  async (message, match) => {
    const t = lang.plugins.autophilo
    current = message.client
    const input = String(match || '').trim()
    const plan = planOf(message.jid)
    const themeLabel = (id) => (id ? findTheme(id)?.label || id : t.all)

    if (!input || /^info$/i.test(input)) {
      if (!plan?.times?.length) return message.reply(`${t.none}\n\n${t.usage}`)
      return message.reply(t.info.format(plan.times.join(', '), config.TZ, themeLabel(plan.theme)))
    }
    if (/^(off|del|stop|reset)$/i.test(input)) {
      if (!plan) return message.reply(t.none)
      db.del(NS, message.jid)
      return message.reply(t.off)
    }
    const themeArg = /^(?:theme|thème)\s+(.+)$/i.exec(input)
    if (themeArg) {
      if (!plan?.times?.length) return message.reply(`${t.none}\n\n${t.usage}`)
      if (/^(tout|tous|all)$/i.test(themeArg[1].trim())) {
        db.set(NS, message.jid, { ...plan, theme: null })
        return message.reply(t.theme_set.format(t.all))
      }
      const theme = findTheme(themeArg[1])
      if (!theme) return message.reply(lang.plugins.philo.unknown.format(themeArg[1]))
      db.set(NS, message.jid, { ...plan, theme: theme.id, i: 0 })
      return message.reply(t.theme_set.format(theme.label))
    }

    const times = []
    for (const part of input.split(/[\s,;]+/).filter(Boolean)) {
      const time = parseTime(part)
      if (!time) return message.reply(t.usage)
      if (!times.includes(time)) times.push(time)
    }
    if (times.length > MAX_TIMES) return message.reply(t.too_many.format(MAX_TIMES))
    times.sort()
    db.set(NS, message.jid, { times, theme: plan?.theme || null, i: plan?.i || 0 })
    await message.reply(t.set.format(times.join(', '), config.TZ, themeLabel(plan?.theme)))
  }
)

module.exports = { DATA, ALL, rotation, findTheme, pick, format, tick, varTimes, VAR_KEY }
