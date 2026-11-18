const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const sharp = require('sharp')
const webpmux = require('node-webpmux')
const { bot, lang, config } = require('../lib')

function packInfo(text) {
  const [pack, author] = String(text || config.STICKER_PACKNAME).split(',').map((s) => s.trim())
  return { pack: pack || config.BOT_NAME, author: author || '' }
}

async function withExif(webp, pack, author) {
  const img = new webpmux.Image()
  await img.load(webp)
  const json = Buffer.from(
    JSON.stringify({ 'sticker-pack-id': `nyx-${Date.now()}`, 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: [''] }),
    'utf8'
  )
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
  const exif = Buffer.concat([header, json])
  exif.writeUIntLE(json.length, 14, 4)
  img.exif = exif
  return img.save(null)
}

const imageToWebp = (buffer) =>
  sharp(buffer, { animated: false })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer()

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 120000, windowsHide: true }, (error) => (error ? reject(error) : resolve()))
  })
}

async function videoToWebp(buffer) {
  const base = path.join(os.tmpdir(), `nyx-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const input = `${base}.mp4`
  const output = `${base}.webp`
  fs.writeFileSync(input, buffer)
  try {
    await ffmpeg([
      '-y', '-i', input, '-t', '8', '-an',
      '-vf', "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000",
      '-vcodec', 'libwebp', '-loop', '0', '-preset', 'default', '-q:v', '60', output,
    ])
    return fs.readFileSync(output)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(lang.plugins.sticker.no_ffmpeg)
    throw error
  } finally {
    fs.rmSync(input, { force: true })
    fs.rmSync(output, { force: true })
  }
}

bot(
  {
    pattern: 'sticker ?(.*)',
    alias: ['s'],
    desc: lang.plugins.sticker.desc,
    type: 'media',
    fromMe: false,
  },
  async (message, match) => {
    const source = message.image || message.video ? message : message.reply_message
    if (!source || !(source.image || source.video || source.sticker)) return message.reply(lang.plugins.sticker.usage)
    const media = await source.download()
    const webp = source.video ? await videoToWebp(media) : source.sticker ? media : await imageToWebp(media)
    const { pack, author } = packInfo(match)
    await message.send(await withExif(webp, pack, author), {}, 'sticker')
  }
)

bot(
  {
    pattern: 'take ?(.*)',
    desc: lang.plugins.take.desc,
    type: 'media',
    fromMe: false,
  },
  async (message, match) => {
    if (!message.reply_message?.sticker) return message.reply(lang.plugins.take.usage)
    const { pack, author } = packInfo(match)
    const webp = await message.reply_message.download()
    await message.send(await withExif(webp, pack, author), {}, 'sticker')
  }
)

bot(
  {
    pattern: 'toimg ?(.*)',
    desc: lang.plugins.toimg.desc,
    type: 'media',
    fromMe: false,
  },
  async (message) => {
    if (!message.reply_message?.sticker) return message.reply(lang.plugins.toimg.usage)
    const png = await sharp(await message.reply_message.download()).png().toBuffer()
    await message.send(png, { quoted: message.data }, 'image')
  }
)

module.exports = { withExif, imageToWebp }
