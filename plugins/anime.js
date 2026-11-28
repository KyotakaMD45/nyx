const { bot, lang, config, db, logger, nyx } = require('../lib')
const { parseTime, nowParts } = require('./automute')
const { ownerJid } = require('../lib/owner')

// Nouveaux animes : source AniList (base communautaire de référence, API gratuite),
// MyAnimeList via Jikan en secours. Résumé traduit en français (IA si une clé est
// configurée, sinon traduction automatique). Contenus adultes et ecchi exclus.
// db 'autoanime' -> { [jid]: { times: ['18:00'], sent: [ids] } }

const NS = 'autoanime'
const VAR_KEY = '__var__'
const MAX_TIMES = 4
const MAX_SENT = 300
const DAY = 86400
const BLOCKED_GENRES = ['hentai', 'ecchi', 'erotica']

const QUERY_AIRING = `query ($from: Int, $to: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, episode: 1, sort: TIME) {
      episode airingAt
      media { ${mediaFields()} }
    }
  }
}`

const QUERY_SEASON = `query ($season: MediaSeason, $year: Int) {
  Page(perPage: 10) {
    media(season: $season, seasonYear: $year, type: ANIME, isAdult: false, sort: POPULARITY_DESC) { ${mediaFields()} }
  }
}`

const QUERY_SEARCH = `query ($q: String) {
  Page(perPage: 3) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${mediaFields()} }
  }
}`

function mediaFields() {
  return 'id isAdult format episodes averageScore popularity genres siteUrl countryOfOrigin title { romaji english native } coverImage { extraLarge large } studios(isMain: true) { nodes { name } } startDate { year month day } description(asHtml: false)'
}

async function anilist(query, variables) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.errors) throw new Error(data.errors?.[0]?.message || `AniList HTTP ${res.status}`)
  return data.data
}

const cleanText = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\(Source:[^)]*\)/gi, '')
    .replace(/\[Written by[^\]]*\]/gi, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/\n{2,}/g, '\n')
    .trim()

function shorten(text, max = 420) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')) + (end > max * 0.5 ? '' : '…')
}

const isSafe = (m) => m && !m.isAdult && !(m.genres || []).some((g) => BLOCKED_GENRES.includes(String(g).toLowerCase()))

function fromAnilist(m, airingAt) {
  return {
    id: `al:${m.id}`,
    title: m.title?.english || m.title?.romaji || m.title?.native || '?',
    native: m.title?.english && m.title?.romaji && m.title.romaji !== m.title.english ? m.title.romaji : '',
    format: m.format || '',
    episodes: m.episodes || null,
    score: m.averageScore || null,
    popularity: m.popularity || 0,
    genres: m.genres || [],
    studio: m.studios?.nodes?.[0]?.name || '',
    image: m.coverImage?.extraLarge || m.coverImage?.large || '',
    url: m.siteUrl || '',
    airingAt: airingAt || null,
    synopsis: cleanText(m.description),
  }
}

// Épisode 1 sorti entre `from` et `to` (secondes Unix), du plus populaire au moins populaire.
async function premieres(from, to) {
  const out = []
  try {
    for (let page = 1; page <= 4; page++) {
      const data = await anilist(QUERY_AIRING, { from, to, page })
      for (const s of data.Page.airingSchedules || []) if (isSafe(s.media)) out.push(fromAnilist(s.media, s.airingAt))
      if (!data.Page.pageInfo?.hasNextPage) break
    }
  } catch (error) {
    logger.warn(`anime AniList : ${error.message}`)
    return jikanFallback()
  }
  const seen = new Set()
  return out.filter((a) => !seen.has(a.id) && seen.add(a.id)).sort((a, b) => b.popularity - a.popularity)
}

