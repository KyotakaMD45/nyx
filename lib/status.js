function parseStatusView(raw) {
  const value = String(raw || '').trim()
  const lower = value.toLowerCase()
  const numbers = value.match(/\d{6,}/g) || []
  return {
    enabled: !!value && lower !== 'false' && lower !== 'off',
    noDownload: lower.includes('no-dl'),
    hideView: lower.includes('hide-view'),
    delay: lower.includes('delay'),
    only: lower.includes('only-view') ? new Set(numbers) : null,
    except: lower.includes('except-view') ? new Set(numbers) : null,
  }
}

function statusMode(raw) {
  const options = parseStatusView(raw)
  if (!options.enabled) return null
  if (options.only) return 'only-view'
  if (options.except) return 'except-view'
  if (options.noDownload) return 'no-dl'
  return 'all'
}

module.exports = { parseStatusView, statusMode }
