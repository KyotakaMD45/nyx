;(function () {
  const root = document.documentElement
  const saved = (() => {
    try {
      return localStorage.getItem('nyx-theme')
    } catch {
      return null
    }
  })()
  if (saved === 'light') root.dataset.theme = 'light'

  window.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme')
    if (toggle)
      toggle.onclick = () => {
        const light = root.dataset.theme !== 'light'
        if (light) root.dataset.theme = 'light'
        else delete root.dataset.theme
        try {
          localStorage.setItem('nyx-theme', light ? 'light' : 'dark')
        } catch {}
      }

    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.onclick = () => copyText(document.getElementById(button.dataset.copy).textContent.trim(), button)
    })

    const canvas = document.getElementById('stars')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      const draw = () => {
        canvas.width = innerWidth
        canvas.height = innerHeight
        let seed = 7
        const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
        for (let i = 0; i < 130; i++) {
          ctx.globalAlpha = rnd() * 0.6 + 0.2
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(rnd() * canvas.width, rnd() * canvas.height, rnd() * 1.4 + 0.3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      draw()
      addEventListener('resize', draw)
    }
  })

  window.copyText = function copyText(text, button) {
    const done = () => {
      if (!button) return
      const label = button.dataset.label || button.textContent
      button.dataset.label = label
      button.textContent = 'Copié ✓'
      button.classList.add('done')
      setTimeout(() => {
        button.textContent = label
        button.classList.remove('done')
      }, 1800)
    }
    const fallback = () => {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
      done()
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(fallback)
    else fallback()
  }
})()
