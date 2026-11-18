const { bot, lang, prefixes, checkUpdates, updateNow, restart } = require('../lib')

function errorText(result) {
  const t = lang.plugins.update
  if (result.error === 'not_git') return t.not_git
  if (result.error === 'no_remote') return t.no_remote
  return t.failed.format(result.detail || result.error)
}

bot(
  {
    pattern: 'update ?(.*)',
    desc: lang.plugins.update.desc,
    type: 'system',
  },
  async (message, match) => {
    const t = lang.plugins.update
    if ((match || '').trim().toLowerCase() === 'now') {
      await message.reply(t.installing)
      const result = await updateNow()
      if (result.error) return message.reply(errorText(result))
      if (result.upToDate) return message.reply(t.up_to_date)
      await message.reply(t.updated.format(result.commits.length) + (result.npmOk ? '' : `\n\n${t.npm_warning}`))
      return restart()
    }
    await message.reply(t.checking)
    const result = await checkUpdates()
    if (result.error) return message.reply(errorText(result))
    if (!result.commits.length) return message.reply(t.up_to_date)
    const list = result.commits.slice(0, 10).map((c) => `• ${c}`).join('\n')
    const more = result.commits.length > 10 ? `\n${t.more.format(result.commits.length - 10)}` : ''
    await message.reply(t.available.format(result.commits.length, list + more, prefixes()[0] || ''))
  }
)
