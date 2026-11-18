let baileys = null

async function loadBaileys() {
  if (!baileys) {
    const mod = await import('baileys')
    baileys = { ...mod, makeWASocket: mod.makeWASocket || mod.default }
  }
  return baileys
}

function getBaileys() {
  if (!baileys) throw new Error('Baileys is not loaded yet')
  return baileys
}

module.exports = { loadBaileys, getBaileys }
