import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * Image search — two sources, for two different kinds of request.
 *
 * `image_search` (Pexels) is curated real photography: reliable, always a
 * working picture, right for a generic subject — "a mountain", "a golden
 * retriever". It will not find anything tied to a specific real-world thing
 * that isn't stock photography.
 *
 * `web_image_search` (SerpApi, proxying real Google Images results) is a
 * real web image search: it will find a specific landmark, product, logo, or
 * public figure that Pexels has no stock shot of. The trade is that a
 * general web crawl occasionally turns up a dead or hotlink-blocked image
 * where Pexels never does — still worth having for what only it can find.
 *
 * Chose SerpApi over Google's own Custom Search JSON API for this: Google's
 * API — despite being nominally free for the first 100 searches/day — will
 * not actually serve a request until a billing account (a real card) is
 * linked to the project, even within that free quota. SerpApi's free tier
 * (250 searches/month) needs no card at all.
 */

const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search'
const SERPAPI_ENDPOINT = 'https://serpapi.com/search'

const ok = (text) => ({ content: [{ type: 'text', text }] })
const refuse = (text) => ({ isError: true, content: [{ type: 'text', text }] })

function pexelsKey() {
  const key = process.env.PEXELS_API_KEY
  return key && key.trim() ? key.trim() : null
}

function serpapiKey() {
  const key = process.env.SERPAPI_API_KEY
  return key && key.trim() ? key.trim() : null
}

const PEXELS_DESCRIPTION = `Search for a real, curated photograph by generic subject.

Use this for anything a stock photo would satisfy — "show me a mountain",
"find a picture of a golden retriever puppy", "what does a sunset over the
ocean look like". Always returns a real, working photograph.

Will NOT find a specific real-world thing — a named landmark, a product, a
public figure, a screenshot of something. Use \`web_image_search\` for those.

Returns real, working photograph URLs — put one on a blade (kind "image") or
several (kind "gallery") to actually show them. Never guess an image URL
yourself.`

const pexelsSchema = {
  query: z.string().describe('What the picture should be of, e.g. "mountain sunset" or "golden retriever puppy".'),
  count: z
    .union([z.number(), z.string()])
    .optional()
    .catch(undefined)
    .describe('How many results, 1 to 10. Default 4 — enough for a gallery without overwhelming it.'),
  orientation: z
    .enum(['landscape', 'portrait', 'square'])
    .optional()
    .catch(undefined)
    .describe('Constrain the shape. Omit unless the layout genuinely needs a particular one.'),
}

const WEB_IMAGE_DESCRIPTION = `Search the actual web for an image of something specific.

Use this when \`image_search\` (stock photography) would not have it — a named
landmark ("the Eiffel Tower"), a specific product, a company logo, a public
figure, screenshot-style content, anything tied to a real, particular thing
rather than a generic subject.

A web crawl occasionally turns up a broken or hotlink-blocked image where the
curated source never does — if a result looks wrong once shown, try another
from the list rather than assuming the tool failed.`

const webImageSchema = {
  query: z.string().describe('What to search for, e.g. "Eiffel Tower" or "Tesla Cybertruck".'),
  count: z
    .union([z.number(), z.string()])
    .optional()
    .catch(undefined)
    .describe('How many results, 1 to 10. Default 4.'),
}

export function imagesServer() {
  return createSdkMcpServer({
    name: 'mediq_images',
    version: '1.0.0',
    instructions:
      'Two image sources: image_search (Pexels) for a generic stock subject, ' +
      'web_image_search (real web/Google Images results) for a specific ' +
      'real-world thing Pexels would not have. Put a result on a blade to ' +
      'actually show it.',
    alwaysLoad: true,
    tools: [
      tool('image_search', PEXELS_DESCRIPTION, pexelsSchema, async (args) => {
        const key = pexelsKey()
        if (!key) {
          return refuse(
            'Stock photo search is not configured on this machine — no ' +
              'PEXELS_API_KEY is set. Tell the user it needs a free API key ' +
              'added to .env.local (see .env.example) and carry on without it.',
          )
        }
        const query = String(args.query ?? '').trim()
        if (!query) return refuse('Not searched: a query is required.')
        const n = Math.max(1, Math.min(10, Number(args.count) || 4))

        const url = new URL(PEXELS_ENDPOINT)
        url.searchParams.set('query', query)
        url.searchParams.set('per_page', String(n))
        if (args.orientation) url.searchParams.set('orientation', args.orientation)

        let res
        try {
          res = await fetch(url, {
            headers: { Authorization: key },
            signal: AbortSignal.timeout(8000),
          })
        } catch (err) {
          return refuse(`Could not reach Pexels: ${err?.message ?? err}.`)
        }
        if (!res.ok) {
          const quota = res.status === 429
          return refuse(
            quota
              ? 'Image search has hit its rate limit. Tell the user to try ' +
                'again in a moment, and carry on without it.'
              : `Image search failed (${res.status}). Tell the user it is ` +
                'unavailable right now and carry on without it.',
          )
        }
        const data = await res.json()
        const photos = Array.isArray(data.photos) ? data.photos : []
        if (!photos.length) return ok(`No photos found for "${query}".`)

        const results = photos.map((p) => ({
          url: p.src?.large ?? p.src?.original,
          photographer: p.photographer ?? '',
          width: p.width,
          height: p.height,
        }))

        return ok(JSON.stringify(results, null, 1))
      }),

      tool('web_image_search', WEB_IMAGE_DESCRIPTION, webImageSchema, async (args) => {
        const key = serpapiKey()
        if (!key) {
          return refuse(
            'Web image search is not configured on this machine — no ' +
              'SERPAPI_API_KEY is set. Tell the user it needs a free API key ' +
              'added to .env.local (see .env.example) and carry on without ' +
              'it — image_search (stock photos) may still work for a ' +
              'generic version of the same request.',
          )
        }
        const query = String(args.query ?? '').trim()
        if (!query) return refuse('Not searched: a query is required.')
        const n = Math.max(1, Math.min(10, Number(args.count) || 4))

        const url = new URL(SERPAPI_ENDPOINT)
        url.searchParams.set('engine', 'google_images')
        url.searchParams.set('q', query)
        url.searchParams.set('safe', 'active')
        url.searchParams.set('api_key', key)

        let res
        try {
          res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        } catch (err) {
          return refuse(`Could not reach web image search: ${err?.message ?? err}.`)
        }
        if (!res.ok) {
          const quota = res.status === 429 || res.status === 403
          return refuse(
            quota
              ? 'Web image search has hit its monthly quota. Tell the user ' +
                'it will work again next month — image_search (stock ' +
                'photos) may still work for a generic version of the same request.'
              : `Web image search failed (${res.status}). Tell the user it ` +
                'is unavailable right now and carry on without it.',
          )
        }
        const data = await res.json()
        const items = Array.isArray(data.images_results) ? data.images_results : []
        if (!items.length) return ok(`No results for "${query}".`)

        const results = items.slice(0, n).map((it) => ({
          url: it.original,
          title: it.title ?? '',
          source: it.source ?? '',
          width: it.original_width,
          height: it.original_height,
        }))

        return ok(JSON.stringify(results, null, 1))
      }),
    ],
  })
}
