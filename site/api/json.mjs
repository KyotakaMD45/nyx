import { list } from '@vercel/blob'

const ID_RE = /^Nyx_[a-z0-9]{16}$/

export default async function handler(req, res) {
  const id = new URL(req.url, 'http://localhost').searchParams.get('id') || ''
  res.setHeader('Cache-Control', 'no-store')
  const notFound = () => {
    res.statusCode = 404
    res.end('not found')
  }
  if (!ID_RE.test(id)) return notFound()
  try {
    const { blobs } = await list({ prefix: 's/' + id })
    if (!blobs.length) return notFound()
    const r = await fetch(blobs[0].url, { cache: 'no-store' })
    if (!r.ok) return notFound()
    res.setHeader('Content-Type', 'application/json')
    res.end(Buffer.from(await r.arrayBuffer()))
  } catch {
    res.statusCode = 500
    res.end('error')
  }
}
