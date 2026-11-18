const os = require('os')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const num = (jid) => String(jid || '').split('@')[0].split(':')[0]

function bare(jid) {
  if (!jid) return ''
  const [user, server] = String(jid).split('@')
  return server ? `${user.split(':')[0]}@${server}` : user.split(':')[0]
}

const toJid = (number) => `${String(number).replace(/\D/g, '')}@s.whatsapp.net`

function runtime(seconds) {
  seconds = Math.floor(seconds)
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [d && `${d}j`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

function formatBytes(bytes) {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`
}

const ram = () => `${formatBytes(os.totalmem() - os.freemem())} / ${formatBytes(os.totalmem())}`

function botIds(sock) {
  return [sock.user?.id, sock.user?.lid].filter(Boolean).map(bare)
}

function participantIds(p) {
  if (typeof p === 'string') return [bare(p)]
  return [p.id, p.lid, p.phoneNumber].filter(Boolean).map(bare)
}

function findParticipant(metadata, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(bare))
  return (metadata?.participants || []).find((p) => participantIds(p).some((id) => wanted.has(id)))
}

const isAdminEntry = (p) => !!p && (p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin || p.isSuperAdmin)

const isBotAdmin = (metadata, sock) => isAdminEntry(findParticipant(metadata, botIds(sock)))
const isAdmin = (metadata, ids) => isAdminEntry(findParticipant(metadata, ids))

const participantJid = (p) => (typeof p === 'string' ? p : p.id)

const isUrl = (text) => /https?:\/\/\S+/i.test(String(text || ''))

function targetOf(message, match = '') {
  if (message.mentions?.length) return message.mentions[0]
  if (message.reply_message?.senderJid) return message.reply_message.senderJid
  const digits = String(match).replace(/\D/g, '')
  return digits.length >= 6 ? toJid(digits) : null
}

module.exports = {
  sleep,
  num,
  bare,
  toJid,
  runtime,
  formatBytes,
  ram,
  botIds,
  participantIds,
  findParticipant,
  isAdminEntry,
  isBotAdmin,
  isAdmin,
  participantJid,
  isUrl,
  targetOf,
}
