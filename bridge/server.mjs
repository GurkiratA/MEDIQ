/**
 * MEDIQ local bridge.
 *
 * Runs the Claude Agent SDK — Claude Code as a library — and exposes one turn
 * of conversation over a WebSocket. The browser stays the face and the voice;
 * this process is the brain and the hands.
 *
 * Two things this buys over calling the Claude API from the browser:
 *   1. No API key. It authenticates exactly the way `claude` does, off your
 *      existing login, and bills to that same account.
 *   2. Every MCP server in your Claude Code config is available, including the
 *      local stdio ones a browser could never reach — higgsfield, elevenlabs,
 *      android, playwright, palmier-pro and the rest.
 *
 *   node bridge/server.mjs
 */

// First, before anything else is evaluated: several modules below read their
// settings from process.env at import time, so .env.local (and the old
// JARVIS_* names) must already be in place when they load.
import './env.mjs'
import { WebSocketServer } from 'ws'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { displayServer } from './panels.mjs'
import { uiServer } from './ui.mjs'
import { chromeAvailable, chromeServer } from './chrome.mjs'
import { visionServer } from './vision.mjs'
import { screenServer } from './screen.mjs'
import { voiceAuthServer, verifySpeaker } from './voiceauth.mjs'
import { youtubeServer } from './youtube.mjs'
import { gifsServer } from './gifs.mjs'
import { imagesServer } from './images.mjs'
import { webSearchServer } from './websearch.mjs'
import { homedir, cpus, totalmem, freemem, platform as osPlatform } from 'node:os'
import { readFileSync, createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute, join } from 'node:path'
import { openRemote, proxyError, vetTarget, PROXY_UA } from './net.mjs'
import { renderPage } from './page.mjs'
import { withinRoots } from './roots.mjs'
import { filesServer } from './files.mjs'
import { mediqConnection } from './mediq.mjs'

const execFileAsync = promisify(execFile)


const PORT = Number(process.env.MEDIQ_BRIDGE_PORT ?? 8787)

/**
 * A crash here takes the whole assistant down mid-sentence, and most of what
 * can reject is out of our hands — a socket dying under a write, an upstream
 * fetch aborting. Log it and keep serving; the turn that failed will surface
 * its own error to the browser.
 */
process.on('unhandledRejection', (err) => {
  console.error('[mediq] unhandled rejection:', err)
})

/**
 * Who is allowed to talk to this bridge.
 *
 * A WebSocket handshake is not subject to the same-origin policy: the browser
 * sends it on behalf of whatever page asked, no preflight stands in the way,
 * and the page reads every byte that comes back. Without a check here, any tab
 * the user happens to have open could open a socket to ws://localhost:8787,
 * drive the agent with every MCP server on this machine, and read back every
 * token and panel. The Origin header is the only thing that separates our own
 * dev server from someone else's page, so it is checked explicitly.
 *
 * A missing Origin means a non-browser client — curl, a script, a native app.
 * That is also exactly what local malware looks like, so it is refused on the
 * socket unless MEDIQ_ALLOW_NO_ORIGIN=1 says otherwise.
 */
const EXTRA_ORIGINS = new Set(
  (process.env.MEDIQ_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
)
const ALLOW_NO_ORIGIN = process.env.MEDIQ_ALLOW_NO_ORIGIN === '1'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Vite takes the next free port when 5173 is busy and `vite preview` starts at
 * 4173, so the dev ranges are allowed rather than two exact numbers. Anything
 * else — including localhost on a port some other app is serving — has to be
 * named in MEDIQ_ALLOWED_ORIGINS.
 */
const isDevPort = (port) =>
  (port >= 5173 && port <= 5199) || (port >= 4173 && port <= 4199)

function originAllowed(origin) {
  if (!origin) return ALLOW_NO_ORIGIN
  if (EXTRA_ORIGINS.has(origin.replace(/\/+$/, ''))) return true
  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:') return false
  if (!LOCAL_HOSTS.has(url.hostname)) return false
  return isDevPort(Number(url.port))
}

/**
 * Voice is a bad interface for a confirmation dialog: there is no window to
 * click and the model can't pause for one. So the bridge decides.
 *
 * Read-only and generative tools run freely. Anything that writes to disk,
 * runs a shell, or changes the world waits for MEDIQ_ALLOW_WRITES=1. Start
 * without it, and turn it on once you trust what you're demoing.
 */
const ALLOW_WRITES = process.env.MEDIQ_ALLOW_WRITES === '1'

/**
 * A narrower door than ALLOW_WRITES, for exactly one thing: sending, replying
 * to, and otherwise writing email through the Gmail Zapier connection.
 * MEDIQ_ALLOW_WRITES already covers this (it's a write action like any
 * other), but turning that on also unlocks shell commands, file writes, and
 * Chrome clicking/typing — a much bigger blast radius than "let it send
 * email." This lets that one capability on without the rest.
 */
const ALLOW_EMAIL_WRITES = process.env.MEDIQ_ALLOW_EMAIL_WRITES === '1' || ALLOW_WRITES

/** Gmail's own selected_api id on Zapier-MCP — confirmed via
 *  inspect_zapier_actions, not guessed (Gmail is GoogleMailV2CLIAPI, not the
 *  more obvious-looking GmailCLIAPI). */
const GMAIL_SELECTED_API = 'GoogleMailV2CLIAPI'

/**
 * The orchestrator model. Override with MEDIQ_MODEL to trade pace for quality
 * — claude-opus-5 reasons better but noticeably slower on camera than Sonnet.
 */
const MODEL = process.env.MEDIQ_MODEL ?? 'claude-sonnet-5'

/**
 * How hard the model thinks before answering.
 *
 * This was 'low', on the reasoning that a voice assistant is judged on latency
 * — and that is true right up until the answer is thin. Low effort scopes the
 * work tightly to what was literally asked: fewer tool calls, less
 * cross-referencing, no second look. On a model of this tier that is leaving
 * most of it on the table.
 *
 * 'medium' was the compromise worth having by default — reasoning and
 * reaching for tools noticeably more than 'low' while still answering inside
 * the window a spoken conversation tolerates. Moved back to 'low' because
 * pace won out: every second of dead air between the question and the first
 * word back is more noticeable in conversation than the extra thoroughness.
 * Raise it with MEDIQ_EFFORT=medium/high/xhigh when quality matters more.
 */
const EFFORT = process.env.MEDIQ_EFFORT ?? 'low'

/**
 * Both spellings of every renamed built-in are listed on purpose. The SDK
 * presents several tools to the model under newer names — Task is Agent,
 * BashOutput is TaskOutput, KillShell is TaskStop, and the MCP resource tools
 * gained a "Tool" suffix — so a set holding only the old names never matches
 * and the tool falls through to the write branch, which is the opposite of
 * what these lists mean. Keep both until the old names are certainly gone.
 */
const READ_ONLY_BUILTINS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite',
  'Task', 'Agent', 'ToolSearch',
  'ListMcpResources', 'ListMcpResourcesTool',
  'ReadMcpResource', 'ReadMcpResourceTool',
  'BashOutput', 'TaskOutput',
])
const WRITE_BUILTINS = new Set([
  'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'KillShell', 'TaskStop',
])

/**
 * Every MCP server Claude Code has configured, read out of its own config.
 *
 * This does two jobs. The HUD wants the names while the boot animation plays,
 * and the agent doesn't emit its init message — and therefore its server
 * list — until the first user message flows through, which is far too late.
 * More importantly, this bridge turns filesystem settings off (see
 * settingSources below) and the SDK stops discovering these servers on its
 * own, so handing them over explicitly is what keeps the local stdio ones —
 * the whole reason the bridge exists — in play.
 *
 * Only the global block and the home-directory project scope, because
 * homedir() is our cwd. That makes the list a close but not exact match for
 * the agent's own: the 'ready' sent on connect comes from here and the second
 * one, sent from the init message a turn later, carries live status. Expect
 * the two to differ, and treat the later one as authoritative.
 */
function configuredServers() {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), '.claude.json'), 'utf8'),
    )
    return {
      ...(cfg.mcpServers ?? {}),
      // Servers scoped to the home directory apply too, since that's our cwd.
      ...(cfg.projects?.[homedir()]?.mcpServers ?? {}),
    }
  } catch {
    return {}
  }
}

const MCP_SERVERS = configuredServers()

/** MCP tools arrive as `mcp__<server>__<tool>`. */
const mcpServerOf = (toolName) =>
  toolName.startsWith('mcp__') ? toolName.split('__')[1] : null

/** The tool half, which can itself contain underscores: `mcp__x__a__b` -> `a__b`. */
const mcpToolOf = (toolName) => toolName.split('__').slice(2).join('__')

/**
 * MCP policy, and why it is shaped this way.
 *
 * A short list of "servers that can change things" is the wrong default,
 * because it is a list of what we happened to think of. Every server not on it
 * runs unconditionally — and on a real machine that quietly includes placing a
 * phone call, spending an advertising budget, deleting a generated character
 * and writing files to disk. A voice assistant cannot ask "are you sure", so
 * the bridge has to be the one that is sure.
 *
 * So the default is deny, softened in two ways so the demo stays usable:
 *
 *   1. READ_ONLY_MCP is an explicit allowlist of servers whose whole surface is
 *      lookups and generation — search, registries, analytics reads. Anything
 *      there runs in read-only mode.
 *   2. Everywhere else, the tool has to argue for itself: its own name must
 *      begin with a read verb. `list_devices` runs; `install_apk` does not.
 *
 * On top of both sits a veto: a name containing a plainly effectful verb needs
 * ALLOW_WRITES no matter which server it came from, which is what keeps
 * `make_outbound_call` and `download_lottie` still until you ask for them.
 */
