import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * General web search, via Parallel (parallel.ai).
 *
 * This is the piece the rest of the prompt has been assuming existed since
 * before any of the tools in this file were written: panels.mjs's DESIGN_SYSTEM
 * has always told the model to "fetch with exa" for anything from the web —
 * but no exa MCP server has ever actually been configured on this machine, so
 * that instruction pointed at nothing. Not a regression; it was always this
 * way, just never diagnosed until now. This tool is what that instruction
 * needed to be about.
 *
 * Returns ranked pages — url, title, a text excerpt — not images. For a
 * picture, use image_search or web_image_search (images.mjs) instead; this is
 * for "what does X say", "what's the latest on Y", ordinary research.
 */

const SEARCH_ENDPOINT = 'https://api.parallel.ai/v1beta/search'

const ok = (text) => ({ content: [{ type: 'text', text }] })
const refuse = (text) => ({ isError: true, content: [{ type: 'text', text }] })

function apiKey() {
  const key = process.env.PARALLEL_API_KEY
  return key && key.trim() ? key.trim() : null
}

const SEARCH_DESCRIPTION = `Search the web for information — pages, articles, facts, current events.

Use this for anything that needs real content from the web: "what's the latest
on X", "what does the Y documentation say", a fact you don't already know, a
question about something recent. This is general research, not an image
search — for a picture, use image_search or web_image_search instead.

Returns a ranked list of pages: url, title, and a text excerpt of the
relevant part. Read the excerpts and answer from them directly — do not just
list URLs, and never speak a URL aloud (see the system prompt's rule on that).
If you need the page's full text rather than an excerpt, \`probe_url\` and a
blade (kind "article") can fetch and show it properly.`

const schema = {
  query: z.string().describe('What to search for, in plain words — a question or a topic works better than keywords.'),
}

export function webSearchServer() {
  return createSdkMcpServer({
    name: 'mediq_websearch',
    version: '1.0.0',
    instructions:
      'General web research with web_search — pages, facts, current events. ' +
      'For a picture use image_search or web_image_search instead; this ' +
      'returns page links and excerpts, not image URLs.',
    alwaysLoad: true,
    tools: [
      tool('web_search', SEARCH_DESCRIPTION, schema, async (args) => {
        const key = apiKey()
        if (!key) {
          return refuse(
            'Web search is not configured on this machine — no ' +
              'PARALLEL_API_KEY is set. Tell the user it needs a key added ' +
              'to .env.local (see .env.example) and carry on without it — ' +
              'answer from what you already know if you can.',
          )
        }
        const query = String(args.query ?? '').trim()
        if (!query) return refuse('Not searched: a query is required.')

        let res
        try {
          res = await fetch(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: { 'x-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify({ objective: query, search_queries: [query] }),
            signal: AbortSignal.timeout(15000),
          })
        } catch (err) {
          return refuse(`Could not reach the search service: ${err?.message ?? err}.`)
        }
        if (!res.ok) {
          const quota = res.status === 429
          return refuse(
            quota
              ? 'Web search has hit its rate limit. Tell the user to try ' +
                'again in a moment, and carry on without it.'
              : `Web search failed (${res.status}). Tell the user it is ` +
                'unavailable right now and carry on without it.',
          )
        }
        const data = await res.json()
        const items = Array.isArray(data.results) ? data.results : []
        if (!items.length) return ok(`No results for "${query}".`)

        const results = items.slice(0, 8).map((r) => ({
          url: r.url ?? '',
          title: r.title ?? '',
          excerpt: Array.isArray(r.excerpts) ? r.excerpts.join(' ').slice(0, 600) : '',
        }))

        return ok(JSON.stringify(results, null, 1))
      }),
    ],
  })
}
