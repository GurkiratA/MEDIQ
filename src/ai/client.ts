/**
 * Browser-side AI orchestration. All provider calls go to the local Node
 * backend (/api/ai/*) — API keys never reach the browser. Every result
 * carries its true source: a local fallback is always labelled as local.
 */
import type {
  AuditRequest,
  DocumentRequest,
  PatientContext,
  ProviderId,
  ProviderMode,
  ProviderResult,
  ProvidersResponse,
  SafetyAudit,
  StructuredNote,
  Translation,
} from '../../shared/aiSchemas'
import { SafetyAuditSchema, StructuredNoteSchema, TranslationSchema } from '../../shared/aiSchemas'
import { localAudit, localDocument } from './localEngine'

const CLIENT_TIMEOUT_MS = 45000

async function postJson<T>(path: string, body: unknown, timeoutMs = CLIENT_TIMEOUT_MS): Promise<{ status: number; json: T | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MEDIQ-Client': '1' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => null)) as T | null
    return { status: res.status, json }
  } catch (err) {
    if (controller.signal.aborted) throw new Error('The AI request timed out in the browser.')
    throw new Error(`The local MEDIQ API is unreachable (${err instanceof Error ? err.message : String(err)}). Is "npm run dev" running?`)
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchProviders(): Promise<ProvidersResponse | null> {
  try {
    const res = await fetch('/api/ai/providers', { headers: { 'X-MEDIQ-Client': '1' } })
    if (!res.ok) return null
    return (await res.json()) as ProvidersResponse
  } catch {
    return null
  }
}

export async function checkProvider(provider: 'hermes' | 'gemini'): Promise<{ ok: boolean; detail: string }> {
  try {
    const { json } = await postJson<{ ok: boolean; detail: string }>('/api/ai/check', { provider }, 15000)
    return json ?? { ok: false, detail: 'No response from the local API.' }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function setSessionKeys(body: {
  hermes?: { apiKey?: string; baseUrl?: string; model?: string } | null
  gemini?: { apiKey?: string; model?: string } | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { status, json } = await postJson<{ ok?: boolean; error?: string }>('/api/ai/session-config', body, 10000)
    return status === 200 ? { ok: true } : { ok: false, error: json?.error ?? `HTTP ${status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function callRemote<T>(path: string, provider: 'hermes' | 'gemini', request: unknown, validate: (d: unknown) => T | null): Promise<ProviderResult<T>> {
  const started = performance.now()
  try {
    const { status, json } = await postJson<ProviderResult<unknown> & { error?: string }>(path, { provider, request })
    if (!json) return { ok: false, provider, model: null, latencyMs: performance.now() - started, data: null, error: `HTTP ${status} with no body` }
    if (!json.ok || json.data === null) return { ok: false, provider, model: json.model ?? null, latencyMs: json.latencyMs ?? 0, data: null, error: json.error ?? `HTTP ${status}` }
    // Re-validate in the browser: model output is untrusted even after the server checked it.
    const data = validate(json.data)
    if (!data) return { ok: false, provider, model: json.model, latencyMs: json.latencyMs, data: null, error: 'Response failed browser-side schema validation.' }
    return { ok: true, provider, model: json.model, latencyMs: json.latencyMs, data, error: null }
  } catch (err) {
    return { ok: false, provider, model: null, latencyMs: performance.now() - started, data: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface PrimaryResult {
  source: ProviderId
  model: string | null
  note: StructuredNote
  latencyMs: number
  /** Set when a remote provider was attempted and failed; `source` is then 'local'. */
  fallbackReason: string | null
  attempted: 'hermes' | 'gemini' | null
}

export interface AuditResult {
  source: 'gemini' | 'hermes'
  model: string | null
  audit: SafetyAudit
  latencyMs: number
}

export interface GenerationResult {
  at: string
  mode: ProviderMode
  primary: PrimaryResult
  audit: AuditResult | null
  auditUnavailableReason: string | null
  /** Deterministic rules — always run, independent of any model. */
  localAudit: SafetyAudit
}

const docProviderFor = (mode: ProviderMode): 'hermes' | 'gemini' | null => (mode === 'hybrid' || mode === 'hermes' ? 'hermes' : mode === 'gemini' ? 'gemini' : null)
const auditProviderFor = (mode: ProviderMode): 'gemini' | null => (mode === 'hybrid' || mode === 'gemini' ? 'gemini' : null)

export async function generate(mode: ProviderMode, noteText: string, patient: PatientContext, onStage?: (stage: string) => void): Promise<GenerationResult> {
  const localAud = localAudit(noteText, null, patient)
  const docProvider = docProviderFor(mode)
  let primary: PrimaryResult
  if (docProvider) {
    onStage?.(`Model A: requesting structured note from ${docProvider === 'hermes' ? 'Hermes / DigitalOcean' : 'Gemini'}…`)
    const req: DocumentRequest = { noteText, patient }
    const r = await callRemote('/api/ai/document', docProvider, req, (d) => {
      const p = StructuredNoteSchema.safeParse(d)
      return p.success ? p.data : null
    })
    primary = r.ok && r.data
      ? { source: docProvider, model: r.model, note: r.data, latencyMs: r.latencyMs, fallbackReason: null, attempted: docProvider }
      : { source: 'local', model: null, note: localDocument(noteText, patient), latencyMs: 0, fallbackReason: r.error ?? 'Unknown error', attempted: docProvider }
  } else {
    primary = { source: 'local', model: null, note: localDocument(noteText, patient), latencyMs: 0, fallbackReason: null, attempted: null }
  }

  const auditProvider = auditProviderFor(mode)
  let audit: AuditResult | null = null
  let auditUnavailableReason: string | null = null
  if (auditProvider) {
    onStage?.('Model B: requesting independent safety audit from Gemini…')
    const req: AuditRequest = { noteText, draft: primary.note, patient }
    const r = await callRemote('/api/ai/audit', auditProvider, req, (d) => {
      const p = SafetyAuditSchema.safeParse(d)
      return p.success ? p.data : null
    })
    if (r.ok && r.data) audit = { source: auditProvider, model: r.model, audit: r.data, latencyMs: r.latencyMs }
    else auditUnavailableReason = r.error ?? 'Unknown error'
  } else {
    auditUnavailableReason = mode === 'local' ? 'Local Demo Fallback mode selected — no AI auditor was called.' : 'Gemini auditor not selected in this provider mode.'
  }
  return { at: new Date().toISOString(), mode, primary, audit, auditUnavailableReason, localAudit: localAud }
}

export async function translateText(text: string, targetLanguage: string): Promise<ProviderResult<Translation>> {
  const started = performance.now()
  try {
    const { status, json } = await postJson<ProviderResult<unknown> & { error?: string }>('/api/ai/translate', { request: { text, targetLanguage } })
    if (status === 503) return { ok: false, provider: 'local', model: null, latencyMs: 0, data: null, error: json?.error ?? 'No translation provider is configured.' }
    if (!json || !json.ok) return { ok: false, provider: (json?.provider as ProviderId) ?? 'local', model: json?.model ?? null, latencyMs: performance.now() - started, data: null, error: json?.error ?? `HTTP ${status}` }
    const parsed = TranslationSchema.safeParse(json.data)
    if (!parsed.success) return { ok: false, provider: json.provider, model: json.model, latencyMs: json.latencyMs, data: null, error: 'Translation failed schema validation.' }
    return { ok: true, provider: json.provider, model: json.model, latencyMs: json.latencyMs, data: parsed.data, error: null }
  } catch (err) {
    return { ok: false, provider: 'local', model: null, latencyMs: 0, data: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export const providerLabel = (p: ProviderId | 'hermes' | 'gemini', model?: string | null) =>
  p === 'local' ? 'Local Deterministic Rules' : p === 'gemini' ? `Google Gemini${model ? ` (${model})` : ''}` : `${model && !/hermes/i.test(model) ? 'DigitalOcean' : 'Hermes 3 · DigitalOcean'}${model ? ` (${model})` : ''}`
