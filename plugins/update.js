const { bot, lang, checkUpdates, updateNow, restart } = require('../lib')

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
    const result = await checkUpdates()
    if (result.error) return message.send(errorText(result))
    const now = (match || '').trim().toLowerCase() === 'now'
    if (!result.commits.length) return message.send(now ? t.up_to_date_now : t.up_to_date)
    if (!now) return message.send(t.available.format(result.commits.length, result.commits.join('\n')))
    await message.send(t.installing)
    const done = await updateNow()
    if (done.error) return message.send(errorText(done))
    await message.send(t.updated + (done.npmOk === false ? `\n\n${t.npm_warning}` : ''))
    return restart()
  }
)
