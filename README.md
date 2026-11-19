# Nyx — bot WhatsApp

Un bot WhatsApp léger et rapide, écrit sur la bibliothèque **Baileys** officielle,
avec un système de plugins, des outils de groupe, des téléchargements et des mises à jour automatiques.

## Fonctionnalités

- **Multi-session** – plusieurs comptes WhatsApp dans un seul bot.
- **Plugins** – commandes intégrées et plugins externes (`eplugins`). Un plugin tiers écrit pour Levanter/Knull reste compatible : `message.client.nyxId` est aussi exposé sous `levanterId` / `knullId`, et le bus d'évènements `require('../lib').nyx` (alias `levanter` / `knull`) émet `incoming.message` pour chaque message reçu.
- **Groupes** – antilink, bienvenue / au revoir, tag, promotion, sourdine.
- **Protection** – anti-suppression (`delete`) et vues uniques automatiques (`antivv`).
- **AFK** – `afk <raison>` : le bot répond à ta place quand tu es absent.
- **Rapports d'erreur** – quand une commande échoue, un rapport arrive dans ton PV.
- **Statuts** – vue automatique, réaction, transfert.
- **Téléchargement** – YouTube, TikTok, Facebook, Instagram, avec plusieurs sources de secours.
- **Médias et IA** – stickers, conversions, Gemini / Groq.
- **Mises à jour** – `.update`, `.update now` ou `AUTO_UPDATE=true`.
- **Langues** – français et anglais.

## Langues

Choisis la langue avec `BOT_LANG` dans `config.env`.

| Code | Langue |
|------|--------|
| `fr` | Français (défaut) |
| `en` | English |

```env
BOT_LANG=fr
```

---

## Session

Crée ton `SESSION_ID` sur **https://nyx-session.vercel.app** (QR code ou code d'appairage).
Il t'est aussi envoyé dans ta propre discussion WhatsApp.

---

## Multi-session

Mets plusieurs SESSION_ID séparés par des virgules (ou par `;_;` comme Levanter) dans `config.env` :

```env
SESSION_ID="Nyx_compte1,Nyx_compte2,Nyx_compte3"
```

Ou depuis WhatsApp : `.setvar SESSION_ID=Nyx_compte1,Nyx_compte2` (le bot redémarre avec la nouvelle liste). Pour **retirer** un compte (même le premier), renvoie la liste sans lui.

Comme Levanter, chaque compte est lié à **son SESSION_ID**, pas à sa place dans la liste : ses fichiers sont dans `sessions/<SESSION_ID>/` (session, données, réglages). Ajouter, retirer ou réordonner des comptes ne mélange rien.

Chaque compte a ses propres données (commandes autorisées, alive, anti-suppression, AFK…) et **ses propres variables** : un `.setvar` envoyé depuis un compte ne change que ce compte (fichier `sessions/<SESSION_ID>/config.env`). `.delvar` le ramène à la valeur commune de `config.env`.

**Messages du bot** (bienvenue, carte de démarrage, rapports d'erreur, mises à jour, statuts, `delete p`, `antivv p`) : comme Levanter, ils arrivent dans le compte du propriétaire, c'est-à-dire le **premier numéro SUDO** s'il y en a un, sinon la discussion du bot.

Restent communes à tous : `SESSION_ID`, `AUTO_UPDATE`, `UPDATE_INTERVAL`, `BRANCH`, `TZ`, `LOG_LEVEL`, `LOG_MSG`, les clés d'IA et les sources YouTube. Une session qui plante redémarre seule ; `.restart` et les mises à jour redémarrent toutes les sessions.

---

## Déploiement

### VPS, PC ou téléphone

**Installation rapide** — Debian/Ubuntu, Fedora, Arch, Alpine, macOS et Termux (Android). Elle installe Node.js, ffmpeg et yarn, télécharge Nyx, crée `config.env` et lance le bot :

```sh
bash <(curl -fsSL https://tinyurl.com/nyx-install)
```

Sans questions : `SESSION_ID=ta_session bash <(curl -fsSL https://tinyurl.com/nyx-install) -y --start`.

**Panel** (Pterodactyl, bot-hosting…) : récupère le script `index.js` sur https://nyx-session.vercel.app/deploy#panel.

**Installation manuelle :**

1. **Paquets système :**

   ```sh
   sudo apt update && sudo apt install -y git ffmpeg curl
   ```

2. **Node.js 20 :**

   ```sh
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. **Yarn :**

   ```sh
   sudo npm install -g yarn
   ```

4. **Cloner et installer :**

   ```sh
   git clone https://github.com/KyotakaMD45/nyx.git
   cd nyx
   yarn install
   ```

5. **Configurer `config.env` :**

   ```sh
   cp config.env.example config.env
   nano config.env
   ```

   ```env
   SESSION_ID="Nyx_xxxxxxxxxxxxxxxx"
   AUTO_UPDATE="false"
   ```

6. **Lancer avec PM2 :**

   ```sh
   npm start          # démarrer
   npx pm2 logs nyx   # voir les logs
   npx pm2 stop nyx   # arrêter
   ```

---

## 🛠 Besoin d'aide ?

- [Liste des commandes](https://nyx-session.vercel.app/commands)
- [Liste des variables](https://nyx-session.vercel.app/env)
- [Questions fréquentes](https://nyx-session.vercel.app/faq)
- [Signaler un problème](https://github.com/KyotakaMD45/nyx/issues)

---

## Licence

Nyx est publié sous la [licence MIT](LICENSE).