// Secours : saison en cours sur MyAnimeList (Jikan), sans date d'épisode exacte.
async function jikanFallback() {
  try {
    const res = await fetch('https://api.jikan.moe/v4/seasons/now?sfw=true&limit=10', { signal: AbortSignal.timeout(20000) })
    const data = await res.json()
    return (data.data || [])
      .filter((m) => !(m.genres || []).some((g) => BLOCKED_GENRES.includes(String(g.name).toLowerCase())))
      .map((m) => ({
        id: `mal:${m.mal_id}`,
        title: m.title_english || m.title,
        native: m.title_japanese || '',
        format: m.type || '',
        episodes: m.episodes || null,
        score: m.score ? Math.round(m.score * 10) : null,
        popularity: m.members || 0,
        genres: (m.genres || []).map((g) => g.name),
        studio: m.studios?.[0]?.name || '',
        image: m.images?.jpg?.large_image_url || '',
        url: m.url || '',
        airingAt: null,
        synopsis: cleanText(m.synopsis),
      }))
  } catch {
    return []
  }
}

function currentSeason(date = new Date()) {
  const m = date.getUTCMonth()
  return { season: ['WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL', 'WINTER'][m], year: m === 11 ? date.getUTCFullYear() + 1 : date.getUTCFullYear() }
}

async function season() {
  const data = await anilist(QUERY_SEASON, currentSeason())
  return (data.Page.media || []).filter(isSafe).map((m) => fromAnilist(m))
}

async function search(q) {
  const data = await anilist(QUERY_SEARCH, { q })
  return (data.Page.media || []).filter(isSafe).map((m) => fromAnilist(m))
}

// Résumé en français : IA (Gemini / Groq) si une clé existe, sinon traduction automatique.
async function frenchSummary(text) {
  const source = shorten(text, 900)
  if (!source) return ''
  if (String(config.BOT_LANG).startsWith('en')) return shorten(source)
  const prompt = `Résume en français, en 2 ou 3 phrases simples et sans spoiler, ce synopsis d'anime. Réponds seulement avec le résumé.\n\n${source}`
  try {
    if (config.GEMINI_API_KEY) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim()
      if (out) return shorten(out)
    } else if (config.GROQ_API_KEY) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.GROQ_API_KEY}` },
        body: JSON.stringify({ model: config.GROQ_MODEL, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      const out = (data.choices?.[0]?.message?.content || '').trim()
      if (out) return shorten(out)
    }
  } catch {}
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q=${encodeURIComponent(shorten(source))}`,
      { signal: AbortSignal.timeout(15000) }
    )
    const data = await res.json()
    const out = (data?.[0] || []).map((x) => x?.[0] || '').join('').trim()
    if (out) return out
  } catch {}
  return shorten(source)
}

function when(seconds) {
  if (!seconds) return ''
  try {
    return new Intl.DateTimeFormat(String(config.BOT_LANG).startsWith('en') ? 'en-GB' : 'fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: config.TZ,
    }).format(new Date(seconds * 1000))
  } catch {
    return new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')
  }
}

async function card(a) {
  const t = lang.plugins.anime
  const lines = [`🎬 *${a.title}*${a.native ? `\n_${a.native}_` : ''}`]
  if (a.airingAt) lines.push(t.ep1.format(when(a.airingAt)))
  const info = [a.format, a.episodes ? t.episodes.format(a.episodes) : '', a.studio, a.score ? `⭐ ${a.score}/100` : ''].filter(Boolean)
  if (info.length) lines.push(`📺 ${info.join(' · ')}`)
  if (a.genres.length) lines.push(`🏷️ ${a.genres.slice(0, 5).join(', ')}`)
  const summary = await frenchSummary(a.synopsis)
  lines.push(`\n📝 ${summary || t.no_summary}`)
  if (a.url) lines.push(`\n🔗 ${a.url}`)
  return lines.join('\n')
}

async function sendAnime(sock, jid, list, header, quoted) {
  if (header) await sock.sendMessage(jid, { text: header }, quoted ? { quoted } : {})
  for (const a of list) {
    const caption = await card(a)
    try {
      if (a.image) await sock.sendMessage(jid, { image: { url: a.image }, caption })
      else await sock.sendMessage(jid, { text: caption })
    } catch {
      await sock.sendMessage(jid, { text: caption }).catch(() => {})
    }
  }
}

function varTimes(value) {
  const raw = String(value || '').trim()
  if (!raw || /^(off|false|non|no|0)$/i.test(raw)) return []
  return [...new Set(raw.split(/[\s,;]+/).map(parseTime).filter(Boolean))].slice(0, MAX_TIMES).sort()
}

let current = null
const fired = new Map()
nyx.on('connection.open', (sock) => {
  current = sock
})

