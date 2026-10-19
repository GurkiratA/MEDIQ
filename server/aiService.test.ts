// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audit, document, type Deps } from './aiService'
import { ProviderError } from './providers'
import { createApp } from './app'
import { redact } from './config'
import type { DocumentRequest } from '../shared/aiSchemas'

const patient: DocumentRequest['patient'] = {
  patientId: '104',
  synthetic: true,
  age: 42,
  gender: 'Male',
  allergies: [{ substance: 'Penicillin', substanceClass: 'Penicillins', reaction: 'Anaphylaxis', severity: 'Severe', status: 'Active' }],
  medications: [],
  history: [],
  latestVitals: null,
}
const req: DocumentRequest = { noteText: 'Proposed amoxicillin 500 mg.', patient }

const validNote = {
  summary: 's',
  chiefComplaint: 'c',
  soap: { subjective: 'a', objective: 'b', assessment: 'c', plan: 'd' },
  reportedSymptoms: [],
  relevantHistory: [],
  medicationsMentioned: [{ name: 'Amoxicillin', dose: '500 mg', route: null, frequency: null, duration: null, status: 'proposed-in-draft' }],
  allergiesMentioned: [],
  documentedFindings: [],
  followUpItems: [],
  missingInformation: [],
  discrepancies: [],
  safetyAlerts: [],
  reviewRequired: true,
}

const deps = (impl: Deps['hermes']): Deps => ({ hermes: impl, gemini: impl, retryDelayMs: 1 })

afterEach(() => {
  delete process.env.GEMINI_API_KEY
  delete process.env.DO_HERMES_API_KEY
  delete process.env.DO_HERMES_BASE_URL
})

describe('aiService', () => {
  it('accepts schema-valid JSON, even inside code fences', async () => {
    const r = await document(req, 'hermes', deps(async () => ({ text: '```json\n' + JSON.stringify(validNote) + '\n```', model: 'm' })))
    expect(r.ok).toBe(true)
    expect(r.provider).toBe('hermes')
    expect(r.data?.medicationsMentioned[0].name).toBe('Amoxicillin')
  })

  it('rejects malformed output after one retry', async () => {
    const call = vi.fn(async () => ({ text: '{"summary": 3}', model: 'm' }))
    const r = await document(req, 'gemini', deps(call))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/schema validation/)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('retries transient failures once, then reports the error', async () => {
    const call = vi.fn(async () => {
      throw new ProviderError('timed out', 'timeout')
    })
    const r = await audit({ noteText: 'x', draft: null, patient }, 'gemini', deps(call))
    expect(r.ok).toBe(false)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the provider is not configured', async () => {
    const call = vi.fn(async () => {
      throw new ProviderError('not configured', 'not-configured')
    })
    const r = await document(req, 'hermes', deps(call))
    expect(r.ok).toBe(false)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('redacts configured secrets from error text', () => {
    process.env.GEMINI_API_KEY = 'AIzaSySECRETSECRET123'
    expect(redact('failed for key AIzaSySECRETSECRET123 at ?key=abc')).not.toMatch(/SECRET|abc/)
    expect(redact('Authorization: Bearer sk-live-123456')).toBe('Authorization: Bearer [redacted]')
  })
})

describe('HTTP API', () => {
  async function withServer<T>(fn: (base: string) => Promise<T>, d?: Deps): Promise<T> {
    const server = createApp(d).listen(0, '127.0.0.1')
    await new Promise((r) => server.once('listening', r))
    const { port } = server.address() as { port: number }
    try {
      return await fn(`http://127.0.0.1:${port}`)
    } finally {
      server.close()
    }
  }

  it('starts and reports providers as not configured without credentials', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/health`)).ok).toBe(true)
      const body = (await (await fetch(`${base}/api/ai/providers`)).json()) as { providers: { configured: boolean }[] }
      expect(body.providers.every((p: { configured: boolean }) => !p.configured)).toBe(true)
      expect(JSON.stringify(body)).not.toMatch(/apiKey/i)
    })
  })

  it('returns 503 for translation with no provider configured', async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/api/ai/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: { text: 'hello', targetLanguage: 'French' } }) })
      expect(r.status).toBe(503)
    })
  })

  it('rejects invalid request bodies', async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/api/ai/document`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'hermes', request: { noteText: '' } }) })
      expect(r.status).toBe(400)
    })
  })

  it('never echoes session keys back', async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/api/ai/session-config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mediq-client': '1' },
        body: JSON.stringify({ gemini: { apiKey: 'AIzaSyTESTKEY000000', model: 'gemini-flash-latest' } }),
      })
      const text = await r.text()
      expect(r.ok).toBe(true)
      expect(text).not.toContain('AIzaSyTESTKEY000000')
      expect(text).toContain('"keySource":"session"')
      // clear for other tests
      await fetch(`${base}/api/ai/session-config`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mediq-client': '1' }, body: JSON.stringify({ gemini: null, hermes: null }) })
    })
  })

  it('refuses session-config without the local client header', async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/api/ai/session-config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gemini: { apiKey: 'x' } }) })
      expect(r.status).toBe(403)
    })
  })
})