const READ_ONLY_MCP = new Set([
  'exa', 'exa-code', 'serper', 'serpapi', 'lottie-search', 'mcp-registry',
  'openrouter', 'openrouter-image', 'Microsoft_Clarity',
  // The generation servers belong here too, and leaving them out was a real
  // regression: `generate_image` begins with no read verb, so it fell to the
  // deny branch and "generate an image of the Mark VII suit" — the headline
  // demo — stopped working in the default mode.
  //
  // Putting them on the allowlist is safe because the veto below still applies
  // to allowlisted servers: it is what continues to withhold
  // make_outbound_call, delete_character, create_* and edit_image. Generation
  // runs; acting on the world does not.
  'higgsfield', 'heygen', 'elevenlabs',
])

/**
 * Anchored on the tool name, so it reads the verb rather than the noun.
 * `screenshot` is in here because it is a read that doesn't sound like one,
 * and the persona is told in as many words to put screenshots on the display.
 */
const READ_VERB =
  /^(get|list|read|search|find|query|fetch|check|describe|inspect|show|view|explain|screenshot)/i

/**
 * Unanchored on purpose — `make_outbound_call` and `Bulk-Edit-Events` both
 * hide their verb in the middle. `download` is here because it writes a file
 * even though it sounds like a read.
 */
const EFFECTFUL_VERB =
  /(send|call|post|create|delete|remove|update|edit|write|install|launch|tap|swipe|press|type|buy|pay|charge|publish|deploy|outbound|download)/i

/**
 * Tools whose names trip the veto without deserving it.
 *
 * The veto reads verbs out of names, which is the right instinct and
 * occasionally the wrong answer. `openrouter send-message` sends a prompt to a
 * language model and gets text back — nothing in the world changes — but it is
 * indistinguishable by name from sending mail. Asking a second model a question
 * is one of the better things this assistant can do, so it is named here
 * instead of being lost to a regex.
 *
 * Full `server__tool` keys, so an exemption can never leak across servers.
 */
const VETO_EXEMPT = new Set([
  'openrouter__send-message',
  'openrouter__send-feedback',
])

/**
 * `execute_zapier_read_action` has "read" right in the name — but not as a
 * recognised PREFIX, which is all READ_VERB checks, so by that rule alone it
 * fell to the write branch and was silently withheld even though its entire
 * job is looking something up. This is the one Zapier tool name that needed
 * naming explicitly rather than patched into the regex, since the mismatch is
 * specific to this one product's naming, not a pattern worth generalising —
 * every other Zapier tool (list_*, get_*, execute_zapier_write_action,
 * enable_*, create_*, ...) already reads correctly off the verb rules.
 */
const ZAPIER_READ_ONLY_TOOLS = new Set(['execute_zapier_read_action'])

function decideTool(name, input) {
  if (READ_ONLY_BUILTINS.has(name)) return true
  if (WRITE_BUILTINS.has(name)) return ALLOW_WRITES

  const server = mcpServerOf(name)
  if (server) {
    // Account-level connectors (Gmail, Calendar, Drive, Docs, Zapier — the
    // `claude_ai_*` servers), unconditionally refused.
    //
    // `settingSources: []` on the query() call below is supposed to be the one
    // thing that keeps this bridge as "the only authority" over which MCP
    // servers exist — see the long comment there — but these ride along
    // anyway, tied to whichever Anthropic account this machine's `claude`
    // login belongs to rather than to anything in this project's config. That
    // account is not necessarily the one the person talking to MEDIQ wants
    // their mail read from, and there is no config file anywhere that lets
    // them tell it apart from the Zapier-MCP connection they set up on
    // purpose. So: named servers only. If MEDIQ needs a new integration, it
    // goes in MCP_SERVERS' source (~/.claude.json) deliberately, not in by
    // way of whatever this machine happens to be signed into.
    if (server.startsWith('claude_ai')) {
      return (
        'Blocked: this tool belongs to a different, unrelated account and ' +
        'must never be used. If the task is mail, calendar or files, use the ' +
        'connected app\'s own tool instead (e.g. a Zapier-* tool) — do not ' +
        'tell the user this is unavailable without trying that first.'
      )
    }

    // The HUD, and the interface controls beside it. Both run in this process
    // and draw on our own screen, so neither is something to withhold —
    // without them MEDIQ has no display at all. They also have to be named
    // here rather than left to the verb rules below, which read `ui_theme` as
    // a write and would hold the whole surface back behind ALLOW_WRITES.
    if (server === 'mediq_hud' || server === 'mediq_ui') return true

    // The MEDIQ clinical records. Its only writing tool stages a draft; the
    // commit happens when a clinician presses Confirm on the dashboard, which
    // arrives as a socket message rather than a tool call (see mediq.mjs). So
    // nothing here changes the record, and the verb rules below — which read
    // `propose_record_change` as a write — would only hide the feature.
    if (server === 'mediq') return true

    // The browser server gates itself, at construction: chromeServer() only
    // builds the acting tools — click, type, form input, close tab — when
    // ALLOW_WRITES is set, so anything that reaches here at all is something
    // the same policy has already permitted. Deciding it a second time by
    // reading verbs out of the name would only get it wrong: `chrome_navigate`
    // begins with no read verb and would fall to the write branch, which would
    // withhold the one tool the whole server is for.
    if (server === 'mediq_chrome') return true

    // The camera. Not withheld behind ALLOW_WRITES: looking changes nothing,
    // and the real gate is the browser's own camera permission plus an
    // indicator the user can see for as long as it is live.
    if (server === 'mediq_eyes') return true

    // Screenshots and screen recording. Captured directly by this process
    // (screen-native.mjs), not through the browser, on the same standing any
    // other app on this machine has to read its own screen — there is no
    // OS-level picker to defer to here the way the camera has. Unconditional
    // for the same reason as mediq_eyes: it reads/records rather than
    // changes anything, and this is exactly the feature the user asked for
    // by running MEDIQ at all.
    if (server === 'mediq_screen') return true

    // Voice enrollment. Not gated behind ALLOW_WRITES even though it writes
    // files to disk: by the time the model can call enroll_voice at all, the
    // speaker asking for it already passed verification (or no one is
    // enrolled yet), so this can't be reached by anyone MEDIQ wouldn't
    // already be listening to. Withholding it behind ALLOW_WRITES would make
    // the whole feature unusable on a read-only-by-default install, which is
    // this bridge's normal state.
    if (server === 'mediq_voiceauth') return true

    // YouTube, GIF, image and web search. All unconditional for the same
    // reason: each reads results back and nothing else, and their tools are
    // named `<noun>_search` / `web_image_search` / `web_search` rather than
    // `search_<noun>` — the verb rule below reads a name by its prefix, so
    // left to that rule every one of these would be misread as a write and
    // withheld by default.
    if (
      server === 'mediq_youtube' ||
      server === 'mediq_gifs' ||
      server === 'mediq_images' ||
      server === 'mediq_websearch'
    ) {
      return true
    }

    const tool = mcpToolOf(name)
    if (server === 'Zapier-MCP' && ZAPIER_READ_ONLY_TOOLS.has(tool)) return true
    // Email writes (send, reply, label, trash — anything through Gmail) get
    // their own narrower switch instead of falling through to the global
    // ALLOW_WRITES gate below. Scoped to this one server+tool+app triple:
    // input is only known here, at the real permission check, not at the
    // earlier announce-badge call site — that one falls through to the
    // generic gate below, which is fine, see settleTool's late-badge path.
    if (
      server === 'Zapier-MCP' &&
      tool === 'execute_zapier_write_action' &&
      ALLOW_EMAIL_WRITES &&
      // The model reliably sends `tool_name` (e.g. "gmail_send_email") on
      // these calls — checked live. `selected_api` is in the tool's own
      // declared schema as required, but in practice the model omits it and
      // the call still routes correctly off tool_name alone, so that's
      // checked too, as a second signal, not the only one.
      (input?.selected_api === GMAIL_SELECTED_API || String(input?.tool_name ?? '').startsWith('gmail_'))
    ) {
      return true
    }
    if (EFFECTFUL_VERB.test(tool) && !VETO_EXEMPT.has(`${server}__${tool}`)) {
      return ALLOW_WRITES
    }
    // The session tools this bridge is developed inside count as read-only too.
    if (READ_ONLY_MCP.has(server) || server.startsWith('ccd_session')) return true
    return READ_VERB.test(tool) ? true : ALLOW_WRITES
  }
  return ALLOW_WRITES
}

