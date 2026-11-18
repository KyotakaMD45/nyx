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
