import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * GIF search, via Giphy.
 *
 * The natural companion to image and YouTube search: "show me a gif of X" is
 * its own kind of request, distinct from a still photo, and Giphy is the
 * standard source for it — free key, generous limits, no billing required.
 */

const SEARCH_ENDPOINT = 'https://api.giphy.com/v1/gifs/search'

const ok = (text) => ({ content: [{ type: 'text', text }] })
const refuse = (text) => ({ isError: true, content: [{ type: 'text', text }] })

function apiKey() {
  const key = process.env.GIPHY_API_KEY
  return key && key.trim() ? key.trim() : null
}

const SEARCH_DESCRIPTION = `Search for a GIF by subject.

Use this specifically when the user asks for a GIF, or a reaction/meme clip —
"send a facepalm gif", "show me the this-is-fine dog" — as opposed to a video
to watch (use youtube_search).

Returns real, working GIF URLs — put one on a blade (kind "image", it is just
an animated image) to actually show it. Never guess a URL yourself.`

const schema = {
  query: z.string().describe('What the GIF should be of, e.g. "facepalm" or "this is fine dog".'),
  count: z
    .union([z.number(), z.string()])
    .optional()
    .catch(undefined)
    .describe('How many results, 1 to 8. Default 3.'),
}

export function gifsServer() {
  return createSdkMcpServer({
    name: 'mediq_gifs',
    version: '1.0.0',
    instructions:
      'Find a GIF with gif_search when asked for one specifically, then put ' +
      'the result on a blade (kind: image) to actually show it.',
    alwaysLoad: true,
    tools: [
      tool('gif_search', SEARCH_DESCRIPTION, schema, async (args) => {
        const key = apiKey()
        if (!key) {
          return refuse(
            'GIF search is not configured on this machine — no ' +
              'GIPHY_API_KEY is set. Tell the user it needs a free API key ' +
              'added to .env.local (see .env.example) and carry on without it.',
          )
        }
        const query = String(args.query ?? '').trim()
        if (!query) return refuse('Not searched: a query is required.')
        const n = Math.max(1, Math.min(8, Number(args.count) || 3))

        const url = new URL(SEARCH_ENDPOINT)
        url.searchParams.set('api_key', key)
        url.searchParams.set('q', query)
        url.searchParams.set('limit', String(n))
        url.searchParams.set('rating', 'pg-13')

        let res
        try {
          res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        } catch (err) {
          return refuse(`Could not reach Giphy: ${err?.message ?? err}.`)
        }
        if (!res.ok) {
          return refuse(
            `GIF search failed (${res.status}). Tell the user it is ` +
              'unavailable right now and carry on without it.',
          )
        }
        const data = await res.json()
        const items = Array.isArray(data.data) ? data.data : []
        if (!items.length) return ok(`No GIFs found for "${query}".`)

        const results = items.map((g) => ({
          title: g.title ?? '',
          url: g.images?.original?.url ?? g.images?.downsized?.url,
        }))

        return ok(JSON.stringify(results, null, 1))
      }),
    ],
  })
}
