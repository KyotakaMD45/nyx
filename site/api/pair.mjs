import crypto from 'node:crypto'
import zlib from 'node:zlib'

const PORTABLE_PREFIX = 'Nyx~'

function newSessionId() {
  return 'Nyx_' + BigInt('0x' + crypto.randomBytes(10).toString('hex')).toString(36).padStart(16, '0').slice(0, 16)
}

function memoryAuthState(initAuthCreds, proto) {
  const creds = initAuthCreds()
  const store = {}
  const keys = {
    get: async (type, ids) => {
      const data = {}
      for (const id of ids) {
        let value = store[type]?.[id]
        if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value)
        data[id] = value
      }
      return data
    },
    set: async (data) => {
      for (const category in data) {
        store[category] ||= {}
        for (const id in data[category]) {
          const value = data[category][id]
          if (value) store[category][id] = value
          else delete store[category][id]
        }
      }
    },
  }
  return { creds, keys, store }
}

function sessionJson(id, creds, store, BufferJSON) {
  const keys = {}
  const appKeyId = creds?.myAppStateKeyId
  const appKey = appKeyId && store?.['app-state-sync-key']?.[appKeyId]
  if (appKey) keys['app-state-sync-key'] = { [appKeyId]: appKey }
  return JSON.stringify({ id, creds, keys }, BufferJSON.replacer)
}

async function saveSession(id, json) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob')
      await put('s/' + id, json, { access: 'public', contentType: 'application/json', addRandomSuffix: true })
      return id
    } catch {}
  }
  return PORTABLE_PREFIX + zlib.gzipSync(json, { level: 9 }).toString('base64url')
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const mode = url.searchParams.get('mode') === 'code' ? 'code' : 'qr'
  const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '')

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  let closed = false
  const sse = (event, data = {}) => {
    if (closed) return
    try {
      res.write('data: ' + JSON.stringify({ event, ...data }) + '\n\n')
    } catch {}
  }
  const keepAlive = setInterval(() => {
    if (!closed) {
      try {
        res.write(': ping\n\n')
      } catch {}
    }
  }, 15000)
  let sock = null
  const finish = () => {
    if (closed) return
    closed = true
    clearInterval(keepAlive)
    try {
      sock?.end(undefined)
    } catch {}
    try {
      res.end()
    } catch {}
  }
  req.on('close', () => {
    closed = true
    clearInterval(keepAlive)
    try {
      sock?.end(undefined)
    } catch {}
  })

  if (mode === 'code' && (phone.length < 8 || phone.length > 15)) {
    sse('error', { message: 'Numéro invalide : indicatif du pays + numéro, sans « + » (ex. 2250700000000).' })
    return finish()
  }

  let B, pino
  try {
    B = await import('baileys')
    pino = (await import('pino')).default
  } catch (error) {
    sse('error', { message: 'Chargement de WhatsApp impossible : ' + error.message })
    return finish()
  }
  const makeWASocket = B.makeWASocket || B.default
  const { BufferJSON, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto, Browsers } = B

  const logger = pino({ level: 'silent' })
  const auth = memoryAuthState(initAuthCreds, proto)
  const id = newSessionId()
  let done = false
  let codeRequested = false
  let retries = 0
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}))

  const fail = (message) => {
    if (done) return
    done = true
    sse('error', { message })
    setTimeout(finish, 200)
  }

  const start = () => {
    if (closed) return
    try {
      sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
        logger,
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      })
    } catch (error) {
      return fail('Initialisation impossible : ' + error.message)
    }

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr && !done) {
        if (mode === 'qr') {
          sse('qr', { qr })
        } else if (!codeRequested && !auth.creds.registered) {
          codeRequested = true
          try {
            const code = await sock.requestPairingCode(phone)
            sse('code', { code: code?.match(/.{1,4}/g)?.join('-') || code })
          } catch (error) {
            fail('Demande du code impossible : ' + error.message)
          }
        }
      }
      if (connection === 'open' && !done) {
        sse('connected', {})
        await new Promise((resolve) => setTimeout(resolve, 6000))
        done = true
        try {
          const sessionId = await saveSession(id, sessionJson(id, auth.creds, auth.store, BufferJSON))
          let sent = false
          try {
            const self = B.jidNormalizedUser(sock.user.id)
            const first = await sock.sendMessage(self, { text: sessionId })
            await sock.sendMessage(
              self,
              {
                text:
                  '✅ *Session Nyx prête*\n\n' +
                  'Copie le message au-dessus (ton *SESSION_ID*) et colle-le dans *config.env* :\n' +
                  'SESSION_ID="' + sessionId.slice(0, 24) + (sessionId.length > 24 ? '…' : '') + '"\n\n' +
                  '⚡ Installation rapide sur VPS :\nbash <(curl -fsSL https://tinyurl.com/nyx-install)\n\n' +
                  '⚠️ Ne partage ce SESSION_ID avec personne.\n📖 https://nyx-session.vercel.app/guide',
              },
              { quoted: first }
            )
            sent = true
          } catch {}
          sse('saved', { sessionId, sent })
        } catch (error) {
          sse('error', { message: 'Export de la session impossible : ' + error.message })
        }
        setTimeout(finish, 300)
      }
      if (connection === 'close' && !done) {
        const status = lastDisconnect?.error?.output?.statusCode
        if (status === DisconnectReason.restartRequired) return start()
        if (status === DisconnectReason.loggedOut) return fail('Connexion refusée par WhatsApp. Recommence.')
        if (status === DisconnectReason.timedOut) return fail('Délai dépassé (QR ou code expiré). Recommence.')
        if ((retries += 1) <= 3) return setTimeout(start, 2000)
        fail('Connexion fermée (' + (status || 'inconnu') + '). Recommence.')
      }
    })
  }

  start()
}
