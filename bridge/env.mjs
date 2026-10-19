import { existsSync, readFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Bridge environment, settled before any other module loads.
 *
 * Imported first by server.mjs. ES modules evaluate their imports before
 * their own body, so loading .env.local inside server.mjs left every module
 * that reads a setting at import time (roots.mjs's MEDIQ_FILE_ROOTS, for one)
 * looking at an environment the file had not been applied to yet.
 */

/**
 * `.env.local`, loaded by hand.
 *
 * Vite reads this automatically for the frontend's VITE_* variables; a plain
 * `node bridge/server.mjs` does none of that on its own. Every bridge-side key
 * below — YOUTUBE_API_KEY, GIPHY_API_KEY, PEXELS_API_KEY, the Google Search
 * pair — was documented as "add it to .env.local" and every one of them was
 * silently ignored, because nothing here ever opened the file. A real shell
 * export still wins over this: only fills in a key that isn't already set, so
 * `MEDIQ_MODEL=x node bridge/server.mjs` still overrides whatever the file
 * says, same as it always could.
 */
function loadEnvLocal() {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // The one bit of .env syntax worth honouring: a quoted value can hold a
    // leading/trailing space or a literal # without it being read as a
    // comment marker.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && !(key in process.env)) process.env[key] = value
  }
}
loadEnvLocal()

/**
 * The settings were called JARVIS_* before the rename. An existing .env.local
 * or shell profile keeps working: each old name fills in its MEDIQ_* twin
 * unless the new one is set explicitly.
 */
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith('JARVIS_')) continue
  const renamed = `MEDIQ_${key.slice('JARVIS_'.length)}`
  if (!(renamed in process.env)) process.env[renamed] = value
}

/**
 * Enrolled voice profiles and the downloaded speaker model moved from
 * ~/.jarvis-voice to ~/.mediq-voice. Moved once, in place, so nobody has to
 * re-enrol or re-download ~28MB.
 */
const OLD_VOICE_DIR = join(homedir(), '.jarvis-voice')
const VOICE_DIR = join(homedir(), '.mediq-voice')
if (existsSync(OLD_VOICE_DIR) && !existsSync(VOICE_DIR)) {
  try {
    renameSync(OLD_VOICE_DIR, VOICE_DIR)
    console.log('[mediq] moved voice profiles to ~/.mediq-voice')
  } catch (err) {
    console.warn('[mediq] could not move ~/.jarvis-voice:', err?.message ?? err)
  }
}