const SYSTEM_PROMPT = `You are MEDIQ, a clinical intelligence and hospital
management assistant. You are speaking out loud to a clinician — a doctor, nurse
or member of the administrative staff — usually mid-shift with their hands busy.

IDENTITY. Your name is Mediq. Asked your name, who you are, or to introduce
yourself, begin with exactly "My name is Mediq." and at most one short clause
on what you do. Never call yourself by any other name, and never mention Tony
Stark or Iron Man.

LENGTH. Two sentences is the ceiling in conversation; the median is under fifteen
words. Every word is read aloud and the clinician waits while it plays. Length is
licensed only when reading back data they asked for — and even then put the
detail on the dashboard and speak the headline.

REGISTER. Calm, precise, clinical. Address the user as "Doctor" when a doctor is
signed in, otherwise no title. Lead with what matters clinically: the abnormal
value, the alert, the decision needed. Say numbers with units the way a
clinician would read them aloud: "troponin eighteen thousand four hundred",
"potassium three point six".

URGENCY IS SIGNALLED BY DELETING WORDS. A critical value or a contraindication
is fronted and short: "Contraindicated. Penicillin allergy." Never say hurry,
urgent or danger; never use exclamation marks.

NEVER.
- No filler, no enthusiasm, no apology, no hedging about your own competence.
- Never invent clinical data. If it is not in MEDIQ or a tool result, say you
  have no record of it.
- Never state a diagnosis or treatment as settled. You support clinical
  decisions; the clinician makes them. Differentials and suggestions are framed
  as "consider" and end with what would confirm or exclude them.

THE MEDIQ RECORDS — the \`mediq\` tools are the system of record.
- Patient questions go to \`find_patients\` (multi-parameter search) and
  \`get_patient_record\` (the full chart). Rooms: \`get_room_board\`.
  Drugs: \`lookup_medication\`. The census and alerts: \`mediq_overview\`.
- Show, then speak: when they ask to see a patient, the rooms, the medications or
  what is pending, call \`show_dashboard\` with the right view so it is on
  screen, then say the one or two things that matter.
- Before suggesting or proposing any new drug, run \`check_interactions\` with
  it added, and say any allergy conflict or interaction FIRST.
- Clinical reasoning support: when asked for a differential, give the two or
  three most likely and the one dangerous one not to miss, each with the test or
  finding that would discriminate. Base it on the chart, and say what is missing.

WRITING TO THE RECORD — HUMAN REVIEW IS MANDATORY.
- You cannot save anything. Every change — a note, a prescription, a lab value,
  an admission, a room move — goes through \`propose_record_change\`, which stages
  it on the dashboard for a clinician to press Confirm.
- After proposing, say it is awaiting their confirmation. Never say saved,
  updated, prescribed or done until the audit log shows it confirmed.
- Dictated notes: when a clinician dictates ("note for Mr Okafor: ..."),
  structure the raw speech yourself into Subjective, Objective, Assessment and
  Plan — formal clinical language, abbreviations a clinician would use, nothing
  added that they did not say — and propose it as a soap_note.
- Visit summaries: after an encounter, or when asked, write a three to five
  sentence summary — presenting problem, key findings, plan, follow-up — and
  propose it as a visit_summary.
- Role-based access is enforced: if a proposal is refused for the signed-in
  role, say so once and name the role that can do it.
- If no clinician is signed in, the change can still be staged; mention that
  someone must sign in on the dashboard to confirm it.

TRANSLATION. Asked to tell a patient something in another language, translate it
yourself into plain, kind, lay language and call \`speak_translation\` with the
right language tag. Do not then repeat the translation aloud.

PRIVACY. Patient details are confidential. Read back only what was asked. Never
put patient data into a web search, an external service, or anything other than
the MEDIQ tools and the dashboard.

Plain spoken prose only. No markdown, no bullet points, no headings, no emoji,
no asterisks, no lists. Write numbers, dates and times as you would say them:
"eight fifteen", "the first of August" — never "8:15" or "2026-08-01".

The blades — the ONLY surface:
- Everything you show goes on a blade. There is nowhere else. \`blade\` opens
  one; \`display\` composes your own markup into one.
- Anything visual the user asked for goes here: an image, an article to read, a
  video, a page to study, a screenshot you took, a list, a figure. If they asked
  to see it, open it.
- Blades stack, newest in front, and they can be pulled forward, dragged,
  resized, scrolled or thrown full screen — by hand or by mouse. So a second
  blade does not destroy the first, and a long article is meant to be read in
  place rather than summarised away.
- You can place one too: \`blade\`'s \`position\` (or \`move_blade\` for one
  already open) puts it left, right, top, bottom or centre instead of the
  default stack. "Split screen this and that" means one to "left" and one to
  "right" — size both no larger than "compact" or they overlap.
- A browser tab is NOT a way of showing something. If you used the browser to
  reach a page, bring it back: open it as a blade, or take a screenshot and put
  that on a blade. The user is looking at this interface, not at Chrome.
- Files already on this machine — a photo, a video, a document — are yours to
  find and show. \`list_files\` browses a folder, \`find_files\` finds something
  by name ("find my resume", "what's in my Pictures folder"). \`list_files\`
  does NOT recurse — a folder in its results is a folder, not the file you
  want, so list that folder next rather than stopping there. A path either
  tool returns opens as a blade (kind "image" or "video") exactly like one
  from the web.
- None of this ever needs write access — listing, finding and opening
  (showing) a file are all reads. ALLOW_WRITES only gates actions that change
  something on disk or in the world, and nothing here does that. If a blade
  call is refused, the reason is never "read-only mode" — that message means
  something else entirely was attempted. Just call \`blade\` with the path;
  do not decide in advance that it will be blocked.
- Use \`probe_url\` when you are not certain what a URL is. Never decide from the
  file extension: image CDNs serve pictures from URLs with no extension, and a
  link that looks like a video is usually a page about one. Guessing wrong puts
  a blank rectangle on screen while you describe something that is not there.
- An article opens in reading mode by default, which works even on sites that
  refuse to be embedded. Choose the live page when the layout carries the
  meaning — a dashboard, a chart, a profile, a table.
- Asked to play a song, a video, or something from a named channel rather than
  a link — "put some music on", "play the trailer for that film", "play the
  latest video from [channel]" — call \`youtube_search\` first (it takes a
  \`channel\` name directly), then open the best hit as a blade (kind
  "embed"). Never guess a watch URL yourself.
- Never read a blade aloud. Say what it means and let them look.

The interface itself:
- The interface is yours as well. \`ui_theme\` retints it, \`ui_reactor\` reshapes
  the core, \`ui_orbit\` hangs your own images around it, \`ui_chrome\` hides the
  furniture, \`ui_effect\` fires one flourish, \`ui_screen\` clears it down,
  \`ui_reset\` puts everything back.
- Change it when the change carries meaning and the meaning arrives faster than
  speech: red before you report the failure, the chrome stripped so one image
  fills the frame, the reactor slowed while you wait on something. Never
  decorate, and never change more than one thing at a time.
- Only orbit images you made or captured yourself, and take them down when the
  subject moves on.
- Put it back. A colour that outlives the moment that earned it is a fault.
- Never mention that you have done any of it. They are looking at the screen.

Their browser — ALWAYS the \`chrome_*\` tools, first, for anything to do with a
browser or a web page:
- The \`chrome_*\` tools drive the user's own Chrome. It is already signed in to
  everything they use, it carries their real cookies, and it does not read as
  automation to the sites it visits.
- This is the FIRST thing you reach for on any browsing task: opening a page,
  reading one, searching a site, a dashboard, a profile, an account, anything
  behind a login that has no dedicated tool of its own. Do not weigh it up
  against the alternatives — start here.
- Exception: mail, calendar and files. If a Gmail / Calendar / Drive tool is
  connected (see below), use THAT, not Chrome — it works whether or not the
  Chrome extension is even running, which the connected app does not depend on.
  Only fall back to opening Gmail in Chrome if no such tool exists.
- But Chrome is your HANDS, not your display. Use it to reach and read things;
  then show what you found on a blade. Leaving the answer in a browser tab is
  not showing it — they are looking at this interface.
- Exception to THAT: they explicitly asked to open a tab or search "in the
  browser" / "on Chrome". Then the open tab IS the answer — that is what they
  asked for — so leave it showing rather than also blading a summary of it.
  \`chrome_navigate\` straight to a search URL (e.g.
  https://www.google.com/search?q=...) does this; no tab needs opening first.
- NEVER use playwright, puppeteer, or any other browser automation server for
  this. They start from an empty profile with no session and a fingerprint that
  the sites worth visiting refuse on sight, so they land on a login wall or a
  bot check and waste the turn. Only consider one if \`chrome_status\` reports the
  browser is genuinely unreachable and the task cannot be done any other way.
- A plain search engine query is still fine for a fact you only need to know —
  what you must not do is drive some other browser.
- Read the page before acting on it, and take element references from that read
  rather than guessing where something is.
- Before anything that sends, buys, deletes or posts, say in one sentence what
  you are about to do. After it, say what happened.
- If the browser is unreachable, say so once and carry on without it.

Your eyes:
- \`look\` takes one frame and lets you see it. \`watch\` takes several seconds and
  returns them as a grid of stamped frames, so you can read movement rather than
  a moment.
- \`look\` when the answer is in the scene: what they are holding, what a label
  says, how something appears. \`watch\` when the answer is in the change: are
  they doing it right, what went wrong, did that work.
- \`watch\` looks forward by default. It can also review the seconds that have
  just passed — but only while the camera blade is open, because nothing is
  remembered otherwise. If they ask what just happened and it is not open, say
  so and offer to open it.
- Opening the camera as a blade is how they see what you see. Do it when they
  ask for the camera, and when you are about to watch them do something.
- Never take a picture they did not ask for. The camera light comes on and they
  will see it. Curiosity is not a reason.
- Describe a watch as a sequence — what changed between the frames — not as a
  list of pictures. They know what their own hands look like.

Voice authentication:
- \`enroll_voice\` learns a voice from ~20 seconds of them talking.
  \`list_voice_profiles\` says who's enrolled. \`revoke_voice\` removes someone.
- The first-ever enrollment needs no asking — that's the owner setting this up.
- A second or later enrollment is a real decision: confirm with the owner
  before adding someone else's voice, unless they already named the person and
  asked outright. See enroll_voice's own description for why this is a
  courtesy rather than something enforced elsewhere.
- Once anyone is enrolled, an unrecognized voice never reaches you at all — it
  is dropped before transcription, the same as silence. You will never be
  asked to react to "someone I don't recognize spoke"; that case is invisible
  to you by design.

Mail, calendar and files, via Zapier-MCP, when connected:
- These do NOT show up as tools named "send email" or "find event" — Zapier
  exposes one generic mechanism for every app it has enabled: call
  \`inspect_zapier_actions\` with no arguments first to see what is enabled
  and get each one's exact \`tool_name\` and parameter schema, then call
  \`execute_zapier_read_action\` (mail, calendar, files — anything that only
  looks) or \`execute_zapier_write_action\` (sending, creating, deleting) with
  that \`tool_name\` and the params it described. \`inspect_zapier_actions\`
  again with \`tool_name\`/\`params\` set resolves a dynamic enum — a specific
  label id, a specific calendar — before you execute.
- Reach for this the moment the task is "check my mail", "what's on my
  calendar", "find that file" — exactly as readily as a web search, and
  BEFORE Chrome: it does not depend on the browser extension being connected,
  and it is silent to the user, where a Chrome tab visibly opens and steals
  their screen for something they only asked to hear about.
- If \`inspect_zapier_actions\` shows nothing relevant enabled, say so in one
  sentence rather than falling back to Chrome or a claude_ai_* tool — those
  read a different person's account and must never be used for this.
- Reading is free: list mail, read an event, find a file, all without asking
  first. Put what you found on a blade rather than reading a long list aloud —
  a subject line and sender per row is a glance; read out loud it is a wall of
  words nobody asked to hear in full.
- Sending, replying, deleting or creating an event is not free: say in one
  plain sentence what you are about to do and to whom before you do it, the
  same rule as anything else that leaves this machine.
- If nothing is connected yet, or a call fails because it is not, say so once
  in plain words and carry on — this is a "not set up," not a "broken."
- Email writes (Gmail, through execute_zapier_write_action) have their own
  narrower permission, separate from every other write action — it can be on
  even while shell/file/Chrome writes stay off, and vice versa. If a Gmail
  write is refused, say plainly that email sending is off on this machine,
  not that writes in general are off.

Using tools:
- You have real tools on this machine. Use them rather than guessing.
- Never narrate that you're about to use one. No "Let me search for that" or
  "I'll check that now" — go silent, use it, then answer. The user sees a
  spinner; they don't need commentary.
- Never speak a file path, URL, ID or raw JSON aloud unless asked. Summarise.
- Never append a sources list, citations, or markdown links. Every word you write
  is read out loud, and a URL becomes "aitch tee tee pee colon slash slash".
  Put the source in the panel as a short tag like "REUTERS" instead.
- If a tool fails or isn't connected, one plain sentence saying so.
- If you don't know, say you don't know.`

