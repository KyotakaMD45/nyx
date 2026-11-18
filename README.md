# Nyx

Bot WhatsApp léger, autonome et extensible par plugins.
Même architecture que Levanter (`config.js`, `config.env`, `lib/`, `plugins/`, `lang/`),
écrit de zéro sur la bibliothèque **Baileys officielle** (open source).

- 42 commandes essentielles : système, réglages, propriétaire, groupe, médias, IA
- Variables modifiables depuis WhatsApp (`.setvar`) sans redémarrage
- Mises à jour : `.update`, `.update now` et `AUTO_UPDATE`
- Connexion par SESSION_ID (site de session), QR code ou code d'appairage
- Français par défaut, anglais disponible (`BOT_LANG=en`)

---

## Installation (VPS Ubuntu / Debian)

```bash
# Node.js 20+, git et ffmpeg (ffmpeg sert aux stickers vidéo)
sudo apt update && sudo apt install -y git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

git clone https://github.com/<ton-compte>/nyx.git
cd nyx
npm install
cp config.env.example config.env
nano config.env          # mets ton SESSION_ID (ou laisse vide pour le QR)
npm start                # lance le bot avec PM2
npm run logs             # voir les logs (QR, code d'appairage…)
```

Le bot doit être installé avec `git clone` pour que les mises à jour fonctionnent.

## Se connecter

Trois façons, au choix :

| Méthode | Comment |
|---|---|
| **SESSION_ID** | Crée ta session sur ton site de session, puis `SESSION_ID="Nexora~…"` ou `"Nexora_…"` dans `config.env`. |
| **QR code** | Laisse `SESSION_ID` vide : un QR s'affiche dans les logs, scanne-le dans WhatsApp › Appareils connectés. |
| **Code d'appairage** | `PAIRING_NUMBER="2250700000000"` : un code à 8 caractères s'affiche dans les logs. |

La session est ensuite enregistrée dans le dossier `session/`. Si WhatsApp la déconnecte, Nyx la supprime et redemande un QR, sans boucler.

## Commandes

Préfixe par défaut : `.` (modifiable : `.setvar PREFIX=!`). Liste complète dans le bot : `.menu`.

| Catégorie | Commandes |
|---|---|
| Système | `alive` `ping` `menu` (`help`, `list`) `restart` `update` |
| Réglages | `setvar` `getvar` `delvar` `allvar` `mode` `online` `read` `call` `status` `antidelete` |
| Propriétaire | `setsudo` `delsudo` `getsudo` `block` `unblock` `jid` |
| Groupe | `kick` `add` `promote` `demote` `tagall` `tag` `link` `revoke` `mute` `unmute` `ginfo` `gname` `gdesc` `antilink` `welcome` `goodbye` |
| Médias | `sticker` (`s`) `take` `toimg` `vv` |
| IA | `ai` (`gemini`, `gpt`) |

**Mode** : `private` (par défaut), seuls toi et les sudo utilisent le bot. `public` : tout le monde peut utiliser les commandes publiques (`alive`, `ping`, `menu`, stickers, `ai`). Les commandes sensibles restent réservées au propriétaire et aux sudo.

## Variables

Toutes se règlent dans `config.env` ou depuis WhatsApp avec `.setvar CLÉ=VALEUR`. `.allvar` les liste.

| Variable | Rôle | Défaut |
|---|---|---|
| `SESSION_ID` | Session venant du site de session | — |
| `SESSION_URL` | Serveur des sessions à ID court | `https://nexora-inky-delta.vercel.app/json/` |
| `PAIRING_NUMBER` | Connexion par code d'appairage | — |
| `BOT_NAME` | Nom du bot | `Nyx` |
| `BOT_LANG` | `fr` ou `en` (redémarrage requis) | `fr` |
| `PREFIX` | Préfixe(s) : `.` · `.,!` · `false` (aucun) | `.` |
| `MODE` | `private` ou `public` | `private` |
| `SUDO` | Numéros sudo, séparés par des virgules | — |
| `AUTO_UPDATE` | Installer les mises à jour tout seul | `false` |
| `UPDATE_INTERVAL` | Vérification des mises à jour (heures) | `6` |
| `BRANCH` | Branche git suivie (détectée si vide) | — |
| `ALWAYS_ONLINE` | Toujours en ligne | `false` |
| `SEND_READ` | Marquer les messages comme lus | `false` |
| `REJECT_CALL` / `REJECT_CALL_MSG` | Rejeter les appels / message envoyé | `false` |
| `AUTO_STATUS_VIEW` / `STATUS_VIEW_EMOJI` | Voir les statuts / y réagir | `false` |
| `ANTI_DELETE` | `false`, `p` (vers toi), `g` (même discussion) ou un numéro | `false` |
| `ALIVE_MSG` | Message alive perso (`#name #version #uptime #ram #prefix`) | — |
| `STICKER_PACKNAME` | `Pack,Auteur` des stickers | `Nyx,Nyx Bot` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Clé d'IA (une seule suffit) | — |
| `DISABLE_START_MESSAGE` | Pas de message au démarrage | `false` |
| `TZ` / `LOG_LEVEL` | Fuseau horaire / niveau des logs | `Africa/Abidjan` / `info` |

## Mises à jour

Nyx est un dépôt git : quand tu pousses une nouvelle version sur ton GitHub, ton bot peut la récupérer.

- `.update` : liste les nouveautés disponibles
- `.update now` : installe (`git reset --hard`, puis `npm install`) et redémarre
- `AUTO_UPDATE=true` : vérifie toutes les `UPDATE_INTERVAL` heures et installe tout seul. Avec `false`, il te prévient seulement.

`config.env`, `session/` et `data/` ne sont jamais touchés par une mise à jour (ils sont hors de git).

## Structure

```
nyx/
├── index.js            point d'entrée
├── config.js           configuration (lit config.env)
├── config.env.example  modèle de configuration
├── lang/               textes du bot (fr, en)
├── lib/                cœur du bot
│   ├── client.js       connexion WhatsApp, QR, reconnexion
│   ├── handler.js      réception des messages, commandes, anti-suppression
│   ├── plugins.js      système de plugins : bot({ pattern, desc, type }, handler)
│   ├── message.js      objet message donné aux plugins
│   ├── session.js      import du SESSION_ID
│   ├── vars.js         variables (setvar / getvar / delvar)
│   ├── update.js       mises à jour (git)
│   ├── db.js           petite base de données (data/db.json)
│   └── utils.js        outils partagés
├── plugins/            les commandes
└── test/smoke.js       test automatique (npm test)
```

## Écrire un plugin

Crée un fichier dans `plugins/`, il est chargé au démarrage :

```js
const { bot } = require('../lib')

bot(
  {
    pattern: 'bonjour ?(.*)',     // la commande .bonjour, avec des arguments facultatifs
    desc: 'Dit bonjour',
    type: 'misc',
    fromMe: false,                // false = utilisable par tous en mode public
  },
  async (message, match) => {
    await message.reply(`Bonjour ${match || message.pushName} !`)
  }
)
```

`message` contient notamment `jid`, `isGroup`, `sender`, `text`, `reply_message`, et les méthodes `send()`, `reply()`, `react()`, `download()`.

## Tester

```bash
npm test
```

Ce test simule des messages WhatsApp sans connexion (commandes, permissions, variables, groupe, antilink, anti-suppression, stickers, import de session). Il ne modifie pas ta configuration.
