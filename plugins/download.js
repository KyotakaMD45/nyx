const { bot, lang } = require('../lib')
const dl = require('../lib/download')

async function sendLinks(message, links) {
  const t = lang.plugins.download
  let sent = 0
  for (const link of links) {
    try {
      const media = await dl.fetchMedia(link)
      if (media.tooBig) {
        await message.send(t.too_big.format(link))
        continue
      }
      await message.send(media.buffer, { quoted: message.data, mimetype: media.type === 'video' ? 'video/mp4' : undefined }, media.type)
      sent++
    } catch {}
  }
  return sent
}

function downloader(name, alias, fetchLinks) {
  bot(
    {
      pattern: `${name} ?(.*)`,
      alias,
      desc: lang.plugins[name].desc,
      type: 'download',
    },
    async (message, match) => {
      const t = lang.plugins[name]
      const url = dl.findUrl(match, message.reply_message?.text)
      if (!url) return message.send(t.usage)
      await message.react('⏳').catch(() => {})
      const links = await fetchLinks(url).catch(() => [])
      if (!links.length) {
        await message.react('❌').catch(() => {})
        return message.send(t.not_found, { quoted: message.data })
      }
      const sent = await sendLinks(message, links)
      await message.react(sent ? '✅' : '❌').catch(() => {})
      if (!sent) return message.send(lang.plugins.download.failed, { quoted: message.data })
    }
  )
}

downloader('fb', ['facebook'], dl.facebook)
downloader('insta', ['ig', 'instagram'], dl.instagram)
downloader('tiktok', ['tt'], dl.tiktok)

bot(
  {
    pattern: 'url ?(.*)',
    desc: lang.plugins.url.desc,
    type: 'download',
  },
  async (message) => {
    const t = lang.plugins.url
    const quoted = message.reply_message
    if (!quoted || !(quoted.image || quoted.video || quoted.audio || quoted.sticker || quoted.document)) return message.send(t.usage)
    try {
      const buffer = await quoted.download()
      const ext = quoted.image ? 'jpg' : quoted.video ? 'mp4' : quoted.audio ? 'ogg' : quoted.sticker ? 'webp' : 'bin'
      const link = await dl.uploadFile(buffer, `nyx.${ext}`)
      await message.send(link, { quoted: message.data })
    } catch (error) {
      await message.send(t.failed.format(error.message))
    }
  }
)

async function sendYoutube(message, id, kind, title) {
  const t = lang.plugins.yt
  await message.react('⏳').catch(() => {})
  try {
    const buffer = await dl.youtube(id, kind)
    const name = title || (await dl.youtubeTitle(id))
    if (kind === 'audio') await message.send(buffer, { quoted: message.data, mimetype: 'audio/mp4', fileName: `${name}.m4a` }, 'audio')
    else await message.send(buffer, { quoted: message.data, mimetype: 'video/mp4', caption: `*${name}*` }, 'video')
    await message.react('✅').catch(() => {})
  } catch (error) {
    await message.react('❌').catch(() => {})
    await message.send(error.message === 'too_big' ? t.too_big.format(`https://youtu.be/${id}`) : t.failed, { quoted: message.data })
  }
}

async function resolveYoutube(message, input) {
  const id = dl.youtubeId(input) || dl.youtubeId(message.reply_message?.text)
  if (id) return { id }
  const query = String(input || '').trim()
  if (!query) return null
  const [first] = await dl.youtubeSearch(query, 1).catch(() => [])
  return first ? { id: first.id, title: first.title } : { notFound: true }
}

function youtubeCommand(name, alias, kind, searchOnly) {
  bot(
    {
      pattern: `${name} ?(.*)`,
      alias,
      desc: lang.plugins.yt[`${name}_desc`],
      type: 'download',
    },
    async (message, match) => {
      const t = lang.plugins.yt
      const input = searchOnly ? match : match || message.reply_message?.text
      const found = await resolveYoutube(message, input)
      if (!found) return message.send(t[`${name}_usage`])
      if (found.notFound) return message.send(t.not_found, { quoted: message.data })
      await sendYoutube(message, found.id, kind, found.title)
    }
  )
}

youtubeCommand('yta', [], 'audio', false)
youtubeCommand('ytv', [], 'video', false)
youtubeCommand('song', ['play'], 'audio', true)
youtubeCommand('video', [], 'video', true)

bot(
  {
    pattern: 'yts ?(.*)',
    desc: lang.plugins.yt.yts_desc,
    type: 'download',
  },
  async (message, match) => {
    const t = lang.plugins.yt
    const query = String(match || '').trim()
    if (!query) return message.send(t.yts_usage)
    const results = await dl.youtubeSearch(query, 8).catch(() => [])
    if (!results.length) return message.send(t.not_found, { quoted: message.data })
    const lines = results.map((v, i) => `*${i + 1}.* ${v.title}\n   ⏱️ ${v.duration || '-'} · 👤 ${v.author || '-'}\n   https://youtu.be/${v.id}`)
    await message.send(`${t.yts_title.format(query)}\n\n${lines.join('\n\n')}\n\n${t.yts_hint}`, { quoted: message.data })
  }
)
