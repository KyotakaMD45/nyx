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
    const raw = message.reply_message?.data?.message
    if (!raw) return message.reply('_Réponds à un message (par exemple un sticker avec son) avec *msginfo*._')
    const info = describe(raw)
    const types = Object.keys(info).join(', ')
    let text = JSON.stringify(info, null, 1)
    if (text.length > 3500) text = text.slice(0, 3500) + '\n…'
    await message.reply(`*Types :* ${types}\n\`\`\`${text}\`\`\``)
  }
)
