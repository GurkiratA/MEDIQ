import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { decodeToFloat32 } from './audio.mjs'
import { embed, cosineSimilarity, MODEL_ID } from './speaker-model.mjs'

/**
 * Voice authentication — MEDIQ only acts on speech from an enrolled voice.
 *
 * Runs entirely on this machine via an open speaker-embedding model
 * (speaker-model.mjs) — no account, no API key, nothing sent anywhere. Two
 * halves:
 *
 *   - Enrollment (this file's tools): a person talks for ~20 seconds, an
 *     embedding is computed for each few-second window and averaged into one
 *     profile, saved to disk under a name.
 *   - Verification (verifySpeaker, called from server.mjs's /stt handler,
 *     not from here): every utterance's embedding is compared against every
 *     saved profile BEFORE it ever reaches the model. A voice that doesn't
 *     match anyone enrolled is dropped right there — silently, the same way
 *     the existing /stt handler already drops silence, so MEDIQ simply
 *     never responds to it rather than calling out an unrecognized speaker.
 *
 * The feature is off by default and stays off until someone is enrolled: no
 * profiles on disk means verifySpeaker() waves every utterance through
 * unchanged, so a machine that never sets this up behaves exactly as it did
 * before this file existed.
 *
 * Authorizing a SECOND voice is deliberately not self-service. By the time
 * the model can call enroll_voice at all, the speaker who asked for it has
 * already passed verification (or no profile exists yet, meaning this is the
 * very first enrollment) — an unenrolled person's own speech never reaches
 * the model to ask for themselves. The system prompt is what actually asks
 * "do you want to authorize someone else's voice?" before a second profile
 * is created; that is a conversational courtesy this file doesn't enforce
 * mechanically, because the gate above already makes it safe either way.
 */

const PROFILE_DIR = join(homedir(), '.mediq-voice')

/**
 * The model author's own general-purpose recommendation is 0.5. This runs
 * higher by default on purpose: a false accept (letting the wrong person
 * through) is the failure that matters for a security gate, where a false
 * reject just means asking someone to talk again. Confirmed live that 0.5
 * let a parent and child through as the same profile — related voices are a
 * known hard case (vocal tract shape is partly heritable), so this errs
 * conservative rather than trusting the general-purpose default.
 */
const THRESHOLD = (() => {
  const raw = Number(process.env.VOICE_AUTH_THRESHOLD)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.72
})()

/** Windows this long, back to back, cover a ~20s enrollment clip and match
 *  the model's own fixed input window — no padding wasted mid-enrollment. */
const ENROLL_WINDOW_SAMPLES = 48240
const SAMPLE_RATE = 16000

