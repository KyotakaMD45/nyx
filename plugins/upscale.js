const { bot, lang } = require('../lib')
const dl = require('../lib/download')

bot(
  {
    pattern: 'upscale ?(.*)',
    alias: ['hd'],
    desc: lang.plugins.upscale.desc,
    type: 'media',
  },
  async (message, match) => {
    const t = lang.plugins.upscale
    const quoted = message.reply_message
    const isImageDoc = quoted?.document && /^image\//.test(quoted.mimetype || '')
    if (!quoted || !(quoted.image || isImageDoc)) return message.send(t.usage)
    const args = String(match || '').toLowerCase().split(/\s+/)
    const scale = args.includes('4') || args.includes('x4') ? 4 : 2
    const asDocument = args.includes('doc')
    await message.react('⏳').catch(() => {})
    try {
      const { buffer, ai } = await dl.upscale(await quoted.download(), scale)
      const caption = ai ? t.done.format(scale) : t.done_local.format(scale)
      if (asDocument) await message.send(buffer, { quoted: message.data, mimetype: 'image/jpeg', fileName: `nyx-hd-x${scale}.jpg`, caption }, 'document')
      else await message.send(buffer, { quoted: message.data, caption }, 'image')
      await message.react('✅').catch(() => {})
    } catch {
      await message.react('❌').catch(() => {})
      await message.send(t.failed, { quoted: message.data })
    }
  }
)