async function tick(sock = current, date = new Date()) {
  if (!sock?.user) return
  const { day, time } = nowParts(date)
  const plans = Object.entries(db.all(NS)).filter(([key]) => key !== VAR_KEY)
  if (varTimes(config.AUTO_ANIME).length) plans.push([VAR_KEY, { ...db.get(NS, VAR_KEY, {}), times: varTimes(config.AUTO_ANIME) }])
  const due = plans.filter(([key, plan]) => plan?.times?.includes(time) && fired.get(`${key}:${time}`) !== `${day} ${time}`)
  if (!due.length) return
  for (const [key] of due) fired.set(`${key}:${time}`, `${day} ${time}`)
  const now = Math.floor(date.getTime() / 1000)
  const fresh = await premieres(now - 3 * DAY, now)
  const t = lang.plugins.autoanime
  for (const [key, plan] of due) {
    const jid = key === VAR_KEY ? ownerJid(sock) : key
    const sent = plan.sent || []
    const list = fresh.filter((a) => !sent.includes(a.id)).slice(0, 5)
    try {
      if (list.length) await sendAnime(sock, jid, list, t.header.format(list.length))
      else await sock.sendMessage(jid, { text: t.nothing })
    } catch (error) {
      logger.warn(`autoanime ${jid} : ${error?.message || error}`)
    }
    const next = [...sent, ...list.map((a) => a.id)].slice(-MAX_SENT)
    db.set(NS, key, key === VAR_KEY ? { sent: next } : { ...plan, sent: next })
  }
}

setInterval(() => tick().catch(() => {}), 20000).unref?.()

bot(
  {
    pattern: 'anime ?(.*)',
    alias: ['animes'],
    desc: lang.plugins.anime.desc,
    type: 'misc',
  },
  async (message, match) => {
    const t = lang.plugins.anime
    const input = String(match || '').trim()
    const now = Math.floor(Date.now() / 1000)
    await message.react('⏳').catch(() => {})
    let list
    let header
    if (!input || /^(new|nouveau(x|t[eé]s?)?|semaine|week)$/i.test(input)) {
      list = (await premieres(now - 7 * DAY, now)).slice(0, 5)
      header = t.header_week.format(list.length)
    } else if (/^(bient[oô]t|soon|avenir|prochains?)$/i.test(input)) {
      list = (await premieres(now, now + 7 * DAY)).slice(0, 5)
      header = t.header_soon.format(list.length)
    } else if (/^(saison|season|top)$/i.test(input)) {
      list = (await season()).slice(0, 5)
      header = t.header_season
    } else {
      list = (await search(input)).slice(0, 1)
      header = ''
    }
    await message.react('').catch(() => {})
    if (!list.length) return message.reply(t.none)
    await sendAnime(message.client, message.jid, list, header, message.data)
  }
)

bot(
  {
    pattern: 'autoanime ?(.*)',
    alias: ['aanime'],
    desc: lang.plugins.autoanime.desc,
    type: 'misc',
  },
  async (message, match) => {
    const t = lang.plugins.autoanime
    current = message.client
    const input = String(match || '').trim()
    const plan = db.get(NS, message.jid, null)
    if (!input || /^info$/i.test(input)) {
      if (!plan?.times?.length) return message.reply(`${t.none}\n\n${t.usage}`)
      return message.reply(t.info.format(plan.times.join(', '), config.TZ))
    }
    if (/^(off|del|stop|reset)$/i.test(input)) {
      if (!plan) return message.reply(t.none)
      db.del(NS, message.jid)
      return message.reply(t.off)
    }
    const times = []
    for (const part of input.split(/[\s,;]+/).filter(Boolean)) {
      const time = parseTime(part)
      if (!time) return message.reply(t.usage)
      if (!times.includes(time)) times.push(time)
    }
    if (times.length > MAX_TIMES) return message.reply(t.too_many.format(MAX_TIMES))
    times.sort()
    db.set(NS, message.jid, { times, sent: plan?.sent || [] })
    await message.reply(t.set.format(times.join(', '), config.TZ))
  }
)

module.exports = { premieres, season, search, frenchSummary, card, cleanText, shorten, isSafe, tick, varTimes, currentSeason, VAR_KEY }