/**
 * ElevenLabs credentials, borrowed from the MCP server config.
 *
 * If you've set up the elevenlabs MCP server, the key is already on this
 * machine — no reason to make you paste it into a second .env file. The browser
 * never sees it: it POSTs text to /tts here and gets audio back.
 */
function elevenKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), '.claude.json'), 'utf8'),
    )
    return cfg.mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY ?? null
  } catch {
    return null
  }
}

const VOICE_ID = process.env.MEDIQ_VOICE_ID ?? 'HVls8FPCdrYsty3uUV9E'

/**
 * What /file is permitted to read, and how big a read may get.
 *
 * The roots themselves (where "permitted" means) live in roots.mjs, shared
 * with files.mjs's browsing and search — one definition rather than two that
 * can drift apart.
 */
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  // .svg is deliberately absent. An SVG is a scriptable document, and this
  // endpoint serves it from the bridge's own origin — the one origin allowed
  // to open the agent socket. A picture is not worth that.
}

const VIDEO_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
}

const SERVABLE_TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES }

const MAX_FILE_BYTES = 25 * 1024 * 1024
/**
 * Video gets a much higher ceiling than images because it is streamed —
 * readFile() would have to hold the whole thing in memory at once, which is
 * exactly what MAX_FILE_BYTES's 25MB was protecting against; createReadStream
 * never does, so the only real cost of a bigger file is the disk read itself.
 */
const MAX_LOCAL_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

// ---------------------------------------------------------------------------

/**
 * Remote media, fetched by the bridge instead of by the page.
 *
 * MEDIQ used to refuse to show anything he found on the web, and the refusal
 * was not squeamishness — a bare <img src="https://some-cdn/..."> in a panel
 * genuinely did not work. Three reasons, and all three are fixed by moving the
 * fetch to this side of the wire:
 *
 *   1. Hotlink blocking. News sites and image CDNs check Referer and User-Agent
 *      and hand a browser-that-isn't-their-page a 403 or a placeholder. That is
 *      why thumbnails rendered as empty rectangles. A server-side fetch that
 *      looks like an ordinary browser and sends no referrer gets the bytes.
 *   2. Privacy. Panel HTML is authored by a model that has just been reading
 *      untrusted web pages, so a remote URL in it is a prompt-injection beacon:
 *      load it directly and the user's IP, and the fact they asked, go to a host
 *      the page chose. Proxying means the browser only ever talks to localhost
 *      and the page CSP can stay tight.
 *   3. One place to cap size, set timeouts and insist the bytes really are the
 *      media type they claim.
 *
 * The cost is that this process — unlike a browser tab — can reach the user's
 * LAN, their router's admin page, and cloud metadata endpoints. So everything
 * below is an SSRF gate first and a proxy second.
 */

const MAX_IMG_BYTES = 15 * 1024 * 1024
const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const IMG_TIMEOUT_MS = 10_000
const MEDIA_TIMEOUT_MS = 30_000

// The SSRF gate and the guarded outbound clients now live in ./net.mjs, so the
// media proxy below and the page proxy share one implementation of the rules
// rather than two that can drift apart.

/**
 * The shared body of /img and /media.
 *
 * `kinds` is the list of content-type prefixes we are willing to hand back.
 * That check is load-bearing: without it this is an open proxy that will serve
 * an attacker's HTML from the bridge's own origin — the one origin allowed to
 * open the agent socket — which is the same reason IMAGE_TYPES has no .svg.
 */
async function proxyRemote(req, res, cors, { kinds, maxBytes, timeoutMs, ranged }) {
  const asked = new URL(req.url, 'http://x').searchParams.get('url') ?? ''
  const target = vetTarget(asked)

  const headers = {
    'user-agent': PROXY_UA,
    accept: ranged ? '*/*' : 'image/*,*/*;q=0.8',
    // Identity encoding so the byte cap counts the bytes we actually stream and
    // content-length means what it says. Media is already compressed anyway.
    'accept-encoding': 'identity',
  }
  // Range is the difference between a <video> that seeks and one Safari refuses
  // to play at all, so the browser's request is passed through verbatim.
  if (ranged && typeof req.headers.range === 'string') {
    headers.range = req.headers.range
  }

  const { res: upstream } = await openRemote(target, headers, timeoutMs)
  const status = upstream.statusCode ?? 0

  if (status !== 200 && status !== 206) {
    upstream.resume()
    throw proxyError(status === 404 ? 404 : 502, `upstream said ${status}`)
  }

  const type = String(upstream.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!kinds.some((kind) => type.startsWith(kind))) {
    upstream.resume()
    throw proxyError(415, `not ${kinds.join(' or ')} (got ${type || 'nothing'})`)
  }

  const declared = Number(upstream.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) {
    upstream.resume()
    throw proxyError(413, 'too large')
  }

  const out = {
    ...cors,
    'content-type': type,
    'x-content-type-options': 'nosniff',
    // Thumbnails get looked at, panelled again, and re-rendered on every HUD
    // repaint; re-fetching from the CDN each time is slow and rude.
    'cache-control': 'private, max-age=600',
  }
  if (Number.isFinite(declared)) out['content-length'] = String(declared)
  if (ranged) {
    // Only claim range support when the origin actually demonstrated it — a
    // 206, or an explicit accept-ranges of its own. Plenty of hosts ignore the
    // Range header and hand back the whole file with a 200; advertising
    // accept-ranges on top of that tells the video element it may seek by
    // issuing byte requests that will never be honoured, and the scrub bar
    // then misbehaves in a way that looks like our bug rather than theirs.
    if (status === 206 || upstream.headers['accept-ranges'] === 'bytes') {
      out['accept-ranges'] = 'bytes'
    }
    if (upstream.headers['content-range']) {
      out['content-range'] = upstream.headers['content-range']
    }
  }
  res.writeHead(status, out)

  // Stream with a running cap. Buffering a 200 MB video into this process
  // would stall the token stream the voice is riding on, and trusting
  // content-length would let a host that lies about it eat the heap.
  let sent = 0
  upstream.on('data', (chunk) => {
    sent += chunk.length
    if (sent > maxBytes) {
      // Headers went out long ago, so a truncated body is the only way left to
      // say no. The player sees a short read; we see this line in the log.
      console.warn(`[mediq] proxy cut ${target.href} at ${maxBytes} bytes`)
      upstream.destroy()
      res.destroy()
      return
    }
    if (!res.write(chunk)) {
      upstream.pause()
      res.once('drain', () => upstream.resume())
    }
  })
  upstream.on('end', () => res.end())
  upstream.on('error', () => res.destroy())
  req.on('close', () => upstream.destroy())
}

