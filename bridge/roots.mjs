import { homedir, tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import { relative, isAbsolute, resolve as resolvePath } from 'node:path'

/**
 * Where the bridge is permitted to read local files from.
 *
 * Shared between server.mjs (the /file endpoint) and files.mjs (browsing and
 * search), so there is exactly one definition of "safe to read" rather than
 * two that can quietly drift apart. Resolved once at boot: on macOS
 * os.tmpdir() is a symlink into /private/var, and a string-prefix check
 * against the unresolved form would reject every screenshot.
 */
export const FILE_ROOTS = [
  homedir(),
  // Both temp directories, because on macOS os.tmpdir() is the per-user
  // $TMPDIR under /var/folders while half the tools that take a screenshot
  // still write it to /tmp. Dropping one of them loses real panels.
  tmpdir(),
  '/tmp',
  ...(process.env.MEDIQ_FILE_ROOTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
].map((root) => {
  try {
    return realpathSync(root)
  } catch {
    return resolvePath(root)
  }
})

/** True when `real` sits inside one of the roots, after both are resolved. */
export const withinRoots = (real) =>
  FILE_ROOTS.some((root) => {
    const rel = relative(root, real)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
