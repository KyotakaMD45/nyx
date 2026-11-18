const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const MAX_BYTES = 95 * 1024 * 1024

const URL_RE = /https?:\/\/[^\s<>"']+/i

function findUrl(...texts) {
  for (const text of texts) {
    const found = URL_RE.exec(String(text || ''))
    if (found) return found[0].replace(/[),.]+$/, '')
  }
  return null
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'user-agent': UA, ...(options.headers || {}) }, signal: AbortSignal.timeout(options.timeout || 30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

function decodePacked(h, n, t, e) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'
  const toDecimal = (str, base) =>
    str
      .split('')
      .reverse()
      .reduce((acc, ch, i) => acc + alphabet.slice(0, base).indexOf(ch) * Math.pow(base, i), 0)
  let out = ''
  for (let i = 0; i < h.length; i++) {
    let chunk = ''
    while (h[i] !== n[e]) {
      chunk += h[i]
      i++
    }
    for (let j = 0; j < n.length; j++) chunk = chunk.replace(new RegExp(n[j], 'g'), String(j))
    out += String.fromCharCode(toDecimal(chunk, e) - t)
  }
  return decodeURIComponent(escape(out))
}

async function snapsave(url) {
  const res = await request('https://snapsave.app/action.php?lang=en', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://snapsave.app', referer: 'https://snapsave.app/' },
    body: new URLSearchParams({ url }),
  })
  const body = await res.text()
  const packed = body.split('decodeURIComponent(escape(r))}(')[1]?.split('))')[0]
  if (!packed) return []
  const [h, , n, t, e] = packed.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
  const html = decodePacked(h, n, Number(t), Number(e))
  const links = [...html.matchAll(/href=\\?"(https?:[^"\\]+)/g)].map((m) => m[1].replace(/&amp;/g, '&'))
  return [...new Set(links)].filter((link) => !/play\.google\.com|apps\.apple\.com|snapsave\.app\/?$/i.test(link))
}

async function facebook(url) {
  if (!/facebook\.com|fb\.watch|fb\.com/i.test(url)) return []
  return (await snapsave(url).catch(() => [])).slice(0, 1)
}

async function instagram(url) {
  if (!/instagram\.com/i.test(url)) return []
  return (await snapsave(url.split('?')[0]).catch(() => [])).slice(0, 10)
}

async function tikwm(url) {
  const res = await request('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url, hd: '1' }),
  })
  const json = await res.json()
  const data = json?.data
  if (!data) return []
  if (Array.isArray(data.images) && data.images.length) return data.images.slice(0, 10)
  const video = data.hdplay || data.play
  return video ? [video] : []
}

async function tikmate(url) {
  const res = await request('https://api.tikmate.app/api/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://tikmate.app', referer: 'https://tikmate.app/' },
    body: new URLSearchParams({ url }),
  })
  const json = await res.json()
  return json?.token && json?.id ? [`https://tikmate.app/download/${json.token}/${json.id}.mp4`] : []
}

async function tiktok(url) {
  if (!/tiktok\.com/i.test(url)) return []
  for (const provider of [tikwm, tikmate]) {
    try {
      const links = await provider(url)
      if (links.length) return links
    } catch {}
  }
  return []
}

function kindOf(mime, link) {
  if (/^image\//.test(mime)) return 'image'
  if (/^video\//.test(mime)) return 'video'
  if (/^audio\//.test(mime)) return 'audio'
  if (/\.(jpe?g|png|webp|heic)(\?|$)/i.test(link)) return 'image'
  return 'video'
}

async function fetchMedia(link) {
  const res = await request(link, { timeout: 120000 })
  const size = Number(res.headers.get('content-length') || 0)
  if (size > MAX_BYTES) return { tooBig: true, link }
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_BYTES) return { tooBig: true, link }
  const mime = String(res.headers.get('content-type') || '').split(';')[0].toLowerCase()
  return { buffer, mime, type: kindOf(mime, link) }
}

async function uploadFile(buffer, filename = 'file') {
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', new Blob([buffer]), filename)
  const res = await request('https://catbox.moe/user/api.php', { method: 'POST', body: form, timeout: 120000 })
  const text = (await res.text()).trim()
  if (!/^https?:\/\//.test(text)) throw new Error(text || 'upload')
  return text
}

module.exports = { findUrl, facebook, instagram, tiktok, fetchMedia, uploadFile, snapsave, decodePacked }