function slugify(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

async function listProfiles() {
  if (!existsSync(PROFILE_DIR)) return []
  const entries = await readdir(PROFILE_DIR)
  return entries.filter((f) => f.endsWith('.json') && f !== 'model.json').map((f) => f.slice(0, -'.json'.length))
}

/** Returns null for a profile enrolled under a different (or no-longer-
 *  tagged, i.e. pre-tagging) model — its embedding lives in a different
 *  vector space and comparing it to anything now would be meaningless, not
 *  just less accurate. Treated as simply not enrolled until re-enrolled. */
async function loadProfile(slug) {
  const raw = await readFile(join(PROFILE_DIR, `${slug}.json`), 'utf8')
  const { name, embedding, model } = JSON.parse(raw)
  if (model !== MODEL_ID) {
    console.warn(`[mediq] voice profile "${name}" was enrolled with a different model — ignoring until re-enrolled`)
    return null
  }
  return { name, embedding: Float32Array.from(embedding) }
}

async function loadAllProfiles() {
  const slugs = await listProfiles()
  const loaded = await Promise.all(slugs.map(loadProfile))
  return loaded.filter((p) => p !== null)
}

/**
 * Checks one utterance's audio against every enrolled voice.
 *
 * @param {Buffer} audioBuffer Compressed audio exactly as the browser sent it.
 * @returns {Promise<{gated: boolean, authorized: boolean, name: string|null}>}
 *   `gated` is false when no profiles exist at all — the feature isn't set
 *   up, so the caller should treat every speaker as authorized. When gated
 *   is true, `authorized` says whether this utterance matched someone, and
 *   `name` is who (their enrolled display name).
 */
export async function verifySpeaker(audioBuffer) {
  const profiles = await loadAllProfiles()
  if (!profiles.length) return { gated: false, authorized: true, name: null }

  const pcm = await decodeToFloat32(audioBuffer, SAMPLE_RATE)
  const vec = await embed(pcm)

  let best = null
  let bestScore = -1
  for (const p of profiles) {
    const score = cosineSimilarity(vec, p.embedding)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  if (!best || bestScore < THRESHOLD) return { gated: true, authorized: false, name: null }
  return { gated: true, authorized: true, name: best.name }
}

const ENROLL_DESCRIPTION = `Learn someone's voice so MEDIQ will respond to them.

Ask for about 20 seconds of them talking normally — reading a sentence, describing
their day, anything continuous. This works for enrolling yourself for the first
time, and for adding anyone else afterwards.

IMPORTANT: once at least one voice is enrolled, MEDIQ will ONLY respond to
enrolled voices — anyone else's speech is silently ignored before it ever
reaches you. So:
  - The very first enrollment ever (no one enrolled yet) needs no confirmation
    — it's the owner setting this up, do it directly when asked.
  - Enrolling a SECOND or later voice is a real decision — the owner is about
    to let someone else's speech control MEDIQ. Confirm with them first
    ("do you want to give voice access to someone else?") before calling
    this, unless they already made the request explicit and specific
    (named the person and asked to add them).

Returns whether it worked. On the very first call ever, the model itself is
downloaded first (a few seconds) — that's normal, not an error.`

const enrollSchema = {
  name: z.string().min(1).max(40).describe("The person's name, to enroll or add to their voice profile."),
}

const REVOKE_DESCRIPTION = `Remove someone's enrolled voice, so MEDIQ stops responding to them.

Use when the owner asks to revoke, remove, or forget someone's voice access.`

const revokeSchema = {
  name: z.string().min(1).max(40).describe('The enrolled name to remove, exactly as it was enrolled.'),
}

const LIST_DESCRIPTION = `List whose voices are currently enrolled, and whether voice
authentication is even on. Empty means it was never set up — MEDIQ responds to
anyone, same as before this feature existed.`

/**
 * @param {(kind: string, args: object) => Promise<object>} ask
 *   Requests a microphone recording from the browser, base64-encoded —
 *   same request/reply shape as the camera and screen tools.
 */
export function voiceAuthServer(ask) {
  return createSdkMcpServer({
    name: 'mediq_voiceauth',
    version: '1.0.0',
    instructions:
      'Voice enrollment. Empty profile list = feature off, everyone is heard. ' +
      'Once any profile exists, only enrolled voices reach you at all — an ' +
      "unenrolled person's speech never arrives here to ask for themselves, " +
      'so confirming before adding a second person is a courtesy to the ' +
      'owner, not a safety mechanism this file depends on.',
    alwaysLoad: true,
    tools: [
      tool('enroll_voice', ENROLL_DESCRIPTION, enrollSchema, async (args) => {
        const name = String(args.name ?? '').trim()
        const slug = slugify(name)
        if (!slug) return { isError: true, content: [{ type: 'text', text: 'That name has no usable characters.' }] }

        let reply
        try {
          reply = await ask('voice-enroll', { seconds: 20 }, 30_000)
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Could not record: ${err?.message ?? err}. Tell the user and carry on.` }],
          }
        }
        if (reply?.error) return { isError: true, content: [{ type: 'text', text: String(reply.error) }] }
        if (typeof reply?.data !== 'string' || !reply.data) {
          return { isError: true, content: [{ type: 'text', text: 'No audio came back from the microphone.' }] }
        }

        let pcm
        try {
          pcm = await decodeToFloat32(Buffer.from(reply.data, 'base64'), SAMPLE_RATE)
        } catch (err) {
          return { isError: true, content: [{ type: 'text', text: `Could not read the recording: ${err?.message ?? err}` }] }
        }
        if (pcm.length < SAMPLE_RATE) {
          return {
            content: [{ type: 'text', text: `That was too short to enroll "${name}" — ask them to talk for longer and call enroll_voice again.` }],
          }
        }

        // Average an embedding per back-to-back window across the whole
        // clip, rather than just the first few seconds — a longer, more
        // varied sample makes a sturdier profile than one slice of it. A
        // clip shorter than one window still yields one (embed() pads it).
        const embeddings = []
        if (pcm.length <= ENROLL_WINDOW_SAMPLES) {
          embeddings.push(await embed(pcm))
        } else {
          for (let i = 0; i + ENROLL_WINDOW_SAMPLES <= pcm.length; i += ENROLL_WINDOW_SAMPLES) {
            embeddings.push(await embed(pcm.subarray(i, i + ENROLL_WINDOW_SAMPLES)))
          }
        }
        const dim = embeddings[0].length
        const avg = new Float32Array(dim)
        for (const e of embeddings) for (let i = 0; i < dim; i++) avg[i] += e[i]
        let norm = 0
        for (let i = 0; i < dim; i++) {
          avg[i] /= embeddings.length
          norm += avg[i] * avg[i]
        }
        norm = Math.sqrt(norm) || 1
        for (let i = 0; i < dim; i++) avg[i] /= norm

        await mkdir(PROFILE_DIR, { recursive: true })
        await writeFile(
          join(PROFILE_DIR, `${slug}.json`),
          JSON.stringify({ name, model: MODEL_ID, embedding: Array.from(avg) }),
        )
        return { content: [{ type: 'text', text: `"${name}"'s voice is enrolled. MEDIQ will respond to them now.` }] }
      }),

      tool('revoke_voice', REVOKE_DESCRIPTION, revokeSchema, async (args) => {
        const slug = slugify(args.name)
        const path = join(PROFILE_DIR, `${slug}.json`)
        if (!existsSync(path)) {
          return { isError: true, content: [{ type: 'text', text: `No enrolled voice matches "${args.name}".` }] }
        }
        await unlink(path).catch(() => {})
        const remaining = await listProfiles()
        return {
          content: [
            {
              type: 'text',
              text:
                `Removed "${args.name}"'s voice.` +
                (remaining.length ? '' : ' No one is enrolled now, so voice authentication is effectively off — everyone will be heard again.'),
            },
          ],
        }
      }),

      tool('list_voice_profiles', LIST_DESCRIPTION, {}, async () => {
        const profiles = await loadAllProfiles()
        if (!profiles.length) {
          return { content: [{ type: 'text', text: 'No voices enrolled — voice authentication is off, MEDIQ responds to anyone.' }] }
        }
        return {
          content: [
            { type: 'text', text: `Enrolled: ${profiles.map((p) => p.name).join(', ')}. MEDIQ only responds to these voices.` },
          ],
        }
      }),
    ],
  })
}
