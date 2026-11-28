const { bot } = require('../lib')

// Champs privés à ne jamais afficher (clés de déchiffrement, liens vers le média).
const HIDDEN = new Set(['mediaKey', 'directPath', 'url', 'jpegThumbnail', 'thumbnailDirectPath', 'staticUrl', 'messageSecret'])

function describe(value, depth = 0) {
  if (depth > 6) return '…'
  if (value == null) return value
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `<${value.length} octets>`
  if (typeof value === 'object' && typeof value.low === 'number' && typeof value.high === 'number') return Number(value.toString())
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => describe(v, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (v == null || HIDDEN.has(k)) continue
      out[k] = describe(v, depth + 1)
    }
    return out
  }
  return value
}

// Liste les blocs d'un fichier WebP (RIFF) et cherche des traces de son caché dedans.
function inspectFile(buf) {
  const lines = [`taille : ${buf.length} octets`, `début : ${buf.slice(0, 4).toString('latin1')}`]
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    const chunks = {}
    let pos = 12
    while (pos + 8 <= buf.length) {
      const id = buf.slice(pos, pos + 4).toString('latin1')
      const size = buf.readUInt32LE(pos + 4)
      if (pos + 8 + size > buf.length) break
      chunks[id] = chunks[id] || { nombre: 0, octets: 0 }
      chunks[id].nombre++
      chunks[id].octets += size
      pos += 8 + size + (size % 2)
    }
    lines.push('blocs : ' + Object.entries(chunks).map(([k, v]) => `${k}×${v.nombre} (${v.octets} o)`).join(', '))
    if (pos < buf.length) lines.push(`données après la fin du WebP : ${buf.length - pos} octets`)
  }
  const sigs = { OggS: 'son Ogg', ID3: 'son MP3', ftyp: 'vidéo/son MP4', OpusHead: 'son Opus', fLaC: 'son FLAC' }
  for (const [sig, name] of Object.entries(sigs)) {
    const at = buf.indexOf(Buffer.from(sig, 'latin1'))
    if (at >= 0) lines.push(`trouvé « ${sig} » (${name}) à l'octet ${at}`)
  }
  return lines.join('\n')
}

// .msginfo : réponds à un message pour voir comment WhatsApp l'a construit
// (type de message et champs), sans les clés ni les liens du média.
bot(
  {
    pattern: 'msginfo ?(.*)',
    alias: ['rawmsg'],
    desc: 'Montre la structure du message auquel tu réponds (pour analyser un sticker sonore)',
    type: 'system',
  },
  async (message) => {
    // Le message cité se trouve à plusieurs endroits selon la version : on essaie tout.
    const m = message.data?.message || {}
    const ctx = Object.values(m).find((v) => v && typeof v === 'object' && v.contextInfo)?.contextInfo
    const raw = ctx?.quotedMessage || message.reply_message?.data?.message || message.reply_message?.message
    if (!raw) {
      const keys = Object.keys(message.reply_message || {}).join(', ') || 'aucun'
      return message.reply(
        `_Je ne vois pas de message cité._\nFais un *appui long sur le sticker → Répondre*, puis écris *.msginfo*.\n\n(info technique : ${Object.keys(m).join(', ') || 'vide'} | reply : ${keys})`
      )
    }
    const info = describe(raw)
    const types = Object.keys(info).join(', ')
    let text = JSON.stringify(info, null, 1)
    if (text.length > 3000) text = text.slice(0, 3000) + '\n…'
    let fileInfo = ''
    if (message.reply_message?.download) {
      const buf = await message.reply_message.download().catch(() => null)
      if (buf) fileInfo = `\n\n*Contenu du fichier :*\n\`\`\`${inspectFile(buf)}\`\`\``
    }
    await message.reply(`*Types :* ${types}\n\`\`\`${text}\`\`\`${fileInfo}`)
  }
)