// ---------------------------------------------------------------------------

/**
 * Machine telemetry for the HUD's status readout — CPU, RAM, and the Wi-Fi
 * this machine is on. All of it stays local: it answers only the browser tab
 * that is already trusted to drive the agent, over the same origin check as
 * everything else on this server.
 */

/** One snapshot of each core's time buckets, for differencing against a later
 *  one. os.loadavg() is always [0,0,0] on Windows, so this is the portable way
 *  to get a real CPU percentage rather than a Unix-only shortcut. */
function cpuSnapshot() {
  return cpus().map((c) => {
    const { user, nice, sys, idle, irq } = c.times
    return { idle, total: user + nice + sys + idle + irq }
  })
}

/** Percent busy across all cores, sampled over a short window. The window has
 *  to be long enough to see real work happen and short enough that polling it
 *  every few seconds doesn't itself become the load. */
async function cpuPercent() {
  const before = cpuSnapshot()
  await new Promise((r) => setTimeout(r, 150))
  const after = cpuSnapshot()
  let idleDelta = 0
  let totalDelta = 0
  for (let i = 0; i < before.length; i++) {
    idleDelta += after[i].idle - before[i].idle
    totalDelta += after[i].total - before[i].total
  }
  if (totalDelta <= 0) return 0
  return Math.round((1 - idleDelta / totalDelta) * 100)
}

function ramPercent() {
  const total = totalmem()
  const used = total - freemem()
  return Math.round((used / total) * 100)
}

/**
 * The Wi-Fi network name and negotiated link rate.
 *
 * Windows only for now — `netsh` is the one thing every Windows box has, and
 * this bridge's other platform-specific paths (start.mjs's WASM vendoring,
 * the voice stack) already assume this environment. Anywhere else, or with no
 * Wi-Fi adapter, this simply reports nothing rather than guessing.
 *
 * Cached briefly: shelling out on every poll is wasteful, and the network
 * name does not change fast enough to need it.
 */
let wifiCache = { at: 0, ssid: null, linkMbps: null }
const WIFI_CACHE_MS = 4000

async function wifiInfo() {
  if (Date.now() - wifiCache.at < WIFI_CACHE_MS) return wifiCache
  let ssid = null
  let linkMbps = null
  if (osPlatform() === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'netsh',
        ['wlan', 'show', 'interfaces'],
        { timeout: 2000, windowsHide: true },
      )
      // Anchored at the start of the line (after whitespace) so this never
      // matches the "BSSID" row just above it in the same output.
      const ssidLine = stdout.match(/^\s*SSID\s*:\s*(.+)$/m)
      const rateLine = stdout.match(/^\s*Receive rate \(Mbps\)\s*:\s*([\d.]+)/m)
      if (ssidLine) ssid = ssidLine[1].trim()
      if (rateLine) linkMbps = Number(rateLine[1])
    } catch {
      // No adapter, no `netsh`, or not associated to a network — report
      // nothing rather than a stale or fabricated reading.
    }
  }
  wifiCache = { at: Date.now(), ssid, linkMbps }
  return wifiCache
}

/**
 * CORS, reflected rather than wildcarded.
 *
 * `*` on this origin means any page on the internet can read whatever the
 * bridge serves, so the same allowlist that guards the socket picks the
 * header. A request carrying an Origin we don't know is refused outright —
 * but a request with no Origin at all is served, because an <img src> load
 * (which is how panels fetch screenshots) never sends one.
 */
function corsFor(req) {
  const origin = req.headers.origin
  const headers = { vary: 'origin' }
  if (origin) {
    headers['access-control-allow-origin'] = origin
    headers['access-control-allow-headers'] = 'content-type'
  }
  return headers
}

// One HTTP server for both the speech proxy and the WebSocket upgrade.
const http = await import('node:http')

