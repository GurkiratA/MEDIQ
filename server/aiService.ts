/**
 * Orchestrates provider calls: timeout (in providers.ts), one retry with
 * backoff for transient failures, and strict schema validation of every
 * response. Returns a ProviderResult whose `provider` field names exactly
 * who produced the data — the browser falls back to local rules on failure
 * and labels that fallback itself; this server never fabricates results.
 */
import type { z } from 'zod'
import {
  parseModelJson,
  SafetyAuditSchema,
  StructuredNoteSchema,
  TranslationSchema,
  type AuditRequest,
  type DocumentRequest,
  type ProviderResult,
  type ProviderStatus,
  type SafetyAudit,
  type StructuredNote,
  type TranslateRequest,
  type Translation,
} from '../shared/aiSchemas'
import { geminiConfig, hermesConfig, hostOf, redact } from './config'
import { geminiGenerate, hermesChat, ProviderError, type ChatRequest } from './providers'
import { auditPrompt, documentationPrompt, safetyAuditJsonSchema, structuredNoteJsonSchema, translationJsonSchema, translationPrompt } from './prompts'

export type RemoteProvider = 'hermes' | 'gemini'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Deps {
  hermes: (req: ChatRequest) => Promise<{ text: string; model: string }>
  gemini: (req: ChatRequest) => Promise<{ text: string; model: string }>
  retryDelayMs: number
}

const defaultDeps: Deps = { hermes: (r) => hermesChat(r), gemini: geminiGenerate, retryDelayMs: 800 }

async function callValidated<T>(provider: RemoteProvider, req: ChatRequest, schema: z.ZodType<T>, deps: Deps): Promise<ProviderResult<T>> {
  const started = Date.now()
  const call = provider === 'hermes' ? deps.hermes : deps.gemini
  let lastError = 'Unknown error'
  let model: string | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await call(req)
      model = out.model
      const parsed = parseModelJson(out.text, schema)
      if (parsed.ok) return { ok: true, provider, model, latencyMs: Date.now() - started, data: parsed.data, error: null }
      lastError = `Invalid model output: ${parsed.error}`
      // Malformed output: retry once with an explicit reminder.
      req = { ...req, user: `${req.user}\n\nREMINDER: respond with ONE JSON object that matches the required shape exactly.` }
    } catch (err) {
      const e = err instanceof ProviderError ? err : new ProviderError(String(err), 'network')
      lastError = e.message
      if (!e.retryable || attempt === 2) break
      await sleep(deps.retryDelayMs * attempt)
    }
  }
  return { ok: false, provider, model, latencyMs: Date.now() - started, data: null, error: redact(lastError) }
}

export function document(req: DocumentRequest, provider: RemoteProvider, deps: Deps = defaultDeps): Promise<ProviderResult<StructuredNote>> {
  const p = documentationPrompt(req)
  return callValidated(provider, { system: p.system, user: p.user, jsonSchema: structuredNoteJsonSchema, maxTokens: 3000 }, StructuredNoteSchema, deps)
}

export function audit(req: AuditRequest, provider: RemoteProvider, deps: Deps = defaultDeps): Promise<ProviderResult<SafetyAudit>> {
  const p = auditPrompt(req)
  return callValidated(provider, { system: p.system, user: p.user, jsonSchema: safetyAuditJsonSchema, maxTokens: 3000 }, SafetyAuditSchema, deps)
}

export function translate(req: TranslateRequest, provider: RemoteProvider, deps: Deps = defaultDeps): Promise<ProviderResult<Translation>> {
  const p = translationPrompt(req)
  return callValidated(provider, { system: p.system, user: p.user, jsonSchema: translationJsonSchema, maxTokens: 2000 }, TranslationSchema, deps)
}

export function providerStatuses(): ProviderStatus[] {
  const h = hermesConfig()
  const g = geminiConfig()
  const looksHermes = h ? /hermes/i.test(h.model) : false
  return [
    {
      id: 'hermes',
      label: h && !looksHermes ? 'DigitalOcean (OpenAI-compatible)' : 'Hermes 3 · DigitalOcean',
      configured: !!h,
      model: h?.model ?? null,
      baseUrlHost: h ? hostOf(h.baseUrl) : null,
      note: h && !looksHermes ? `Configured model "${h.model}" is not a Hermes model; it is labelled by its real name.` : null,
      keySource: h?.source ?? null,
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      configured: !!g,
      model: g?.model ?? null,
      baseUrlHost: g ? 'generativelanguage.googleapis.com' : null,
      note: null,
      keySource: g?.source ?? null,
    },
  ]
}
