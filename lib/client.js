const fs = require('fs')
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
const { statusMode } = require('./status')

const WELCOME_IMAGE = path.join(__dirname, '..', 'media', 'welcome.jpg')

const baileysLogger = pino({ level: 'silent' })
const tag = () => config.BOT_NAME.toLowerCase()
let pluginsLoaded = false
let reconnectTimer = null
let attempts = 0
let currentSock = null
let firstOpen = true
let welcomePending = false

function notifyOwner(text) {
  if (!currentSock?.user) return Promise.resolve()
  return currentSock.sendMessage(bare(currentSock.user.id), { text }).catch(() => {})
}

function welcomeText(sock) {
  const owner = config.OWNER_NAME || sock.user?.name || sock.user?.verifiedName || lang.extra.owner_default
  return lang.extra.welcome.format(config.BOT_NAME, owner, prefixes()[0] || '')
}

function startCard(sock) {
  const prefix = prefixes()[0] || ''
  const yes = (value) => (value ? '✅' : '❎')
  const status = statusMode(config.AUTO_STATUS_VIEW)
  const labels = lang.extra.labels
  const rows = [
    [labels.sudo, config.SUDO.length ? config.SUDO.join(', ') : '0'],
    [labels.auto_read, yes(config.SEND_READ)],
    [labels.auto_status, status ? `✅ (${status})` : '❎'],
    [labels.auto_reject, yes(config.REJECT_CALL)],
    [labels.always_online, yes(config.ALWAYS_ONLINE)],
    [labels.anti_delete, config.ANTI_DELETE !== 'false' ? `✅ (${config.ANTI_DELETE})` : '❎'],
    [labels.auto_update, yes(config.AUTO_UPDATE)],
  ]
  const width = Math.max(...rows.map(([label]) => label.length))
  const settings = rows.map(([label, value]) => `${label.padEnd(width)} : ${value}`).join('\n')
  return lang.extra.start_card.format(prefix, config.VERSION, commands.length, settings, config.REPO_URL)
}

function sendCard(sock, jid, text) {
  if (fs.existsSync(WELCOME_IMAGE)) return sock.sendMessage(jid, { image: fs.readFileSync(WELCOME_IMAGE), caption: text })
  return sock.sendMessage(jid, { text })
}

function scheduleReconnect(delay) {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    start().catch((error) => logger.error(lang.extra.start_failed.format(error?.stack || error)))
  }, delay)
}

async function start() {
  const B = await loadBaileys()

  try {
    const state = await session.prepareSession(config)
    if (state === 'imported') {
      logger.debug(lang.extra.session_imported.format(tag()))
      welcomePending = true
    }
    if (state === 'dead') logger.warn(lang.extra.session_dead)
  } catch (error) {
    const reason = error.message === 'invalid_session_id' ? lang.extra.session_invalid : error.message
    logger.error(lang.extra.session_import_failed.format(reason))
  }

  const { state, saveCreds } = await B.useMultiFileAuthState(session.SESSION_DIR)
  if (!state.creds.registered) welcomePending = true
  const { version } = await B.fetchLatestBaileysVersion().catch(() => ({}))
  logger.info(lang.extra.connecting.format(tag()))

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
          logger.info(lang.extra.pairing_code.format(tag(), code?.match(/.{1,4}/g)?.join('-') || code))
        } catch (error) {
          logger.error(lang.extra.pairing_failed.format(error.message))
        }
      } else if (!config.PAIRING_NUMBER) {
        logger.info(lang.extra.scan_qr.format(tag()))
        require('qrcode-terminal').generate(qr, { small: true })
      }
    }

    if (connection === 'open') {
      attempts = 0
      currentSock = sock
      session.clearDeadMark()
      const own = bare(sock.user.id)
      logger.info(lang.extra.connected.format(tag(), num(own)))
      if (!pluginsLoaded) {
        logger.info(lang.extra.plugin_install.format(tag()))
        const count = loadPlugins(path.join(__dirname, '..', 'plugins'), logger)
        pluginsLoaded = true
        logger.info(lang.extra.plugins_installed.format(tag(), count))
      }
      if (config.ALWAYS_ONLINE) sock.sendPresenceUpdate('available').catch(() => {})
      if (welcomePending) {
        welcomePending = false
        await sendCard(sock, own, welcomeText(sock)).catch((error) => logger.warn(`bienvenue : ${error.message}`))
      }
      if (firstOpen && !config.DISABLE_START_MESSAGE) {
        await sendCard(sock, own, startCard(sock)).catch((error) => logger.warn(`carte de démarrage : ${error.message}`))
      }
      firstOpen = false
      update.startAutoUpdate(notifyOwner, {
        installing: (n) => lang.extra.auto_update_installing.format(n),
        available: (list) => {
          const lines = list.slice(0, 5).map((c, i) => `${i + 1}. ${c}`)
          if (list.length > 5) lines.push(lang.extra.update_more.format(list.length - 5))
          return lang.extra.update_available.format(list.length, lines.join('\n'), prefixes()[0] || '')
        },
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
      logger.info(lang.extra.reconnecting.format(tag(), attempts))
      scheduleReconnect(delay)
    }
  })

  sock.ev.on('messages.upsert', (event) => onMessagesUpsert(sock, event))
  sock.ev.on('call', (calls) => runListeners('call', sock, calls))
  sock.ev.on('group-participants.update', (event) => runListeners('group-participants', sock, event))

  return sock
}

module.exports = { start, notifyOwner, welcomeText, startCard, uptime: () => runtime(process.uptime()) }
