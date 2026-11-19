# Nyx — bot WhatsApp

Un bot WhatsApp léger et rapide, écrit sur la bibliothèque **Baileys** officielle,
avec un système de plugins, des outils de groupe, des téléchargements et des mises à jour automatiques.

## Fonctionnalités

- **Plugins** – commandes intégrées et plugins externes (`eplugins`).
- **Groupes** – antilink, bienvenue / au revoir, tag, promotion, sourdine.
- **Protection** – anti-suppression (`delete`) et vues uniques (`vv`, `antivv`).
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
