import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * YouTube search.
 *
 * The one thing missing to make "play some music" or "put the trailer on"
 * work: `blade` can already open and play a YouTube URL (see panels.mjs), but
 * nothing on this machine could turn a song, video, or channel *name* into
 * that URL. Chrome-driving (chrome.mjs) would be the other way to get there,
 * but its native-messaging socket is Unix-only and this bridge also has to
 * run on Windows — so this talks to the YouTube Data API directly instead.
 *
 * Needs a free API key (YOUTUBE_API_KEY) from a Google Cloud project with the
 * YouTube Data API v3 enabled — see .env.example. Without one the tool still
 * loads, so its absence shows up as a plain sentence MEDIQ can say rather
 * than a startup crash.
 */

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search'

const ok = (text) => ({ content: [{ type: 'text', text }] })
const refuse = (text) => ({ isError: true, content: [{ type: 'text', text }] })

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY
  return key && key.trim() ? key.trim() : null
}

/**
 * A channel is named, not addressed by id — nobody says "play the video with
 * channel ID UC38IQsAvIsxxjztdMZQtwHA", they say "play something from
 * MrBeast." So a channel name has to be resolved to an id before it is any
 * use to the video search below. One extra request, cached for the life of
 * the process since a channel's id never changes.
 */
const channelCache = new Map()

async function resolveChannel(name, key) {
  const cached = channelCache.get(name.toLowerCase())
  if (cached) return cached
  const url = new URL(SEARCH_ENDPOINT)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'channel')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('q', name)
  url.searchParams.set('key', key)
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`channel lookup failed (${res.status})`)
  const data = await res.json()
  const hit = data.items?.[0]
  if (!hit?.snippet?.channelId) return null
  const found = { id: hit.snippet.channelId, title: hit.snippet.title ?? name }
  channelCache.set(name.toLowerCase(), found)
  return found
}

const SEARCH_DESCRIPTION = `Search YouTube for a video, song, or a channel's uploads.

Use this whenever the user asks to play, watch or put on something by name
rather than a URL:
  - A video or song by title/artist — "play some music", "put on the trailer
    for that film" — pass \`query\`.
  - Something from a named channel — "play the latest MrBeast video", "show me
    a video from Marques Brownlee about the new iPhone" — pass \`channel\`,
    and \`query\` too if they also said what it should be about. Channel alone
    with \`order: "date"\` (the default when a channel is given) is their most
    recent upload — exactly what "the latest video from X" means.

It returns real watch URLs; do not guess one yourself. After a good hit, open
it with \`blade\` (kind "embed", the returned url) so it actually plays — this
tool only finds the video, it does not show it.

If several results plausibly match, prefer the official channel or the one
with the closest title rather than asking which one, unless the request was
genuinely ambiguous (an artist with a common song title, a franchise with
several trailers).`

const schema = {
  query: z
    .string()
    .optional()
    .catch(undefined)
    .describe('What to search for, e.g. "Bohemian Rhapsody Queen official" or "Dune 2 trailer". Optional when `channel` is given — omit it to mean "anything from this channel".'),
  channel: z
    .string()
    .optional()
    .catch(undefined)
    .describe('Restrict to one channel by name, e.g. "MrBeast". Resolved automatically — never pass a channel id.'),
  order: z
    .enum(['relevance', 'date'])
    .optional()
    .catch(undefined)
    .describe('date = newest first, for "the latest video from X". Default: date when `channel` is set, relevance otherwise.'),
  max_results: z
    .union([z.number(), z.string()])
    .optional()
    .catch(undefined)
    .describe('How many results to return, 1 to 10. Default 5.'),
}

export function youtubeServer() {
  return createSdkMcpServer({
    name: 'mediq_youtube',
    version: '1.0.0',
    instructions:
      'Find a YouTube video, song, or a channel\'s uploads with ' +
      'youtube_search, then open the URL it returns with the blade tool ' +
      '(kind: embed) to actually play it.',
    // Same reasoning as the display and ui servers: behind tool search the
    // model would fall back to describing a song instead of playing it.
    alwaysLoad: true,
    tools: [
      tool('youtube_search', SEARCH_DESCRIPTION, schema, async (args) => {
        const key = apiKey()
        if (!key) {
          return refuse(
            'YouTube search is not configured on this machine — no ' +
              'YOUTUBE_API_KEY is set. Tell the user it needs a free API key ' +
              'added to .env.local (see .env.example) and carry on without it.',
          )
        }
        const query = String(args.query ?? '').trim()
        const channelName = String(args.channel ?? '').trim()
        if (!query && !channelName) {
          return refuse('Not searched: give a query, a channel, or both.')
        }
        const n = Math.max(1, Math.min(10, Number(args.max_results) || 5))

        let channel = null
        if (channelName) {
          try {
            channel = await resolveChannel(channelName, key)
          } catch (err) {
            return refuse(`Could not look up that channel: ${err?.message ?? err}.`)
          }
          if (!channel) return ok(`No channel found named "${channelName}".`)
        }

        const url = new URL(SEARCH_ENDPOINT)
        url.searchParams.set('part', 'snippet')
        url.searchParams.set('type', 'video')
        url.searchParams.set('maxResults', String(n))
        url.searchParams.set('key', key)
        // An empty q with a channelId is a legal, meaningful request to the
        // API — "this channel's uploads" — so it is only set when non-empty.
        if (query) url.searchParams.set('q', query)
        if (channel) url.searchParams.set('channelId', channel.id)
        url.searchParams.set('order', args.order ?? (channel ? 'date' : 'relevance'))

        let res
        try {
          res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        } catch (err) {
          return refuse(`Could not reach YouTube: ${err?.message ?? err}.`)
        }
        if (!res.ok) {
          // Quota exhaustion is the one failure worth naming specifically —
          // it is the free tier's one real limit and "try again tomorrow" is
          // actually correct advice, unlike a generic retry.
          const quota = res.status === 403
          return refuse(
            quota
              ? 'YouTube search has hit its daily quota. Tell the user it will ' +
                'work again tomorrow, and carry on without it.'
              : `YouTube search failed (${res.status}). Tell the user it is ` +
                'unavailable right now and carry on without it.',
          )
        }
        const data = await res.json()
        const items = Array.isArray(data.items) ? data.items : []
        if (!items.length) {
          return ok(
            channel
              ? `No videos found on ${channel.title}${query ? ` matching "${query}"` : ''}.`
              : `No results for "${query}".`,
          )
        }

        const results = items
          .filter((it) => it.id?.videoId)
          .map((it) => ({
            title: it.snippet?.title ?? '',
            channel: it.snippet?.channelTitle ?? '',
            url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
            thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url,
          }))

        return ok(JSON.stringify(results, null, 1))
      }),
    ],
  })
}
