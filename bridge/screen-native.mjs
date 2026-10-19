import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

/**
 * The screen, captured directly by this process — not the browser.
 *
 * getDisplayMedia() (what the browser would otherwise use) cannot be made to
 * skip Chrome's "Choose what to share" picker. That is deliberate, permanent
 * browser policy, not a setting or a flag: silently granting a page a live
 * feed of the whole screen is the exact thing the picker exists to prevent,
 * so there is no API that waives it. Asked for a screenshot with no click,
 * the only honest fix is to stop asking the browser at all.
 *
 * This process is not a web page — it is a local Node program the user
 * started themselves, with the same standing on this machine as any other
 * app they run, so it can talk to the desktop directly. It does that through
 * ffmpeg's gdigrab input (a Windows screen-capture device), run as a child
 * process rather than through some screenshot library, because the exact
 * same tool and the exact same code path serve both a single frame and a
 * whole recording — a screenshot is just `-frames:v 1`.
 *
 * Windows quietly moves Pictures/Videos under OneDrive when Known Folder
 * Move is on, so — same fix as resolveFolder() in files.mjs — files are
 * saved into whichever of the two actually exists, defaulting to the plain
 * one.
 */

async function captureDir(isVideo) {
  const folderName = isVideo ? 'Videos' : 'Pictures'
  const subfolder = 'MEDIQ ' + (isVideo ? 'Recordings' : 'Screenshots')
  const plain = join(homedir(), folderName, subfolder)
  const oneDrive = join(homedir(), 'OneDrive', folderName, subfolder)
  const dir = existsSync(join(homedir(), 'OneDrive', folderName)) ? oneDrive : plain
  await mkdir(dir, { recursive: true })
  return dir
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Runs ffmpeg to completion and rejects with its own stderr tail on a
 *  non-zero exit — that tail is where gdigrab actually says what went
 *  wrong (no display attached, permission denied, etc). */
function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').slice(-3).join(' ') || `ffmpeg exited ${code}`))
    })
  })
}

export async function screenshot() {
  const dir = await captureDir(false)
  const path = join(dir, `Screenshot ${stamp()}.png`)
  await run(['-y', '-f', 'gdigrab', '-i', 'desktop', '-frames:v', '1', '-update', '1', path])
  return path
}

/** The one recording in progress, if any. Module-level rather than per-call
 *  state on purpose — there is exactly one desktop, so at most one recording
 *  of it can be running at a time. */
let active = null

export function isRecording() {
  return active !== null
}

export async function startRecording() {
  if (active) throw new Error('already recording')
  const dir = await captureDir(true)
  const path = join(dir, `Recording ${stamp()}.mp4`)
  const proc = spawn(
    ffmpegPath,
    [
      '-y',
      '-f', 'gdigrab',
      '-framerate', '30',
      '-i', 'desktop',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      path,
    ],
    // stdin stays open so stop() can send it the 'q' ffmpeg reads as a
    // request to finish the file properly, the same as pressing q in its
    // own terminal — a kill() would leave the mp4 without its index.
    { stdio: ['pipe', 'ignore', 'pipe'] },
  )
  let stderr = ''
  proc.stderr.on('data', (d) => {
    stderr += d.toString()
    if (stderr.length > 4000) stderr = stderr.slice(-4000)
  })

  const closed = new Promise((resolve) => proc.on('close', (code) => resolve(code)))
  active = { proc, path, closed, stderrTail: () => stderr }

  // gdigrab fails fast (no such device, access denied) — give it a moment to
  // prove it actually started before reporting success. A slow machine
  // spinning up genuinely takes longer than instant, so this only catches
  // the case where ffmpeg has already given up.
  await new Promise((resolve) => setTimeout(resolve, 400))
  if (proc.exitCode !== null) {
    const tail = stderr.trim().split('\n').slice(-3).join(' ')
    active = null
    throw new Error(tail || `ffmpeg exited ${proc.exitCode}`)
  }
  return path
}

export async function stopRecording() {
  if (!active) throw new Error('not recording')
  const { proc, path, closed } = active
  active = null
  proc.stdin.write('q')
  // ffmpeg finalizes the file on its own once it sees 'q'; a hang there
  // (stdin somehow not reaching it) shouldn't hold the tool call forever, so
  // fall back to a hard kill after a generous grace period.
  const code = await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 10_000)),
  ])
  if (code === 'timeout') {
    proc.kill()
    await closed
  }
  return path
}