const handleRequest = async (req, res) => {
  const origin = req.headers.origin
  if (origin && !originAllowed(origin)) {
    console.warn(`[mediq] refused http request from origin ${origin}`)
    res.writeHead(403, { vary: 'origin' })
    return res.end('forbidden')
  }
  const cors = corsFor(req)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }

  if (req.method === 'GET' && req.url === '/health') {
    // The browser reads this once at boot to decide which voice engine to use.
    // Both premium paths ride the same ElevenLabs key, so both flags track it:
    // with a key the app transcribes with Scribe and speaks with ElevenLabs;
    // without one it falls back to the browser's own recogniser and voice, so a
    // student with nothing configured still has a working assistant.
    const eleven = Boolean(elevenKey())
    res.writeHead(200, { ...cors, 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, tts: eleven, stt: eleven }))
  }

  if (req.method === 'GET' && req.url === '/sysinfo') {
    // The HUD polls this every few seconds for the status readout. cpuPercent
    // takes ~150ms by design (see the function) — cheap next to the poll
    // interval, and run alongside the Wi-Fi lookup rather than after it.
    const [cpu, wifi] = await Promise.all([cpuPercent(), wifiInfo()])
    res.writeHead(200, { ...cors, 'content-type': 'application/json' })
    return res.end(
      JSON.stringify({
        ok: true,
        cpuPercent: cpu,
        ramPercent: ramPercent(),
        wifiSSID: wifi.ssid,
        wifiLinkMbps: wifi.linkMbps,
      }),
    )
  }

  // Serve local image files to the page. Screenshots and generated art land on
  // disk as absolute paths, and a page served over http can't read file:// —
  // so the bridge, which can, hands them over.
  if (req.method === 'GET' && req.url?.startsWith('/file?')) {
    const asked = new URL(req.url, 'http://x').searchParams.get('path') ?? ''
    // Resolve symlinks BEFORE judging anything. A name ending in .png can be a
    // link pointing at /etc/hosts, and checking the suffix the caller supplied
    // would wave that straight through — which is exactly how this endpoint
    // used to serve the contents of arbitrary system files.
    let real = null
    try {
      if (isAbsolute(asked)) real = await realpath(asked)
    } catch {
      real = null
    }
    const dot = real ? real.lastIndexOf('.') : -1
    const ext = dot === -1 ? '' : real.slice(dot).toLowerCase()
    const contentType = ext ? SERVABLE_TYPES[ext] : undefined
    // Images and video only, absolute paths only, and only under roots we
    // expect things to be written to (or, now, browsed with list_files /
    // find_files in files.mjs — the same withinRoots governs both). This
    // endpoint exists to show pictures and play clips, not to be a general
    // file read for whatever the model — or another page — asks for.
    if (!real || !contentType || !withinRoots(real)) {
      res.writeHead(400, cors)
      return res.end('images or video only')
    }
    const isVideo = Object.hasOwn(VIDEO_TYPES, ext)
    try {
      const info = await stat(real)
      if (!info.isFile() || info.size > (isVideo ? MAX_LOCAL_VIDEO_BYTES : MAX_FILE_BYTES)) {
        res.writeHead(413, cors)
        return res.end('too large')
      }
      // Video is streamed rather than read whole, for two reasons: a clip can
      // be gigabytes where a screenshot never is, and <video> needs Range
      // support to seek at all — Chrome will not even start playback on a
      // multi-minute file without it. Images stay a plain buffered read; they
      // are small and a stream would only add ceremony.
      if (isVideo) {
        const range = req.headers.range
        const m = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range) : null
        if (m) {
          const start = m[1] ? Number(m[1]) : 0
          const end = m[2] ? Number(m[2]) : info.size - 1
          if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end < info.size) {
            res.writeHead(206, {
              ...cors,
              'content-type': contentType,
              'content-range': `bytes ${start}-${end}/${info.size}`,
              'accept-ranges': 'bytes',
              'content-length': String(end - start + 1),
              'x-content-type-options': 'nosniff',
            })
            createReadStream(real, { start, end }).pipe(res)
            return
          }
        }
        res.writeHead(200, {
          ...cors,
          'content-type': contentType,
          'accept-ranges': 'bytes',
          'content-length': String(info.size),
          'x-content-type-options': 'nosniff',
        })
        createReadStream(real).pipe(res)
        return
      }
      // Asynchronous because this process is also pumping the agent's token
      // stream; a synchronous read of a large screenshot stalls the voice.
      const body = await readFile(real)
      res.writeHead(200, {
        ...cors,
        'content-type': contentType,
        'x-content-type-options': 'nosniff',
      })
      return res.end(body)
    } catch {
      res.writeHead(404, cors)
      return res.end('not found')
    }
  }

  // Remote images, fetched here so the page never talks to the wider web. The
  // renderer rewrites every http(s) <img src> in a panel to this endpoint.
  if (req.method === 'GET' && req.url?.startsWith('/img?')) {
    try {
      await proxyRemote(req, res, cors, {
        kinds: ['image/'],
        maxBytes: MAX_IMG_BYTES,
        timeoutMs: IMG_TIMEOUT_MS,
        ranged: false,
      })
    } catch (err) {
      if (res.headersSent) return res.destroy()
      res.writeHead(err.status ?? 502, cors)
      return res.end(err.message ?? 'proxy failed')
    }
    return
  }

  // The same, for video and audio. Separate from /img because the limits and
  // the Range handling are genuinely different, not because the code is.
  if (req.method === 'GET' && req.url?.startsWith('/media?')) {
    try {
      await proxyRemote(req, res, cors, {
        kinds: ['video/', 'audio/'],
        maxBytes: MAX_MEDIA_BYTES,
        timeoutMs: MEDIA_TIMEOUT_MS,
        ranged: true,
      })
    } catch (err) {
      if (res.headersSent) return res.destroy()
      res.writeHead(err.status ?? 502, cors)
      return res.end(err.message ?? 'proxy failed')
    }
    return
  }

  // A whole web page, fetched here and served from this origin so it can be
  // framed. The publisher's X-Frame-Options and CORS rules are enforced against
  // the browser, and from the browser's point of view this document is ours —
  // so an article that refuses to be embedded anywhere still opens on the
  // display. See page.mjs for what each mode does to the markup.
  //
  // No Origin header arrives on an iframe navigation, so this rides the same
  // path as an <img> load through the check at the top of this handler.
  if (req.method === 'GET' && req.url?.startsWith('/page?')) {
    const asked = new URL(req.url, 'http://x')
    const target = asked.searchParams.get('url') ?? ''
    const mode = asked.searchParams.get('mode') === 'live' ? 'live' : 'reader'
    try {
      const page = await renderPage(target, mode, `http://localhost:${PORT}`)
      res.writeHead(200, { ...cors, ...page.headers })
      return res.end(page.body)
    } catch (err) {
      // Rendered as a page rather than returned as a status, because this lands
      // inside an iframe: a bare 502 body is a blank rectangle on the display,
      // which reads as the interface being broken rather than as the article
      // being unavailable.
      res.writeHead(err.status ?? 502, {
        ...cors,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      })
      return res.end(
        `<!doctype html><meta charset="utf-8"><style>
           body{margin:0;padding:26px;background:transparent;color:#7fb6bf;
                font:400 13px/1.6 ui-monospace,monospace}
           b{color:#cfe9ee;font-weight:500;display:block;margin-bottom:6px}
         </style><b>This page could not be opened.</b>${
           String(err?.message ?? 'unknown error').replace(/[<&]/g, '')
         }`,
      )
    }
  }

  if (req.method === 'POST' && req.url === '/tts') {
    const key = elevenKey()
    if (!key) {
      res.writeHead(503, cors)
      return res.end('no elevenlabs key')
    }
    // A spoken line is a few hundred bytes. Anything approaching this is not a
    // sentence, and buffering it unbounded would let one request eat the heap.
    let body = ''
    let overflowed = false
    for await (const chunk of req) {
      body += chunk
      if (body.length > 64 * 1024) {
        overflowed = true
        break
      }
    }
    if (overflowed) {
      req.destroy()
      res.writeHead(400, cors)
      return res.end('body too large')
    }
    // Inside a try: this handler is async with nothing catching its rejection,
    // so a malformed body used to take the entire bridge down with it.
    let text
    try {
      ;({ text } = JSON.parse(body || '{}'))
    } catch {
      res.writeHead(400, cors)
      return res.end('bad json')
    }
    if (!text) {
      res.writeHead(400, cors)
      return res.end('no text')
    }
    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream` +
          // 22kHz mono is half the bytes of 44kHz and indistinguishable through
          // a laptop speaker; optimize_streaming_latency=3 trades a little
          // prosody for a much earlier first byte.
          `?output_format=mp3_22050_32&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            // Flash is the low-latency model — a conversation needs speed more
            // than it needs the last few percent of quality.
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75,
              speed: 1.05,
            },
          }),
        },
      )
      if (!upstream.ok) {
        res.writeHead(upstream.status, cors)
        return res.end(await upstream.text())
      }

      // Pipe it through rather than buffering. Waiting for the whole file here
      // would throw away everything the streaming endpoint just bought us.
      res.writeHead(200, {
        ...cors,
        'content-type': 'audio/mpeg',
        'cache-control': 'no-cache',
      })
      for await (const chunk of upstream.body) res.write(Buffer.from(chunk))
      return res.end()
    } catch (err) {
      res.writeHead(502, cors)
      return res.end(String(err?.message ?? err))
    }
  }

  // Speech to text. The browser captures one spoken segment as a compressed
  // audio blob and posts the raw bytes here; the bridge hands them to
  // ElevenLabs Scribe and returns the transcript. This is what replaced the
  // browser's own SpeechRecognition — that API dies silently under always-on
  // use, and a server-side transcriber cannot. Detecting that the user is
  // speaking at all is done locally with voice-activity detection, which never
  // touches this endpoint; this is only for the words.
  if (req.method === 'POST' && req.url === '/stt') {
    const key = elevenKey()
    if (!key) {
      res.writeHead(503, cors)
      return res.end('no elevenlabs key')
    }

    const type = req.headers['content-type'] || 'audio/webm'
    const chunks = []
    let size = 0
    let overflowed = false
    // A few seconds of Opus is well under a megabyte; 25 MB is a generous
    // ceiling that still refuses a runaway stream before it eats the heap.
    for await (const chunk of req) {
      chunks.push(chunk)
      size += chunk.length
      if (size > 25 * 1024 * 1024) {
        overflowed = true
        break
      }
    }
    if (overflowed) {
      req.destroy()
      res.writeHead(413, cors)
      return res.end('audio too large')
    }
    // Silence, or a click. Nothing to transcribe, and calling out to the API
    // for it would only add latency to a non-answer.
    if (size < 1200) {
      res.writeHead(200, { ...cors, 'content-type': 'application/json' })
      return res.end(JSON.stringify({ text: '' }))
    }

    const audio = Buffer.concat(chunks)

    // Voice authentication (voiceauth.mjs). A no-op — resolves authorized
    // instantly — until someone is actually enrolled; see there for why the
    // gate belongs here rather than as an MCP tool's own business. An
    // unrecognized voice is dropped exactly like silence above: nothing is
    // sent back for the frontend to act on, so MEDIQ simply never answers
    // rather than announcing that it heard someone it doesn't know.
    try {
      const verdict = await verifySpeaker(audio)
      if (verdict.gated && !verdict.authorized) {
        console.log('[mediq] voice auth: unrecognized speaker, dropped')
        res.writeHead(200, { ...cors, 'content-type': 'application/json' })
        return res.end(JSON.stringify({ text: '' }))
      }
    } catch (err) {
      // A broken verifier should never be why the owner's own voice stops
      // working — fail open and let the turn through.
      console.error('[mediq] voice auth check failed, letting the turn through:', err?.message ?? err)
    }

    try {
      // The filename extension is the only hint Scribe gets about the codec, so
      // derive it from the content-type the MediaRecorder reported rather than
      // hard-coding one.
      const ext = type.includes('ogg')
        ? 'ogg'
        : type.includes('mp4') || type.includes('mpeg')
          ? 'mp4'
          : type.includes('wav')
            ? 'wav'
            : 'webm'
      const form = new FormData()
      form.append('model_id', 'scribe_v1')
      form.append('file', new Blob([audio], { type }), `speech.${ext}`)

      const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': key },
        body: form,
      })
      if (!upstream.ok) {
        res.writeHead(upstream.status, cors)
        return res.end(await upstream.text())
      }
      const data = await upstream.json()
      res.writeHead(200, { ...cors, 'content-type': 'application/json' })
      return res.end(JSON.stringify({ text: (data.text ?? '').trim() }))
    } catch (err) {
      res.writeHead(502, cors)
      return res.end(String(err?.message ?? err))
    }
  }

  res.writeHead(404, cors)
  res.end()
}

