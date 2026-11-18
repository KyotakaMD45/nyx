// Updates, like Levanter: the bot is a git clone of its repository.
//   checkUpdates()  -> commits available on origin/<branch>
//   updateNow()     -> git reset --hard origin/<branch> + npm install, then restart()
//   startAutoUpdate -> every UPDATE_INTERVAL hours: install (AUTO_UPDATE=true) or just notify
// config.env, session/ and data/ are git-ignored, so an update never touches them.
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

function npmInstall() {
  return new Promise((resolve) => {
    exec('npm install --omit=dev --no-audit --no-fund', { cwd: ROOT, timeout: 600000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, err: String(stderr || error?.message || '').trim() })
    })
  })
}

async function currentBranch() {
  if (config.BRANCH) return config.BRANCH
  const res = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return res.ok && res.out && res.out !== 'HEAD' ? res.out : 'main'
}

// { branch, commits: ["abc123 message", ...] } or { error: 'not_git' | 'no_remote' | 'fetch', detail }
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

// Under PM2 (npm start), exiting is enough: PM2 starts the bot again.
// Without PM2, a new process is spawned before this one exits.
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
let lastNotified = ''

// notify(text): sends a message to the owner.
function startAutoUpdate(notify, texts) {
  if (watching) return
  watching = true
  const tick = async () => {
    try {
      const status = await checkUpdates()
      if (status.error || !status.commits.length) return
      if (config.AUTO_UPDATE) {
        await notify(texts.installing(status.commits.length))
        const result = await updateNow()
        if (result.updated) restart()
      } else if (status.commits[0] !== lastNotified) {
        lastNotified = status.commits[0]
        await notify(texts.available(status.commits))
      }
    } catch (error) {
      logger.warn(`vérification des mises à jour : ${error.message}`)
    }
  }
  setTimeout(tick, 60 * 1000).unref?.()
  setInterval(tick, config.UPDATE_INTERVAL * 3600 * 1000).unref?.()
}

module.exports = { checkUpdates, updateNow, restart, startAutoUpdate, currentBranch }
