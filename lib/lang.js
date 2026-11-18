const fs = require('fs')
const path = require('path')
const config = require('../config')

if (!String.prototype.format) {
  Object.defineProperty(String.prototype, 'format', {
    enumerable: false,
    value(...args) {
      return this.replace(/\{(\d+)\}/g, (match, index) => (args[index] !== undefined ? args[index] : match))
    },
  })
}

function load(code) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${code}.json`), 'utf8'))
  } catch {
    return null
  }
}

const lang = load(config.BOT_LANG) || load('fr')

module.exports = { lang }
