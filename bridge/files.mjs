import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, extname, basename } from 'node:path'
import { homedir } from 'node:os'
import { withinRoots } from './roots.mjs'

/**
 * Local files — listing and finding them, so MEDIQ can show a picture or
 * play a video that is just sitting on disk rather than only ones he
 * generated or captured himself in the same turn.
 *
 * Deliberately read-only and deliberately rooted. This is the same
 * withinRoots() the /file endpoint already enforces for serving bytes — see
 * roots.mjs — so a directory this can list is always one the browser can also
 * be handed a path from, and neither half of the pair is more permissive than
 * the other. Nothing here opens, renames or deletes anything; that is what
 * ALLOW_WRITES and the Bash/Write/Edit gate are for, and this stays out of
 * their way entirely.
 */

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.ogv'])

/** Directories that are technically inside the roots but never what anyone
 *  means by "my files" — huge, noisy, and slow to walk for no payoff. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.cache', '.npm', '.cargo',
  'AppData', 'Library', '.Trash', '$Recycle.Bin', 'System Volume Information',
])

const ok = (text) => ({ content: [{ type: 'text', text }] })
const refuse = (text) => ({ isError: true, content: [{ type: 'text', text }] })

function kindOf(ext) {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  return 'file'
}

const TYPE_FILTER = {
  images: (k) => k === 'image',
  videos: (k) => k === 'video',
  all: () => true,
}

/** Resolve a user-facing path to a real, contained one — or null. Symlinks
 *  are resolved before anything is judged, same reasoning as the endpoint:
 *  a name that looks safe can point outside the roots entirely. */
async function resolveSafe(asked) {
  try {
    const real = await realpath(asked)
    return withinRoots(real) ? real : null
  } catch {
    return null
  }
}

/**
 * Resolve a folder the user NAMED, not necessarily a path they typed exactly.
 *
 * A bare name ("Pictures", "Downloads") is resolved relative to the home
 * directory rather than the process's own working directory — the only
 * reading that matches what "my Pictures folder" could mean. It also tries
 * the OneDrive-redirected location, because Windows quietly moves Documents,
 * Pictures and Desktop under OneDrive whenever Known Folder Move is on — a
 * real, common setup, not a hypothetical one — and the plain top-level
 * folder then simply does not exist at all.
 */
async function resolveFolder(asked) {
  const name = String(asked ?? '').trim()
  if (!name) return resolveSafe(homedir())
  if (isAbsolute(name)) return resolveSafe(name)
  const candidates = [join(homedir(), name), join(homedir(), 'OneDrive', name)]
  for (const candidate of candidates) {
    const real = await resolveSafe(candidate)
    if (real) return real
  }
  return null
}

const LIST_DESCRIPTION = `List what's in a folder on this machine.

Use it to browse — "what's in my Pictures folder", "show me what's in
Downloads" — or to orient yourself before \`find_files\` when you don't know
where to start. Omit \`path\` to list the home directory.

Returns files and folders with their type, size and when each was last
modified, newest first. Folders come back as entries you can list again by
passing their \`path\` back in — this does not recurse into them itself.`

const listSchema = {
  path: z
    .string()
    .optional()
    .catch(undefined)
    .describe(
      'An absolute path, OR just a folder name like "Pictures" or ' +
        '"Downloads" — resolved under the home directory (and its OneDrive ' +
        'folder, if Windows has redirected it there) automatically. Omit for ' +
        'the home directory itself.',
    ),
  type: z
    .enum(['all', 'images', 'videos'])
    .optional()
    .catch(undefined)
    .describe('Filter to just images or videos. Default "all".'),
}

const FIND_DESCRIPTION = `Search this machine for a file by name.

Use it when the user names a file or a kind of file without saying exactly
where it is — "find my resume", "find that vacation video", "is there a
screenshot from yesterday". Searches file NAMES, not file contents.

Searches under the home directory by default; pass \`root\` (from a prior
\`list_files\` call) to search a narrower, known location instead — faster and
more precise once you know roughly where to look.`

const findSchema = {
  query: z.string().describe('Text to match against file names, e.g. "resume" or "vacation".'),
  type: z
    .enum(['all', 'images', 'videos'])
    .optional()
    .catch(undefined)
    .describe('Filter to just images or videos. Default "all".'),
  root: z
    .string()
    .optional()
    .catch(undefined)
    .describe('Absolute path to search under. Omit to search the whole home directory.'),
}