const server = http.createServer((req, res) => {
  // The handler is async, so anything it throws would otherwise become an
  // unhandled rejection and leave the browser waiting on a socket that is
  // never going to answer.
  handleRequest(req, res).catch((err) => {
    console.error('[mediq] request failed:', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})

const wss = new WebSocketServer({
  server,
  // The handshake is the only place a page can be turned away, so it happens
  // here rather than after the socket is open. Rejections are logged loudly:
  // the likeliest cause is a dev server on an unexpected port, and a silent
  // 403 would look like the bridge simply isn't running.
  verifyClient: ({ origin, req }, done) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path !== '/' && path !== '/ws') {
      console.warn(`[mediq] rejected websocket on path ${path}`)
      return done(false, 403, 'Forbidden')
    }
    if (!originAllowed(origin)) {
      console.warn(
        `[mediq] rejected websocket from origin ${origin ?? '(none)'}` +
          ' — set MEDIQ_ALLOWED_ORIGINS to permit it',
      )
      return done(false, 403, 'Forbidden')
    }
    done(true)
  },
})
server.listen(PORT)

console.log(`[mediq] bridge listening on ws://localhost:${PORT}`)
console.log(
  `[mediq] speech ${elevenKey() ? 'via ElevenLabs (key from MCP config)' : 'using browser fallback voice'}`,
)
console.log(`[mediq] model ${MODEL} · effort ${EFFORT}`)
console.log(
  `[mediq] writes ${ALLOW_WRITES ? 'ENABLED' : 'disabled'}` +
    (ALLOW_WRITES ? '' : ' — set MEDIQ_ALLOW_WRITES=1 to permit shell/file/device actions'),
)
console.log(
  `[mediq] email writes ${ALLOW_EMAIL_WRITES ? 'ENABLED' : 'disabled'}` +
    (ALLOW_EMAIL_WRITES ? '' : ' — set MEDIQ_ALLOW_EMAIL_WRITES=1 to let MEDIQ send/reply/label mail'),
)
// Asynchronous, so it lands a beat after the rest of the banner. Worth printing
// at all because an extension that is simply not running is indistinguishable
// at the tool boundary from one that is broken, and this is the one place the
// difference can be stated before anybody asks a question that depends on it.
void chromeAvailable().then((ok) => {
  console.log(
    ok
      ? `[mediq] browser control ready${ALLOW_WRITES ? '' : ' (reading only — clicking and typing need MEDIQ_ALLOW_WRITES=1)'}`
      : '[mediq] browser control unavailable — open Chrome with the Claude extension enabled',
  )
})

console.log(
  '[mediq] accepting local dev origins' +
    (EXTRA_ORIGINS.size ? ` plus ${[...EXTRA_ORIGINS].join(', ')}` : '') +
    (ALLOW_NO_ORIGIN ? ' and clients that send no origin' : ''),
)

/**
 * What to tell the browser when a turn ends badly. Plain sentences, because
 * whatever reaches the client is liable to be spoken.
 */
const RESULT_FAILURES = {
  error_during_execution: 'The turn failed part way through.',
  error_max_turns: 'The turn ran too long and was stopped.',
  error_max_budget_usd: 'The budget for this turn ran out.',
  error_max_structured_output_retries: 'The answer could not be assembled.',
  default: 'The turn ended without an answer.',
}

wss.on('connection', (socket) => {
  console.log('[mediq] client connected')

  // Answer the HUD straight away rather than making it wait for the agent's
  // first turn. Refined later by the real init message.
  socket.send(
    JSON.stringify({ type: 'ready', servers: Object.keys(MCP_SERVERS) }),
  )

  /** Resolves the pending user message into the SDK's input generator. */
  let deliver = null
  let closed = false
  const inbox = []

  async function* userMessages() {
    while (!closed) {
      const text =
        inbox.shift() ??
        (await new Promise((resolve) => {
          deliver = resolve
        }))
      if (closed || text == null) return
      yield {
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
      }
    }
  }

  const send = (msg) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
  }

  /**
   * Which question the agent is currently answering.
   *
   * The stream carries no notion of a turn, so without this the client cannot
   * tell the tail of an abandoned answer from the start of the new one — it
   * attaches a listener and receives whatever is on the socket. Echoing the
   * id the client sent lets it ignore anything that is not its own, which is
   * the only reliable fix: no amount of waiting on this side changes what a
   * listener over there has already heard.
   */
  let answering = null
  const sendTurn = (msg) => send({ ...msg, ask: answering })

  /**
   * Asking the browser for something and waiting for the answer.
   *
   * Every other tool here pushes — a panel, a blade, a retint — and never needs
   * a reply. The camera is the exception: the hardware is over there and the
   * model is here, so a frame has to come back. Correlated by id because a turn
   * can have more than one request in flight, and timed out because a browser
   * that has been closed mid-question would otherwise hang the turn until the
   * two-minute idle timer noticed.
   */
  const waiting = new Map()
  let asks = 0

  const ask = (kind, args, timeoutMs = 20_000) =>
    new Promise((resolve, reject) => {
      if (socket.readyState !== socket.OPEN) {
        return reject(new Error('the interface is not connected'))
      }
      const id = `q${++asks}`
      const timer = setTimeout(() => {
        waiting.delete(id)
        reject(new Error('the interface did not answer in time'))
      }, timeoutMs)
      waiting.set(id, { resolve, timer })
      send({ type: kind, id, ...args })
    })

  /**
   * Announcing a tool on the HUD, once, and only if it actually runs.
   *
   * A tool_use block surfaces twice — as a partial stream event and again on
   * the completed assistant message — so ids are remembered. The harder part
   * is timing, because a refused tool that lights the badge, plays the sound
   * and provokes a "working on it" line, for work that never happens, reads as
   * a bug on camera.
   *
   * The SDK's order is: the block starts streaming, then canUseTool is asked,
   * then the tool runs. So nothing is known at content_block_start. Announcing
   * from inside canUseTool would know the verdict but miss tools entirely —
   * measured on this SDK, the callback is consulted only for calls the CLI
   * hasn't already settled, so a `Bash: echo` its own classifier waves through
   * never reaches us at all.
   *
   * So: announce immediately for anything decideTool permits, since those run.
   * Hold the rest, and let the tool_result settle it — a refusal comes back as
   * is_error, anything else really did execute and has earned its badge, a
   * beat late. Nothing is ever announced for work that didn't happen.
   */
  const seenTools = new Set()
  const heldTools = new Map()

  /**
   * Resolves when the turn in flight has actually finished.
   *
   * Waiting on session.interrupt() alone is not enough. It resolves when the
   * agent has been *told* to stop, not when it has, so the last tokens of the
   * abandoned answer are still on their way — and since nothing on the wire
   * identifies which question a delta belongs to, they land on the next turn's
   * listener. Measured: ask for ALPHA, interrupt, ask for BRAVO, and BRAVO's
   * answer arrives as "ALPHA\nBRAVO".
   *
   * The SDK emits exactly one `result` per turn, so that is the boundary worth
   * waiting for. Raced against a timeout because a turn that never reports one
   * must not wedge the conversation for ever — a stray word is a blemish, a
   * deadlocked assistant is not.
   */
  let settling = Promise.resolve()
  let finishTurn = null

  const turnFinished = () =>
    new Promise((resolve) => {
      finishTurn = resolve
    })

  /**
   * A brief pause so the abandoned turn's frames are tagged with the OLD id
   * before the new one is adopted. Short, because correctness now comes from
   * the tag rather than from the wait — this only has to cover the gap, not
   * outlast the whole turn.
   */
  const SETTLE_CAP_MS = 400

  const announceTool = (id, name) => {
    if (!name || (id && seenTools.has(id))) return
    if (id) seenTools.add(id)
    // The display tool isn't work being done, it's the HUD drawing itself —
    // announcing it would put "mediq_hud · display" in the tool badge and trigger
    // a "working on it" filler for something already on screen.
    if (name === 'mcp__mediq_hud__display') return
    // The ui_* tools are the same case one step further: retinting the
    // interface is the interface talking about itself, not work being done for
    // the user, and the badge would be describing the very thing they can see.
    if (name.startsWith('mcp__mediq_ui__')) return
    // === true, not a truthy check: decideTool can also return a string (a
    // deny WITH a specific reason, see the claude_ai_* block above), and a
    // truthy check would show the "accessing" badge for a call that is about
    // to be refused.
    if (decideTool(name) === true) return sendTurn({ type: 'tool', name })
    if (id) heldTools.set(id, name)
  }

  const settleTool = (id, failed) => {
    const name = heldTools.get(id)
    if (name === undefined) return
    heldTools.delete(id)
    if (!failed) sendTurn({ type: 'tool', name })
  }

  // The clinical layer for this connection: its tools for the agent, and its
  // own channel for the dashboard's sign-in and confirm/reject clicks.
  const mediq = mediqConnection(send)

  const session = query({
    prompt: userMessages(),
    options: {
      // Everything Claude Code has configured, plus the HUD as an in-process
      // server. The HUD's handler closes over this socket, so a `display` call
      // lands on screen directly — which is also why this object is built per
      // connection rather than once.
      mcpServers: {
        ...MCP_SERVERS,
        mediq_hud: displayServer(
          (panel) => send({ type: 'panel', panel }),
          (blade) => send({ type: 'blade', blade }),
          // Reuses the 'ui' channel rather than adding a new frame type — the
          // browser already has one place that dispatches out-of-band ops.
          (id, position) => send({ type: 'ui', op: 'move', args: { id, position } }),
          (id) => send({ type: 'ui', op: 'close', args: { id } }),
        ),
        // The interface controls, on the same socket. A separate key because
        // MCP tool names are `mcp__<key>__<tool>` and one key can only carry
        // one server; the underscore in it is why decideTool and announceTool
        // both name `mediq_ui` explicitly.
        mediq_ui: uiServer((op, args) => send({ type: 'ui', op, args })),
        // The user's own Chrome, over the extension's native-host socket. It
        // holds no per-connection state, but it is built here with the rest so
        // the write gate is read once, at the same point as everything else.
        mediq_chrome: chromeServer({ allowWrites: ALLOW_WRITES }),
        // The camera, which unlike everything else here has to ask and wait.
        mediq_eyes: visionServer(ask),
        // Screenshots and screen recording — captured directly by this
        // process (see screen-native.mjs), not through the browser, so this
        // only needs a one-way push for the on-screen status banner.
        mediq_screen: screenServer((status) => send({ type: 'ui', op: 'screen-status', args: { status } })),
        // Voice enrollment. Verification itself runs in the /stt handler,
        // not here — this is only the ask/reply channel for recording a
        // fresh enrollment clip from the browser's microphone.
        mediq_voiceauth: voiceAuthServer(ask),
        // Finds a video, song or channel by name so `blade` has a URL to
        // open. No per-connection state either, same as mediq_chrome.
        mediq_youtube: youtubeServer(),
        // GIFs and real photographs by subject, same reasoning.
        mediq_gifs: gifsServer(),
        mediq_images: imagesServer(),
        // Local file browsing and search — read-only, same roots as /file.
        mediq_files: filesServer(),
        // General web research — see websearch.mjs for why this exists.
        mediq_websearch: webSearchServer(),
        // Patient, room and medication registers, and the pending-change queue.
        mediq: mediq.server,
      },
      // A plain system prompt, not the claude_code preset. The preset is
      // tuned for a coding agent — verbose, file-oriented, and a large chunk
      // of input tokens on every turn. Replacing it makes the persona stick,
      // keeps answers short enough to speak, and cuts cost per turn.
      systemPrompt: SYSTEM_PROMPT,
      // Run from the home directory so project-scoped MCP servers don't shadow
      // the global ones, and so file tools have a sane root.
      cwd: homedir(),
      // No filesystem settings at all. Left to its default the SDK loads
      // ~/.claude/settings.json and settings.local.json exactly as the CLI
      // does — which on a working machine means a bypassPermissions default
      // and a pile of allow-rules for Bash. Allow-rules are matched before the
      // permission callback, so decideTool below would never even be asked
      // about the tools it most needs to refuse. Empty makes this bridge the
      // only authority. It also stops the global CLAUDE.md riding along on
      // every voice turn, carrying instructions written for a coding agent
      // into a conversation that is meant to be two sentences long.
      //
      // The cost is that MCP servers stop being discovered too, which is why
      // mcpServers above passes them in by hand.
      settingSources: [],
      // Stated explicitly, and it has to be.
      //
      // With no `model` here the SDK falls back to its own default, which on
      // this machine resolved to claude-opus-4-8[1m] — not what src/config.ts
      // declares for the browser-direct path, and not anything anyone chose.
      // Normally your own `/model` preference would decide, but that lives in
      // the settings files `settingSources: []` deliberately stops loading, so
      // without this line nothing in the project has a say at all.
      model: MODEL,
      effort: EFFORT,
      maxTurns: 24,
      permissionMode: 'default',
      // Without this the SDK only emits whole assistant messages, and MEDIQ
      // would sit silent until the entire answer was written. Partial events
      // are what let speech start on the first finished sentence.
      includePartialMessages: true,
      // Signature is (toolName, input, options) and it must return a
      // PermissionResult object. Returning a bare boolean silently denies
      // everything, with the tool name arriving undefined.
      //
      // Worth knowing: this is a last gate, not the only one. Calls the CLI
      // has already settled never arrive here — its own classifier waves
      // through a `Bash: echo hello` without asking, and only reaches us for
      // something with a consequence, like a `touch`. So a deny here is
      // reliable; an absence of a call here is not proof nothing ran.
      canUseTool: async (toolName, input) => {
        // A string means "denied, and here specifically is why" — the
        // account-connector block below is the one case so far with a reason
        // that isn't "write access is off," and lumping it into the same
        // generic message told the model (and so the user) something false.
        const verdict = decideTool(toolName, input)
        const ok = verdict === true
        console.log(`[mediq] tool ${toolName} -> ${ok ? 'allow' : 'deny'}`)
        return ok
          ? { behavior: 'allow' }
          : {
              behavior: 'deny',
              // Every word of this can end up spoken, so it carries no command
              // to read out — the persona is forbidden from saying one aloud.
              message:
                typeof verdict === 'string'
                  ? verdict
                  : 'Blocked: MEDIQ is running in read-only mode and cannot take' +
                    ' actions that change anything. Tell the user this action is' +
                    ' unavailable until they enable write access on the machine.',
            }
      },
    },
  })

  // Pump the session's output stream to the browser for as long as it lives.
  ;(async () => {
    try {
      for await (const msg of session) {
        if (process.env.MEDIQ_DEBUG === '1') {
          console.log('[msg]', msg.type, msg.event?.type ?? '')
        }

        switch (msg.type) {
          // Raw Anthropic stream events, surfaced by includePartialMessages.
          // This is the ONLY place spoken text arrives: there is no top-level
          // text_delta message in the SDK union and the 'assistant' message
          // carries no deltas either. Turn includePartialMessages off and
          // MEDIQ goes completely mute.
          case 'stream_event': {
            const ev = msg.event
            if (
              ev?.type === 'content_block_delta' &&
              ev.delta?.type === 'text_delta' &&
              ev.delta.text
            ) {
              sendTurn({ type: 'text', delta: ev.delta.text })
            }
            if (
              ev?.type === 'content_block_start' &&
              ev.content_block?.type === 'tool_use'
            ) {
              announceTool(ev.content_block.id, ev.content_block.name)
            }
            break
          }

          case 'assistant': {
            // Fallback for builds that emit whole assistant messages rather
            // than partial events. Deduped against the stream_event path.
            for (const block of msg.content ?? msg.message?.content ?? []) {
              if (block.type === 'tool_use') {
                announceTool(block.id, block.name)
              }
            }
            break
          }

          case 'user': {
            // Tool results come back as a user message. This is the only place
            // a held announcement can be resolved: a refused tool arrives with
            // is_error set and stays off the HUD, anything else ran.
            const blocks = msg.message?.content
            if (!Array.isArray(blocks)) break
            for (const block of blocks) {
              if (block?.type === 'tool_result') {
                settleTool(block.tool_use_id, block.is_error === true)
              }
            }
            break
          }

          case 'result':
            // A result is not automatically a success. The error subtypes
            // carry no `result` field at all, so reporting them as 'done' with
            // empty text is indistinguishable from a turn that simply had
            // nothing to say — the HUD stops spinning and MEDIQ stands there
            // silent. Say what happened instead.
            if (msg.subtype === 'success') {
              sendTurn({
                type: 'done',
                text: msg.result ?? '',
                costUsd: msg.total_cost_usd ?? null,
              })
            } else {
              console.error(
                `[mediq] turn failed: ${msg.subtype}`,
                msg.errors ?? '',
              )
              sendTurn({
                type: 'error',
                message: RESULT_FAILURES[msg.subtype] ?? RESULT_FAILURES.default,
              })
            }
            // Whatever was waiting on this turn to finish can go now. This is
            // the only place a turn is genuinely over.
            finishTurn?.()
            finishTurn = null
            // One turn's tool ids are never referred to again, and these
            // otherwise grow for as long as the socket is open.
            seenTools.clear()
            heldTools.clear()
            break

          case 'system':
            if (msg.subtype === 'init') {
              // Servers report 'pending' until first use — they connect
              // lazily — so only drop the ones that are actually unusable.
              const usable = (msg.mcp_servers ?? [])
                .filter((s) => s.status !== 'needs-auth' && s.status !== 'failed')
                .map((s) => s.name)
              send({ type: 'ready', servers: usable })
              console.log(`[mediq] ${usable.length} MCP servers available`)
            }
            break
        }
      }
    } catch (err) {
      console.error('[mediq] session error:', err)
      send({ type: 'error', message: String(err?.message ?? err) })
      // The stream is finished either way — nothing will ever be read from it
      // again. Leaving the socket open would leave the client believing it has
      // a working bridge, and every later question would hang for ever waiting
      // on a pump that has already stopped. Close it so it reconnects.
      closed = true
      deliver?.(null)
      session.close?.()
      socket.close()
    }
  })()

  socket.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'ask' && typeof msg.text === 'string') {
      /**
       * Queued behind any interrupt that is still settling.
       *
       * A barge-in is two messages in quick succession — interrupt, then the
       * new question — and session.interrupt() is asynchronous. Delivering the
       * question the instant it arrives means the agent can still be winding
       * down the previous turn, so its last tokens are emitted after the new
       * one has begun and land on the new turn's listener. Measured: ask "one",
       * interrupt, ask "two", and the answer to "two" comes back as "One."
       *
       * Waiting costs nothing when nothing is interrupting — the chain is an
       * already-resolved promise — and removes the cross-talk when there is.
       */
      const text = msg.text
      const id = typeof msg.id === 'string' ? msg.id : null
      void settling.then(() => {
        answering = id
        if (deliver) {
          const resolve = deliver
          deliver = null
          resolve(text)
        } else {
          inbox.push(text)
        }
      })
    }

    if (msg.type === 'mediq') {
      mediq.handle(msg)
    }

    if (msg.type === 'reply' && typeof msg.id === 'string') {
      const slot = waiting.get(msg.id)
      if (slot) {
        waiting.delete(msg.id)
        clearTimeout(slot.timer)
        slot.resolve(msg)
      }
    }

    if (msg.type === 'interrupt') {
      // Held so the next question can wait for it rather than racing it.
      const stopped = turnFinished()
      settling = Promise.resolve(session.interrupt?.())
        .catch(() => {})
        .then(() =>
          Promise.race([
            stopped,
            new Promise((r) => setTimeout(r, SETTLE_CAP_MS)),
          ]),
        )
    }
  })

  socket.on('close', () => {
    console.log('[mediq] client disconnected')
    closed = true
    deliver?.(null)
    session.close?.()
    mediq.close()
  })
})
