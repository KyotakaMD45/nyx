// Baileys is an ES module: it is imported once, on demand, from this CommonJS project.
let baileys = null

async function loadBaileys() {
  if (!baileys) {
    const mod = await import('baileys')
    baileys = { ...mod, makeWASocket: mod.makeWASocket || mod.default }
  }
  return baileys
}

// Synchronous access once loadBaileys() has resolved (the client loads it at startup).
function getBaileys() {
  if (!baileys) throw new Error('Baileys is not loaded yet')
  return baileys
}

module.exports = { loadBaileys, getBaileys }