/** Depth and result caps exist for the same reason SKIP_DIRS does: a home
 *  directory can hold hundreds of thousands of files, and neither the user
 *  nor the model wants to wait on a scan of all of them for "find my resume". */
const MAX_FIND_DEPTH = 8
const MAX_FIND_RESULTS = 40
const MAX_FIND_MS = 8000

async function walk(dir, query, typeFilter, results, deadline, depth) {
  if (results.length >= MAX_FIND_RESULTS || Date.now() > deadline || depth > MAX_FIND_DEPTH) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // permission denied, vanished mid-walk — skip rather than fail the whole search
  }
  for (const entry of entries) {
    if (results.length >= MAX_FIND_RESULTS || Date.now() > deadline) return
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(path, query, typeFilter, results, deadline, depth + 1)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().includes(query)) continue
    const ext = extname(entry.name).toLowerCase()
    const kind = kindOf(ext)
    if (!typeFilter(kind)) continue
    try {
      const info = await stat(path)
      results.push({ name: entry.name, path, kind, size: info.size, modified: info.mtime.toISOString() })
    } catch {
      /* vanished between readdir and stat */
    }
  }
}

export function filesServer() {
  return createSdkMcpServer({
    name: 'mediq_files',
    version: '1.0.0',
    instructions:
      'Browse and search the local filesystem with list_files and ' +
      'find_files, read-only, scoped to the home directory and temp folders. ' +
      'A path either of these returns can be opened with `blade` (kind ' +
      '"image" or "video") to actually show it.',
    alwaysLoad: true,
    tools: [
      tool('list_files', LIST_DESCRIPTION, listSchema, async (args) => {
        const asked = String(args.path ?? '').trim() || homedir()
        const real = await resolveFolder(args.path)
        if (!real) {
          return refuse(
            `Not listed: no folder named "${asked}" was found under the home ` +
              'directory or its OneDrive folder, and it is not a path MEDIQ ' +
              'can read either way.',
          )
        }
        let entries
        try {
          entries = await readdir(real, { withFileTypes: true })
        } catch (err) {
          return refuse(`Could not read that folder: ${err?.message ?? err}.`)
        }
        const typeFilter = TYPE_FILTER[args.type ?? 'all']
        const rows = []
        for (const entry of entries) {
          if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
          const path = join(real, entry.name)
          if (entry.isDirectory()) {
            if (args.type && args.type !== 'all') continue // a type filter means files, not folders
            try {
              const info = await stat(path)
              rows.push({ name: entry.name, path, kind: 'folder', modified: info.mtime.toISOString() })
            } catch {
              /* vanished mid-listing */
            }
            continue
          }
          if (!entry.isFile()) continue
          const kind = kindOf(extname(entry.name).toLowerCase())
          if (!typeFilter(kind)) continue
          try {
            const info = await stat(path)
            rows.push({
              name: entry.name,
              path,
              kind,
              size: info.size,
              modified: info.mtime.toISOString(),
            })
          } catch {
            /* vanished mid-listing */
          }
        }
        rows.sort((a, b) => (a.modified < b.modified ? 1 : -1))
        if (!rows.length) return ok(`"${basename(real)}" is empty, or nothing matched.`)
        return ok(JSON.stringify(rows.slice(0, 200), null, 1))
      }),

      tool('find_files', FIND_DESCRIPTION, findSchema, async (args) => {
        const query = String(args.query ?? '').trim().toLowerCase()
        if (!query) return refuse('Not searched: a query is required.')

        let root = homedir()
        if (args.root) {
          const real = await resolveFolder(args.root)
          if (!real) {
            return refuse(
              `Not searched: "${args.root}" does not exist or is outside the ` +
                'folders MEDIQ can read.',
            )
          }
          root = real
        }

        const typeFilter = TYPE_FILTER[args.type ?? 'all']
        const results = []
        await walk(root, query, typeFilter, results, Date.now() + MAX_FIND_MS, 0)

        if (!results.length) return ok(`No files matching "${args.query}" found under ${root}.`)
        results.sort((a, b) => (a.modified < b.modified ? 1 : -1))
        return ok(JSON.stringify(results, null, 1))
      }),
    ],
  })
}
