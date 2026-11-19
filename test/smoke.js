const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..')
const ENV = path.join(ROOT, 'config.env')
const DATA = path.join(ROOT, 'data')
const SESSION = path.join(ROOT, 'session')

const backup = path.join(require('os').tmpdir(), `nyx-test-${Date.now()}`)
fs.mkdirSync(backup, { recursive: true })
const saved = {}
for (const [name, p] of Object.entries({ env: ENV, data: DATA, session: SESSION })) {
  if (fs.existsSync(p)) {
    fs.cpSync(p, path.join(backup, name), { recursive: true })
    saved[name] = p
  }
}
function restore() {
  for (const p of [ENV, DATA, SESSION]) fs.rmSync(p, { recursive: true, force: true })
  for (const [name, p] of Object.entries(saved)) fs.cpSync(path.join(backup, name), p, { recursive: true })
  fs.rmSync(backup, { recursive: true, force: true })
}

process.env.PREFIX = '.'
process.env.SUDO = ''
process.env.BOT_LANG = 'fr'
process.env.LOG_LEVEL = 'error'
process.env.ANTI_DELETE = 'false'
process.env.AUTO_STATUS_VIEW = 'false'
process.env.STATUS_VIEW_EMOJI = ''
process.env.STATUS_VIEW_MSG = ''
process.env.STATUS_FORWARD_JID = ''
delete process.env.OWNER_NAME

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}

