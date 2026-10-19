import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { AuditRequestSchema, DocumentRequestSchema, TranslateRequestSchema, type ProvidersResponse } from '../shared/aiSchemas'
import { audit, document, providerStatuses, translate, type Deps, type RemoteProvider } from './aiService'
import { geminiConfig, hermesConfig, redact, setSessionConfig } from './config'
import { geminiCheckModel, hermesListModels, ProviderError } from './providers'

const ProviderParam = z.enum(['hermes', 'gemini'])

/** Very small fixed-window limiter to protect provider quotas during a demo. */
function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'local'
    const now = Date.now()
    const h = hits.get(key)
    if (!h || now > h.reset) hits.set(key, { n: 1, reset: now + windowMs })
    else if (++h.n > max) {
      res.status(429).json({ error: 'Too many AI requests — wait a moment and retry.' })
      return
    }
    next()
  }
}

const isLoopback = (addr: string | undefined) =>
  !!addr &&
  (/^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(addr) || process.env.MEDIQ_DOCKER === 'true')

/** Same-machine browser requests only, with a custom header (blocks simple cross-site form posts). */
function localClientOnly(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin')
  const originOk = !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
  if (!isLoopback(req.socket.remoteAddress) || !originOk || req.get('x-mediq-client') !== '1') {
    res.status(403).json({ error: 'Provider settings can only be changed from the local MEDIQ app.' })
    return
  }
  next()
}

export function createApp(deps?: Deps) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '64kb' }))
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
    next()
  })
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'mediq-api', time: new Date().toISOString() })
  })

  app.get('/api/ai/providers', (_req, res) => {
    const body: ProvidersResponse = { providers: providerStatuses(), serverTime: new Date().toISOString() }
    res.json(body)
  })

  const ai = express.Router()
  ai.use(rateLimit(40, 60_000))

  ai.post('/document', async (req, res) => {
    const provider = ProviderParam.safeParse(req.body?.provider)
    const body = DocumentRequestSchema.safeParse(req.body?.request)
    if (!provider.success || !body.success) return void res.status(400).json({ error: 'Invalid documentation request.' })
    res.json(await document(body.data, provider.data, deps))
  })

  ai.post('/audit', async (req, res) => {
    const provider = ProviderParam.safeParse(req.body?.provider ?? 'gemini')
    const body = AuditRequestSchema.safeParse(req.body?.request)
    if (!provider.success || !body.success) return void res.status(400).json({ error: 'Invalid audit request.' })
    res.json(await audit(body.data, provider.data, deps))
  })

  ai.post('/translate', async (req, res) => {
    const body = TranslateRequestSchema.safeParse(req.body?.request)
    if (!body.success) return void res.status(400).json({ error: 'Invalid translation request.' })
    const requested = ProviderParam.safeParse(req.body?.provider)
    const provider: RemoteProvider | null = requested.success ? requested.data : geminiConfig() ? 'gemini' : hermesConfig() ? 'hermes' : null
    if (!provider) return void res.status(503).json({ error: 'No translation provider is configured (set GEMINI_API_KEY or a DigitalOcean endpoint).' })
    res.json(await translate(body.data, provider, deps))
  })

  ai.post('/check', async (req, res) => {
    const provider = ProviderParam.safeParse(req.body?.provider)
    if (!provider.success) return void res.status(400).json({ error: 'Unknown provider.' })
    try {
      if (provider.data === 'gemini') {
        const m = await geminiCheckModel()
        res.json({ ok: true, detail: `Model available: ${m.model}${m.displayName ? ` (${m.displayName})` : ''}` })
      } else {
        const models = await hermesListModels()
        const configured = hermesConfig()?.model ?? ''
        const listed = models.includes(configured)
        res.json({
          ok: true,
          detail: `${models.length} model(s) listed by endpoint. Configured "${configured}" ${listed ? 'is' : 'is NOT'} in the list.${models.length ? ` e.g. ${models.slice(0, 5).join(', ')}` : ''}`,
        })
      }
    } catch (err) {
      const e = err instanceof ProviderError ? err : new ProviderError(String(err), 'network')
      res.json({ ok: false, detail: redact(e.message) })
    }
  })

  const SessionConfigSchema = z.object({
    hermes: z.object({ apiKey: z.string().max(400).optional(), baseUrl: z.string().url().max(400).optional().or(z.literal('')), model: z.string().max(200).optional() }).nullable().optional(),
    gemini: z.object({ apiKey: z.string().max(400).optional(), model: z.string().max(200).optional() }).nullable().optional(),
  })

  ai.post('/session-config', localClientOnly, (req, res) => {
    const body = SessionConfigSchema.safeParse(req.body)
    if (!body.success) return void res.status(400).json({ error: 'Invalid provider settings.' })
    setSessionConfig(body.data)
    res.json({ ok: true, providers: providerStatuses() })
  })

  app.use('/api/ai', ai)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Production: serve the built SPA.
  const dist = join(process.cwd(), 'dist')
  if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')))
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'Internal error'
    res.status(500).json({ error: redact(msg) })
  })

  return app
}
