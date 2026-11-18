// WhatsApp connection: session, QR / pairing code, reconnection, events.
const path = require('path')
const pino = require('pino')
const config = require('../config')
const { lang } = require('./lang')
const { logger } = require('./logger')
const { loadBaileys } = require('./baileys')
const { loadPlugins, commands } = require('./plugins')
const { onMessagesUpsert, runListeners, trackSends, recent, prefixes } = require('./handler')
const session = require('./session')
const update = require('./update')
const { bare, num, runtime } = require('./utils')

const baileysLogger = pino({ level: 'silent' })
let pluginsLoaded = false
let reconnectTimer = null
let attempts = 0
let currentSock = null // the live socket (replaced on every reconnection)

// Sends a text to the bot's own chat through the live socket.
function notifyOwner(text) {
  if (!currentSock?.user) return Promise.resolve()
  return currentSock.sendMessage(bare(currentSock.user.id), { text }).catch(() => {})
}

function startCard(sock) {
  const prefix = prefixes()[0] || '—'
  return lang.extra.start_card.format(
    config.BOT_NAME,
    config.VERSION,
    prefix,
    config.MODE,
    commands.length,
    num(sock.user.id),
    config.AUTO_UPDATE ? 'on' : 'off',
    `${prefix}menu`
  )
}

function scheduleReconnect(delay) {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    start().catch((error) => logger.error(lang.extra.start_failed.format(error?.stack || error)))
  }, delay)
}

async function start() {
  const B = await loadBaileys()

  if (!pluginsLoaded) {
    const count = loadPlugins(path.join(__dirname, '..', 'plugins'), logger)
    pluginsLoaded = true
    logger.info(lang.extra.plugins_loaded.format(count))
  }

  try {
    const state = await session.prepareSession(config)
    if (state === 'imported') logger.info(lang.extra.session_imported)
    if (state === 'dead') logger.warn(lang.extra.session_dead)
  } catch (error) {
    const reason = error.message === 'invalid_session_id' ? lang.extra.session_invalid : error.message
    logger.error(lang.extra.session_import_failed.format(reason))
  }

  const { state, saveCreds } = await B.useMultiFileAuthState(session.SESSION_DIR)
  const { version } = await B.fetchLatestBaileysVersion().catch(() => ({}))

  const sock = B.makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: state.creds, keys: B.makeCacheableSignalKeyStore(state.keys, baileysLogger) },
    logger: baileysLogger,
    browser: B.Browsers.macOS('Desktop'),
    markOnlineOnConnect: config.ALWAYS_ONLINE,
    syncFullHistory: false,
    getMessage: async (key) => recent.get(key.id)?.message,
  })
  trackSends(sock)

  let pairingRequested = false
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !state.creds.registered) {
      if (config.PAIRING_NUMBER && !pairingRequested) {
        pairingRequested = true
        try {
          const code = await sock.requestPairingCode(config.PAIRING_NUMBER)
          logger.info(lang.extra.pairing_code.format(code?.match(/.{1,4}/g)?.join('-') || code))
        } catch (error) {
          logger.error(lang.extra.pairing_failed.format(error.message))
        }
      } else if (!config.PAIRING_NUMBER) {
        logger.info(lang.extra.scan_qr)
        require('qrcode-terminal').generate(qr, { small: true })
      }
    }

    if (connection === 'open') {
      attempts = 0
      currentSock = sock
      session.clearDeadMark()
      const own = bare(sock.user.id)
      logger.info(lang.extra.connected.format(num(own)))
      if (config.ALWAYS_ONLINE) sock.sendPresenceUpdate('available').catch(() => {})
      if (!config.DISABLE_START_MESSAGE) sock.sendMessage(own, { text: startCard(sock) }).catch(() => {})
      update.startAutoUpdate(notifyOwner, {
        installing: (n) => lang.extra.auto_update_installing.format(n),
        available: (list) =>
          lang.extra.update_available.format(list.length, list.slice(0, 5).map((c) => `• ${c}`).join('\n'), prefixes()[0] || ''),
      })
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === B.DisconnectReason.loggedOut) {
        logger.error(lang.extra.logged_out)
        session.markDead(config.SESSION_ID)
        return scheduleReconnect(2000)
      }
      if (code === B.DisconnectReason.connectionReplaced) {
        logger.error(lang.extra.connection_replaced)
        return
      }
      attempts += 1
      const delay = code === B.DisconnectReason.restartRequired ? 500 : Math.min(30000, 2000 * attempts)
      logger.warn(lang.extra.reconnecting.format(code || '?', Math.round(delay / 1000)))
      scheduleReconnect(delay)
    }
  })

  sock.ev.on('messages.upsert', (event) => onMessagesUpsert(sock, event))
  sock.ev.on('call', (calls) => runListeners('call', sock, calls))
  sock.ev.on('group-participants.update', (event) => runListeners('group-participants', sock, event))

  return sock
}

module.exports = { start, notifyOwner, uptime: () => runtime(process.uptime()) }
