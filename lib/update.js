const { execFile, exec, spawn } = require('child_process')
const path = require('path')
const config = require('../config')
const { logger } = require('./logger')

const ROOT = path.join(__dirname, '..')

function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, timeout: 120000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: String(stdout || '').trim(), err: String(stderr || error?.message || '').trim() })
    })
  })
}

function run(command) {
  return new Promise((resolve) => {
    exec(command, { cwd: ROOT, timeout: 600000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, err: String(stderr || error?.message || '').trim() })
    })
  })
}

async function npmInstall() {
  if ((await run('yarn --version')).ok) {
    const first = await run('yarn install --network-concurrency 3')
    if (first.ok) return first
    await run('yarn cache clean')
    return run('yarn install --network-concurrency 3')
  }
  return run('npm install --omit=dev --no-audit --no-fund')
}

async function currentBranch() {
  if (config.BRANCH) return config.BRANCH
  const res = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return res.ok && res.out && res.out !== 'HEAD' ? res.out : 'main'
}

async function checkUpdates() {
  if (!(await git(['rev-parse', '--is-inside-work-tree'])).ok) return { error: 'not_git' }
  if (!(await git(['remote', 'get-url', 'origin'])).ok) return { error: 'no_remote' }
  const branch = await currentBranch()
  const fetched = await git(['fetch', 'origin', branch, '--quiet'])
  if (!fetched.ok) return { error: 'fetch', detail: fetched.err }
  const log = await git(['log', `HEAD..origin/${branch}`, '--pretty=format:%h %s'])
  const commits = log.ok && log.out ? log.out.split('\n') : []
  return { branch, commits }
}

async function updateNow() {
  const status = await checkUpdates()
  if (status.error) return status
  if (!status.commits.length) return { ...status, upToDate: true }
  const reset = await git(['reset', '--hard', `origin/${status.branch}`])
  if (!reset.ok) return { ...status, error: 'reset', detail: reset.err }
  const npm = await npmInstall()
  if (!npm.ok) logger.warn(`npm install : ${npm.err}`)
  return { ...status, updated: true, npmOk: npm.ok }
}

function restart(delay = 1500) {
  setTimeout(() => {
    if (process.env.pm_id === undefined) {
      const child = spawn(process.execPath, process.argv.slice(1), { cwd: ROOT, detached: true, stdio: 'inherit' })
      child.unref()
    }
    process.exit(0)
  }, delay)
}

let watching = false

function msUntilNextSlot(hours, now = new Date()) {
  if (!(hours >= 1 && hours <= 24)) return Math.max(60000, (hours || 6) * 3600 * 1000)
  let local = now
  try {
    local = new Date(now.toLocaleString('en-US', { timeZone: config.TZ }))
  } catch {}
  const next = new Date(local)
  next.setMinutes(0, 0, 0)
  next.setHours(Math.floor(local.getHours() / hours) * hours + hours)
  return Math.max(60000, next - local)
}

async function installUpdates(notify, texts, status) {
  await notify(texts.installing(status.commits.length))
  const result = await updateNow()
  if (result.updated) restart()
}

function startAutoUpdate(notify, texts) {
  if (watching) return
  watching = true

  const atStart = async () => {
    try {
      const status = await checkUpdates()
      if (!status.error && status.commits.length && config.AUTO_UPDATE) await installUpdates(notify, texts, status)
    } catch (error) {
      logger.warn(`vérification des mises à jour : ${error.message}`)
    }
  }

  const tick = async () => {
    try {
      const status = await checkUpdates()
      if (status.error || !status.commits.length) return
      if (config.AUTO_UPDATE) await installUpdates(notify, texts, status)
      else await notify(texts.available(status.commits))
    } catch (error) {
      logger.warn(`vérification des mises à jour : ${error.message}`)
    }
  }

  const schedule = () => {
    setTimeout(async () => {
      await tick()
      schedule()
    }, msUntilNextSlot(config.UPDATE_INTERVAL)).unref?.()
  }

  setTimeout(atStart, 60 * 1000).unref?.()
  schedule()
}

module.exports = { checkUpdates, updateNow, restart, startAutoUpdate, currentBranch, msUntilNextSlot }