;(async () => {
  try {
    const { loadBaileys } = require('../lib/baileys')
    const B = await loadBaileys()
    const config = require('../config')
    const { logger } = require('../lib/logger')
    const { loadPlugins, commands } = require('../lib/plugins')
    const { onMessagesUpsert, trackSends } = require('../lib/handler')

    const count = loadPlugins(path.join(ROOT, 'plugins'), logger)
    check(`plugins chargés (${count} commandes)`, count >= 35)
    const names = commands.map((c) => c.name)
    check('aucun nom de commande en double', new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i).join(','))
    check('chaque commande a une description', commands.every((c) => c.desc), commands.filter((c) => !c.desc).map((c) => c.name).join(','))
    const up = commands.find((c) => c.name === 'upscale')
    check('upscale et son alias hd', up && up.regex.test('upscale') && up.regex.test('hd 4 doc'))
    check('upscale exporté par lib/download', typeof require('../lib/download').upscale === 'function')

    const OWNER = '2250700000001'
    const STRANGER = '2250700000002'
    const GROUP = '120363000000000001@g.us'
    let sent = []
    let reads = []
    const calls = []
    const sock = {
      user: { id: `${OWNER}:7@s.whatsapp.net`, lid: '90000000000001@lid', name: 'Alex' },
      async sendMessage(jid, content, options) {
        sent.push({ jid, content, options })
        return { key: { id: `BOT${sent.length}${Math.random()}`, remoteJid: jid, fromMe: true } }
      },
      async relayMessage(jid, message, options) {
        sent.push({ jid, relay: message, options, content: {} })
        return options?.messageId
      },
      async readMessages(keys) {
        reads.push(...keys)
      },
      async groupMetadata(jid) {
        return {
          id: jid,
          subject: 'Groupe test',
          creation: 1700000000,
          announce: false,
          desc: 'desc',
          participants: [
            { id: '90000000000001@lid', phoneNumber: `${OWNER}@s.whatsapp.net`, admin: 'admin' },
            { id: '90000000000002@lid', phoneNumber: `${STRANGER}@s.whatsapp.net`, admin: null },
          ],
        }
      },
      async groupParticipantsUpdate(jid, list, action) {
        calls.push({ fn: 'participants', jid, list, action })
        return list.map((j) => ({ status: '200', jid: j }))
      },
      async groupInviteCode() {
        return 'INVITE123'
      },
      async groupSettingUpdate(jid, value) {
        calls.push({ fn: 'setting', value })
      },
      async updateBlockStatus(jid, action) {
        calls.push({ fn: 'block', jid, action })
      },
    }
    trackSends(sock)

    let n = 0
    const raw = (text, { from = OWNER, fromMe = from === OWNER, jid, participant, extra = {} } = {}) => ({
      key: {
        remoteJid: jid || `${from}@s.whatsapp.net`,
        fromMe,
        id: `MSG${++n}`,
        ...(participant ? { participant } : {}),
      },
      pushName: 'Testeur',
      message: { extendedTextMessage: { text, ...extra } },
    })
    const send = async (msg) => {
      sent = []
      await onMessagesUpsert(sock, { messages: [msg], type: 'notify' })
      return sent
    }
    const textsOf = (list) => list.map((s) => s.content?.text || '').join('\n')

    let out = await send(raw('.ping'))
    check('.ping répond (Pong)', /Pong/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.alive'))
    check('.alive répond', /en ligne/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.alive Je suis là #name, actif depuis #uptime'))
    check('.alive <texte> : enregistré et variables remplies', /^Je suis là Nyx, actif depuis [0-9]+s$/m.test(textsOf(out)), textsOf(out))
    out = await send(raw('.alive'))
    check('.alive : affiche le texte personnalisé', /Je suis là Nyx/.test(textsOf(out)))
    out = await send(raw('.alive get'))
    check('.alive get : texte brut', textsOf(out).includes('#name'))
    out = await send(raw('.alive Coucou', { from: STRANGER }))
    check('.alive : un inconnu ne peut pas le changer', out.length === 0 && require('../lib/alive').getAlive().message.startsWith('Je suis là'))
    out = await send(raw('.alive reset'))
    check('.alive reset : retour au message par défaut', /par défaut/.test(textsOf(out)) && !require('../lib/alive').getAlive())
    out = await send(raw('.menu'))
    check('.menu : encadré + catégories', textsOf(out).includes('ᴘʀéꜰɪxᴇ : .') && textsOf(out).includes('❮ ꜱʏꜱᴛèᴍᴇ ❯') && textsOf(out).includes('❮ ɢʀᴏᴜᴘᴇ ❯') && textsOf(out).includes('◈ ᴍᴇɴᴜ'), textsOf(out))
    check('.menu : aucun emoji', !/\p{Extended_Pictographic}/u.test(textsOf(out)), textsOf(out).match(/\p{Extended_Pictographic}/gu)?.join(' '))
    out = await send(raw('.menu group'))
    check('.menu group : une seule catégorie', textsOf(out).includes('❮ ɢʀᴏᴜᴘᴇ ❯') && !textsOf(out).includes('ꜱʏꜱᴛèᴍᴇ ❯'))
    out = await send(raw('.menu telechargement'))
    check('.menu en français : téléchargement', textsOf(out).includes('❮ ᴛéʟéᴄʜᴀʀɢᴇᴍᴇɴᴛ ❯') && !textsOf(out).includes('ɢʀᴏᴜᴘᴇ ❯'), textsOf(out))
    out = await send(raw('.help'))
    check('.help : liste numérotée en colonnes, sans emoji', /01 ◦ \w+ +02 ◦ \w+/.test(textsOf(out)) && !/\p{Extended_Pictographic}/u.test(textsOf(out)), textsOf(out))
    out = await send(raw('.list'))
    check('.list : comme Levanter (- *nom* puis description)', /- \*menu\*\nMenu des commandes/.test(textsOf(out)), textsOf(out).slice(0, 200))
    {
      const { parsePrefix } = require('../lib/handler')
      const knull = parsePrefix('^[.,!]')
      check('préfixe ^[.,!] : . , ! acceptés, affiché .', knull.shown === '.' && ['.menu', ',menu', '!menu'].every((t) => knull.regex.test(t)) && !knull.regex.test('menu'))
      check('préfixe null : aucun préfixe', parsePrefix('null').shown === '' && parsePrefix('null').regex.test('menu'))
      check('préfixe .,! : liste', parsePrefix('.,!').regex.test('!menu') && parsePrefix('.,!').shown === '.')
      check('préfixe invalide ? : échappé', parsePrefix('?').regex.test('?menu'))
    }
    {
      const { msUntilNextSlot } = require('../lib/update')
      const at = (iso) => Math.round(msUntilNextSlot(6, new Date(iso)) / 60000)
      check('mises à jour : vérif à heure fixe toutes les 6 h', at('2026-11-18T06:00:00Z') === 360 && at('2026-11-18T23:00:00Z') === 60)
    }
    {
      const lines = []
      const out1 = process.stdout.write
      const err1 = process.stderr.write
      process.stdout.write = (chunk) => (lines.push(String(chunk)), true)
      process.stderr.write = (chunk) => (lines.push(String(chunk)), true)
      console.warn('Closing open session in favor of incoming prekey bundle')
      console.error('Session error:Error: Bad MAC')
      console.info('Closing session: SessionEntry {}')
      const hidden = lines.length === 0
      console.error('vrai avertissement')
      process.stdout.write = out1
      process.stderr.write = err1
      check('logs : messages de libsignal masqués', hidden, lines.join(''))
      check('logs : format « ERROR [hh:mm:ss jj-mm-aa]: »', /ERROR.* \[\d\d:\d\d:\d\d \d\d-\d\d-\d\d\]: vrai avertissement/.test(lines.join('')), lines.join(''))
    }
    out = await send(raw('.commandeinconnue'))
    check('commande inconnue : aucune réponse', out.length === 0)

    out = await send(raw('.alive', { from: STRANGER }))
    check('sans pass : un inconnu est ignoré', out.length === 0)
    const dm = `${STRANGER}@s.whatsapp.net`
    out = await send(raw('.pass alive sticker setvar inconnue', { jid: dm }))
    check('.pass : ajoute, refuse setvar, signale l’inconnue', /alive/.test(textsOf(out)) && /🔒.*setvar/.test(textsOf(out)) && /inconnue/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.alive', { from: STRANGER }))
    check('pass : l’inconnu peut utiliser .alive', /en ligne/.test(textsOf(out)))
    out = await send(raw('.ping', { from: STRANGER }))
    check('pass : mais pas .ping (non autorisée)', out.length === 0)
    out = await send(raw('.setvar PREFIX=!', { from: STRANGER }))
    check('pass : jamais .setvar', out.length === 0 && config.PREFIX === '.')
    out = await send(raw('.pass', { jid: dm }))
    check('.pass : liste', /- alive/.test(textsOf(out)) && /- sticker/.test(textsOf(out)))
    out = await send(raw('.pass del alive', { jid: dm }))
    out = await send(raw('.alive', { from: STRANGER }))
    check('.pass del : l’inconnu est de nouveau ignoré', out.length === 0)
    await send(raw('.pass del all', { jid: dm }))
    out = await send(raw('.yami', { jid: dm }))
    check('.yami : aucune commande', /Aucune commande autorisée/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.ope ping', { jid: dm }))
    check('.ope sans commandes : prévient', /pass pour ajouter/.test(textsOf(out)), textsOf(out))
    await send(raw('.pass alive sticker ping', { jid: dm }))
    out = await send(raw('.yami', { jid: dm }))
    check('.yami : liste et total', /- alive/.test(textsOf(out)) && /Total : 3 commandes/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.ope video', { jid: dm }))
    check('.ope : commande non trouvée + liste actuelle', /non trouvée : video/.test(textsOf(out)) && /- sticker/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.ope alive video', { jid: dm }))
    check('.ope : retire alive', /supprimées/.test(textsOf(out)) && /- alive/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.alive', { from: STRANGER }))
    check('.ope : l’inconnu ne peut plus utiliser .alive', out.length === 0)
    out = await send(raw('.pass ope yami', { jid: dm }))
    check('ope et yami réservées au propriétaire', /🔒.*ope.*yami|🔒.*yami.*ope/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.ope all', { jid: dm }))
    check('.ope all : tout supprimé', /Toutes les commandes ont été supprimées/.test(textsOf(out)))
    out = await send(raw('.yami', { jid: dm }))
    check('.ope all : la liste est vide', /Aucune commande autorisée/.test(textsOf(out)))

    out = await send(raw('.setvar PREFIX=!'))
    check('.setvar PREFIX=! change la config à chaud', config.PREFIX === '!', config.PREFIX)
    check('.setvar écrit config.env', /PREFIX="!"/.test(fs.readFileSync(ENV, 'utf8')))
    out = await send(raw('!ping'))
    check('nouveau préfixe ! fonctionne', /Pong/.test(textsOf(out)))
    out = await send(raw('.ping'))
    check('ancien préfixe . ignoré', out.length === 0)
    out = await send(raw('!getvar PREFIX'))
    check('.getvar', /PREFIX\* = !/.test(textsOf(out)), textsOf(out))
    out = await send(raw('!setvar PREFIX=.'))
    check('retour au préfixe .', config.PREFIX === '.')
    out = await send(raw('.setvar ALIVE_MSG=Salut #name v#version'))
    out = await send(raw('.alive'))
    check('ALIVE_MSG personnalisé', textsOf(out).includes(`Salut ${config.BOT_NAME} v${config.VERSION}`), textsOf(out))
    out = await send(raw('.delvar ALIVE_MSG'))
    check('.delvar', !process.env.ALIVE_MSG && !/ALIVE_MSG/.test(fs.readFileSync(ENV, 'utf8')))
    out = await send(raw('.setvar PATH=x'))
    check('.setvar refuse une variable système', /système/.test(textsOf(out)) && process.env.PATH !== 'x')
    out = await send(raw('.allvar'))
    check('.allvar : seulement les variables de config.env, triées', /^PREFIX = /m.test(textsOf(out)) && !/AUTO_UPDATE/.test(textsOf(out)) && !/GEMINI_MODEL/.test(textsOf(out)), textsOf(out))
    out = await send(raw('.setvar GEMINI_API_KEY=AIzaSECRETVALUE123'))
    check('.setvar masque les secrets', !textsOf(out).includes('SECRETVALUE'), textsOf(out))
    await send(raw('.delvar GEMINI_API_KEY'))

    out = await send(raw('.setsudo 2250700000009'))
    check('.setsudo ajoute un numéro', config.SUDO.includes('2250700000009'))
    out = await send(raw('.getsudo', { from: '2250700000009' }))
    check('le nouveau sudo peut utiliser les commandes', /2250700000009/.test(textsOf(out)))
    out = await send(raw('.delsudo 2250700000009'))
    check('.delsudo', !config.SUDO.includes('2250700000009'))

    await send(raw('.online on'))
    check('.online on', config.ALWAYS_ONLINE === true)
    await send(raw('.online off'))
    await send(raw('.status emoji 🔥,❤️'))
    check('.status emoji', config.STATUS_VIEW_EMOJI === '🔥,❤️')
    await send(raw('.status emoji off'))

    const inGroup = (text, opts = {}) => raw(text, { jid: GROUP, participant: `${opts.from || OWNER}@s.whatsapp.net`, ...opts })
    {
      require('../lib').bot({ pattern: 'plante ?(.*)', type: 'misc' }, async () => {
        throw new Error('boum')
      })
      out = await send(inGroup('.plante'))
      const report = out.find((s) => /ERROR REPORT/.test(s.content?.text || ''))
      check('erreur de commande : rapport dans le PV du propriétaire, pas dans le groupe', report && report.jid === `${OWNER}@s.whatsapp.net` && /Error    : boum/.test(report.content.text) && /Command  : plante/.test(report.content.text) && !out.some((s) => s.jid === GROUP), JSON.stringify(out.map((s) => s.jid)))
      const { commands } = require('../lib/plugins')
      commands.splice(commands.findIndex((c) => c.name === 'plante'), 1)
      const dl = require('../lib/download')
      const realFb = dl.facebook
      dl.facebook = async () => {
        throw new Error('panne fb')
      }
      out = await send(inGroup('.fb https://www.facebook.com/v/1'))
      const fbReport = out.find((s) => /ERROR REPORT/.test(s.content?.text || ''))
      check('erreur interceptée (fb) : rapport aussi dans le PV', fbReport && fbReport.jid === `${OWNER}@s.whatsapp.net` && /panne fb/.test(fbReport.content.text) && /Command  : fb/.test(fbReport.content.text), JSON.stringify(out.map((s) => s.jid)))
      dl.facebook = realFb
    }
    out = await send(inGroup('.tagall Bonjour'))
    check('.tagall mentionne tout le monde', out[0]?.content?.mentions?.length === 2)
    out = await send(inGroup('.tag Message caché'))
    check('.tag (mentions cachées) ≠ .tagall', out[0]?.content?.text === 'Message caché' && out[0]?.content?.mentions?.length === 2)
    calls.length = 0
    out = await send(inGroup('.kick', { extra: { contextInfo: { mentionedJid: ['90000000000002@lid'] } } }))
    check('.kick retire le membre mentionné', calls.some((c) => c.fn === 'participants' && c.action === 'remove' && c.list[0] === '90000000000002@lid'))
    out = await send(inGroup('.link'))
    check('.link', /chat\.whatsapp\.com\/INVITE123/.test(textsOf(out)))
    out = await send(inGroup('.mute'))
    check('.mute', calls.some((c) => c.fn === 'setting' && c.value === 'announcement'))
    out = await send(raw('.kick 2250700000002'))
    check('commande de groupe hors groupe : refusée', /groupe/.test(textsOf(out)))

    await send(inGroup('.antilink on'))
    out = await send(inGroup('Rejoins https://chat.whatsapp.com/xyz', { from: STRANGER, fromMe: false }))
    check('antilink supprime le lien d\'un membre', out.some((s) => s.content?.delete))
    out = await send(inGroup('Mon lien https://exemple.com'))
    check('antilink ignore le propriétaire', !out.some((s) => s.content?.delete))
    await send(inGroup('.antilink off'))

    out = await send(raw('.delete g'))
    check('.delete g : activé, message comme Knull', config.ANTI_DELETE === 'g' && /même/.test(textsOf(out)), textsOf(out))
    const revoke = async (id, rid) =>
      send({
        key: { remoteJid: rid, fromMe: false, id: `REV${++n}` },
        message: { protocolMessage: { type: B.proto.Message.ProtocolMessage.Type.REVOKE, key: { id } } },
      })
    const original = raw('message secret', { from: STRANGER, fromMe: false })
    await send(original)
    out = await revoke(original.key.id, original.key.remoteJid)
    check('anti-delete renvoie le message supprimé', out.some((s) => s.content?.forward?.key?.id === original.key.id))
    out = await send(raw('.delete g gm'))
    check('.delete g gm : portée enregistrée', config.ANTI_DELETE === 'g gm' && /groupes/.test(textsOf(out)), textsOf(out))
    const second = raw('autre secret', { from: STRANGER, fromMe: false })
    await send(second)
    out = await revoke(second.key.id, second.key.remoteJid)
    check('.delete g gm : ignore les discussions privées', !out.some((s) => s.content?.forward))
    out = await send(raw('.delete x zz'))
    check('.delete invalide : affiche les exemples', /Exemples/.test(textsOf(out)) && config.ANTI_DELETE === 'g gm')
    out = await send(raw('.delete off'))
    check('.delete off', config.ANTI_DELETE === 'false' && /désactivée/.test(textsOf(out)))

    {
      const dl = require('../lib/download')
      const swap = (group, list) => dl.providers[group].splice(0, dl.providers[group].length, ...list)
      const original = { FACEBOOK: [...dl.providers.FACEBOOK], INSTAGRAM: [...dl.providers.INSTAGRAM], TIKTOK: [...dl.providers.TIKTOK] }
      const used = []
      const fail = (name) => async () => (used.push(name), Promise.reject(new Error('down')))
      const empty = (name) => async () => (used.push(name), [])
      const ok = (name) => async () => (used.push(name), [`https://cdn/${name}.mp4`])
      swap('TIKTOK', [fail('a'), empty('b'), ok('c')])
      const links = await dl.tiktok('https://www.tiktok.com/@x/video/1')
      check('téléchargement : bascule auto vers la source suivante', links[0] === 'https://cdn/c.mp4' && used.join() === 'a,b,c', used.join())
      swap('FACEBOOK', [fail('x'), fail('y')])
      check('téléchargement : toutes les sources en panne → vide', (await dl.facebook('https://www.facebook.com/v/1')).length === 0)
      check('téléchargement : mauvais site refusé', (await dl.instagram('https://exemple.com/a')).length === 0)
      for (const g of Object.keys(original)) swap(g, original[g])
    }
    out = await send(raw('.vv'))
    check('.vv retiré : aucune réponse', out.length === 0)
    {
      const { setVar } = require('../lib/vars')
      setVar('VV', 'p')
      check('ancien VV=p : repris comme ANTI_VV=p', config.VV === undefined && config.ANTI_VV === 'p')
      setVar('VV', 'false')
    }
    out = await send(raw('.antivv p'))
    check('.antivv p : activé', config.ANTI_VV === 'p' && /ta discussion/.test(textsOf(out)), textsOf(out))
    {
      const realDownload = B.downloadMediaMessage
      B.downloadMediaMessage = async () => Buffer.from('IMG')
      const vo = {
        key: { remoteJid: `${STRANGER}@s.whatsapp.net`, fromMe: false, id: `VO${++n}` },
        pushName: 'Ami',
        message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg', caption: 'secret', viewOnce: true } } } },
      }
      out = await send(vo)
      const fwd = out.find((s) => s.content?.image)
      check('antivv : la vue unique arrive dans ta discussion', fwd && fwd.jid === `${OWNER}@s.whatsapp.net` && /Vue unique/.test(fwd.content.caption) && /secret/.test(fwd.content.caption), JSON.stringify(out.map((s) => s.jid)))
      const plain = { ...vo, key: { ...vo.key, id: `VO${++n}` }, message: { imageMessage: { mimetype: 'image/jpeg' } } }
      out = await send(plain)
      check('antivv : une photo normale n’est pas renvoyée', !out.some((s) => s.content?.image))
      B.downloadMediaMessage = realDownload
    }
    out = await send(raw('.antivv off'))
    check('.antivv off', config.ANTI_VV === 'false')
    {
      const { parseAntiDelete, inDeleteScope } = require('../lib/handler')
      check('anti-delete : portées pm/gm/no-pm/no-gm', inDeleteScope('pm', 'a@s.whatsapp.net') && !inDeleteScope('pm', 'g@g.us') && inDeleteScope('no-pm', 'g@g.us') && !inDeleteScope('no-gm', 'g@g.us') && parseAntiDelete('null') === null)
    }

    const OWN_CHAT = `${OWNER}@s.whatsapp.net`
    const statusMsg = (from, message = { imageMessage: { caption: 'mon statut', mimetype: 'image/jpeg' } }) => ({
      key: { remoteJid: 'status@broadcast', fromMe: false, id: `ST${++n}`, participant: `${from}@s.whatsapp.net` },
      pushName: 'Ami',
      message,
    })
    const postStatus = async (msg) => {
      reads = []
      return send(msg)
    }
    await send(raw('.status off'))
    out = await postStatus(statusMsg(STRANGER))
    check('statuts off : rien ne se passe', out.length === 0 && reads.length === 0)

    await send(raw('.status on'))
    out = await postStatus(statusMsg(STRANGER))
    check('status on : statut vu', reads.length === 1)
    check('status on : statut renvoyé dans ta discussion', out.some((s) => s.jid === OWN_CHAT && s.relay?.imageMessage))

    await send(raw('.status emoji 🔥'))
    out = await postStatus(statusMsg(STRANGER))
    check('status emoji : réaction envoyée', out.some((s) => s.jid === 'status@broadcast' && s.content?.react?.text === '🔥'))
    await send(raw('.status emoji off'))

    await send(raw('.status no-dl'))
    out = await postStatus(statusMsg(STRANGER))
    check('status no-dl : vu mais pas renvoyé', reads.length === 1 && !out.some((s) => s.relay))

    await send(raw('.status hide-view'))
    out = await postStatus(statusMsg(STRANGER))
    check('status hide-view : pas de « vu » mais renvoyé', reads.length === 0 && out.some((s) => s.relay?.imageMessage))

    await send(raw('.status only-view 2250700000099'))
    out = await postStatus(statusMsg(STRANGER))
    check('status only-view : les autres sont ignorés', reads.length === 0 && out.length === 0)
    out = await postStatus(statusMsg('2250700000099'))
    check('status only-view : le numéro choisi est vu', reads.length === 1)

    await send(raw(`.status except-view ${STRANGER}`))
    out = await postStatus(statusMsg(STRANGER))
    check('status except-view : le numéro exclu est ignoré', reads.length === 0 && out.length === 0)

    await send(raw('.status on'))
    await send(raw('.status msg Joli statut !'))
    out = await postStatus(statusMsg(STRANGER))
    const replied = out.filter((s) => s.content?.text === 'Joli statut !')
    out = await postStatus(statusMsg(STRANGER))
    check('status msg : réponse envoyée à l\'auteur', replied.length === 1 && replied[0].jid === `${STRANGER}@s.whatsapp.net`)
    check('status msg : pas de 2e réponse avant 12 h', !out.some((s) => s.content?.text === 'Joli statut !'))
    await send(raw('.status msg Désolé pour le delay'))
    check('status msg avec le mot « delay » ne touche pas aux options', config.STATUS_VIEW_MSG === 'Désolé pour le delay' && config.AUTO_STATUS_VIEW === 'true')
    await send(raw('.status msg off'))

    await send(raw('.status forward 2250700000055'))
    out = await postStatus(statusMsg(STRANGER))
    check('status forward : renvoyé vers le numéro choisi', out.some((s) => s.jid === '2250700000055@s.whatsapp.net' && s.relay?.imageMessage))
    await send(raw('.status forward me'))
    out = await postStatus(statusMsg(OWNER))
    check('statut : ton propre statut est ignoré', reads.length === 0 && !out.some((s) => s.relay))
    out = await postStatus(statusMsg(STRANGER, { protocolMessage: { type: 0 } }))
    check('statut supprimé : ni vu ni renvoyé', reads.length === 0 && out.length === 0)
    out = await postStatus(statusMsg(STRANGER, { extendedTextMessage: { text: 'statut texte' } }))
    check('statut texte : renvoyé avec l\'auteur', out.some((s) => s.jid === OWN_CHAT && /Statut de Ami/.test(s.content?.text || '') && /statut texte/.test(s.content?.text || '')))
    await send(raw('.status off'))

    const client = require('../lib/client')
    let welcome = client.welcomeText(sock)
    check('bienvenue : nom du bot', welcome.includes(`Bienvenue sur ${config.BOT_NAME}`) && welcome.includes(`Je suis *${config.BOT_NAME}*`))
    check('bienvenue : nom du compte par défaut', welcome.includes('*Alex*'))
    process.env.OWNER_NAME = 'Boss'
    config.reload()
    welcome = client.welcomeText(sock)
    check('bienvenue : OWNER_NAME', welcome.includes('*Boss*'))
    delete process.env.OWNER_NAME
    process.env.AUTO_STATUS_VIEW = 'no-dl'
    config.reload()
    const card = client.startCard(sock)
    check('carte : nom, préfixe, menu, version', card.includes('ReadMore') && card.includes('PREFIX    : .') && card.includes('.menu | .help | .list') && card.includes(config.VERSION))
    check('carte : ligne ANTI VIEW ONCE', card.includes('ANTI VIEW ONCE'))
    check('carte : plus de ligne VIEW ONCE (vv)', !card.includes('VIEW ONCE (vv)'))
    process.env.ANTI_VV = '+2250700000009 gm'
    config.reload()
    check('carte : antivv vers un numéro → JID complet', client.startCard(sock).includes('✅ (2250700000009@s.whatsapp.net gm)'), client.startCard(sock).split('\n').find((l) => l.includes('ANTI VIEW ONCE')))
    delete process.env.ANTI_VV
    config.reload()
    check('carte : réglages en ✅ / ❎', card.includes('👀 AUTO STATUS VIEW') && card.includes('✅ (no-dl)') && card.includes('❎'))
    process.env.AUTO_STATUS_VIEW = 'false'
    config.reload()
    const image = fs.readFileSync(path.join(ROOT, 'media', 'welcome.jpg'))
    check('image de démarrage présente (JPEG)', image[0] === 0xff && image[1] === 0xd8)

    const sharp = require('sharp')
    const webpmux = require('node-webpmux')
    const { withExif, imageToWebp } = require('../plugins/sticker')
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
    const webp = await withExif(await imageToWebp(png), 'MonPack', 'Moi')
    const meta = await sharp(webp).metadata()
    const img = new webpmux.Image()
    await img.load(webp)
    check('sticker : webp 512x512', meta.format === 'webp' && meta.width === 512 && meta.height === 512)
    check('sticker : pack et auteur dans l\'EXIF', /MonPack/.test(img.exif.toString()) && /Moi/.test(img.exif.toString()))

    {
      const multi = require('../lib/multi')
      check('multi-session : SESSION_ID séparés par des virgules, sans doublon', JSON.stringify(multi.sessionIds(' Nyx_a , Nyx_b,Nyx_a,,')) === '["Nyx_a","Nyx_b"]')
      check('multi-session : une seule session = mode normal', multi.sessionIds('Nyx_a').length === 1)
      const instance = require('../lib/instance')
      check('multi-session : session 1 garde les dossiers habituels', instance.isMain && instance.sessionDir.endsWith('session') && !instance.sessionDir.includes('sessions'))
      const { execFileSync } = require('child_process')
      const dir = execFileSync(process.execPath, ['-e', "console.log(require('./lib/instance').sessionDir)"], { cwd: ROOT, env: { ...process.env, NYX_INSTANCE: '2' } }).toString().trim()
      check('multi-session : session 2 dans sessions/2', dir.split(path.sep).join('/').endsWith('sessions/2/session'), dir)
    }
    const session = require('../lib/session')
    session.clearSession()
    const creds = B.initAuthCreds()
    const keyId = 'AAAAAAAA'
    creds.myAppStateKeyId = keyId
    const appKey = { keyData: Buffer.from('cle-de-test-0123456789'), fingerprint: { rawId: 1, currentIndex: 2, deviceIndexes: [0] }, timestamp: '1700000000' }
    const json = JSON.stringify({ id: 'Nexora_0123456789abcdef', creds, keys: { 'app-state-sync-key': { [keyId]: appKey } } }, B.BufferJSON.replacer)
    const portable = `Nexora~${zlib.gzipSync(json).toString('base64url')}`
    const state = await session.prepareSession({ SESSION_ID: portable, SESSION_URL: '' })
    check('import d\'un SESSION_ID Nexora~', state === 'imported')
    const { state: auth } = await B.useMultiFileAuthState(session.SESSION_DIR)
    check('les clés de session sont relues à l\'identique', Buffer.compare(auth.creds.noiseKey.private, creds.noiseKey.private) === 0)
    const keys = await auth.keys.get('app-state-sync-key', [keyId])
    check('la clé app-state est relue', !!keys[keyId] && Buffer.from(keys[keyId].keyData).toString() === 'cle-de-test-0123456789')
    let invalid = ''
    session.clearSession()
    try {
      await session.prepareSession({ SESSION_ID: 'nimportequoi', SESSION_URL: '' })
    } catch (error) {
      invalid = error.message
    }
    check('SESSION_ID invalide : refusé', invalid === 'invalid_session_id')
    session.clearSession()
    const realFetch = global.fetch
    let asked = ''
    global.fetch = async (url) => {
      asked = String(url)
      return new Response(json)
    }
    try {
      const custom = await session.prepareSession({ SESSION_ID: 'Nyx_monbot', SESSION_URL: 'https://site.test/json/' })
      check('SESSION_ID personnalisé Nyx_monbot importé', custom === 'imported' && asked === 'https://site.test/json/Nyx_monbot/nyx', asked)
      session.clearSession()
      const own = await session.prepareSession({ SESSION_ID: 'Nyx_monbot_k3f9', SESSION_URL: 'https://site.test/json/' })
      check('SESSION_ID personnel Nyx_monbot_k3f9 importé', own === 'imported' && asked === 'https://site.test/json/Nyx_monbot_k3f9/nyx', asked)
    } finally {
      global.fetch = realFetch
      session.clearSession()
    }
  } catch (error) {
    failed++
    console.log(`❌ erreur inattendue : ${error?.stack || error}`)
  } finally {
    require('../lib/db').db.flush()
    restore()
    console.log(`\n${passed} réussi(s), ${failed} échec(s)`)
    process.exit(failed ? 1 : 0)
  }
})()
