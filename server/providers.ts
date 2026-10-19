/**
 * Thin provider clients. Each returns raw model text; validation happens in
 * aiService.ts. Both enforce a timeout and surface typed, redacted errors.
 */
import { GoogleGenAI, ApiError } from '@google/genai'
import { geminiConfig, hermesConfig, redact, timeoutMs } from './config'

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: 'not-configured' | 'timeout' | 'rate-limited' | 'http' | 'network' | 'invalid-output',
    public readonly status: number | null = null,
  ) {
    super(redact(message))
  }
  get retryable() {
    return this.kind === 'timeout' || this.kind === 'rate-limited' || this.kind === 'network' || (this.kind === 'http' && (this.status ?? 0) >= 500)
  }
}

export interface ChatRequest {
  system: string
  user: string
  jsonSchema?: object
  maxTokens?: number
}

/* ------------------------------------------------- OpenAI-compatible (DigitalOcean / Hermes 3) */

export async function hermesChat(req: ChatRequest, fetchImpl: typeof fetch = fetch): Promise<{ text: string; model: string }> {
  const cfg = hermesConfig()
  if (!cfg) throw new ProviderError('Hermes / DigitalOcean endpoint is not configured (DO_HERMES_API_KEY and DO_HERMES_BASE_URL).', 'not-configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs())
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        max_tokens: req.maxTokens ?? 1800,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
    })
    if (res.status === 429) throw new ProviderError('Hermes endpoint rate-limited the request (HTTP 429).', 'rate-limited', 429)
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      throw new ProviderError(`Hermes endpoint returned HTTP ${res.status}${body ? `: ${body}` : ''}`, 'http', res.status)
    }
    const json = (await res.json().catch(() => null)) as { model?: string; choices?: { message?: { content?: string } }[] } | null
    const text = json?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new ProviderError('Hermes endpoint returned no message content.', 'invalid-output')
    return { text, model: json?.model || cfg.model }
  } catch (err) {
    if (err instanceof ProviderError) throw err
    if (controller.signal.aborted) throw new ProviderError(`Hermes request timed out after ${timeoutMs()} ms.`, 'timeout')
    throw new ProviderError(`Hermes request failed: ${err instanceof Error ? err.message : String(err)}`, 'network')
  } finally {
    clearTimeout(timer)
  }
}

export async function hermesListModels(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const cfg = hermesConfig()
  if (!cfg) throw new ProviderError('Hermes / DigitalOcean endpoint is not configured.', 'not-configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs(), 10000))
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/models`, { signal: controller.signal, headers: { Authorization: `Bearer ${cfg.apiKey}` } })
    if (!res.ok) throw new ProviderError(`Model list returned HTTP ${res.status}`, 'http', res.status)
    const json = (await res.json()) as { data?: { id?: string }[] }
    return (json.data ?? []).map((m) => String(m.id ?? '')).filter(Boolean)
  } catch (err) {
    if (err instanceof ProviderError) throw err
    if (controller.signal.aborted) throw new ProviderError('Model list request timed out.', 'timeout')
    throw new ProviderError(`Model list request failed: ${err instanceof Error ? err.message : String(err)}`, 'network')
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------- Google Gemini (official @google/genai SDK) */

function geminiClient() {
  const cfg = geminiConfig()
  if (!cfg) throw new ProviderError('Gemini is not configured (GEMINI_API_KEY).', 'not-configured')
  return { cfg, ai: new GoogleGenAI({ apiKey: cfg.apiKey }) }
}

function mapGeminiError(err: unknown, signal: AbortSignal): ProviderError {
  if (err instanceof ProviderError) return err
  if (signal.aborted) return new ProviderError(`Gemini request timed out after ${timeoutMs()} ms.`, 'timeout')
  if (err instanceof ApiError) {
    if (err.status === 429) return new ProviderError('Gemini rate-limited the request (HTTP 429).', 'rate-limited', 429)
    return new ProviderError(`Gemini returned HTTP ${err.status}: ${err.message.slice(0, 300)}`, 'http', err.status)
  }
  return new ProviderError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`, 'network')
}

export async function geminiGenerate(req: ChatRequest): Promise<{ text: string; model: string }> {
  const { cfg, ai } = geminiClient()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs())
  const run = (withSchema: boolean) =>
    ai.models.generateContent({
      model: cfg.model,
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      config: {
        systemInstruction: req.system,
        temperature: 0.1,
        maxOutputTokens: req.maxTokens ?? 4096,
        responseMimeType: 'application/json',
        ...(withSchema && req.jsonSchema ? { responseJsonSchema: req.jsonSchema } : {}),
        abortSignal: controller.signal,
      },
    })
  try {
    let response
    try {
      response = await run(true)
    } catch (err) {
      // Some models reject parts of a JSON schema; retry once with JSON mode only.
      if (err instanceof ApiError && err.status === 400 && req.jsonSchema && !controller.signal.aborted) response = await run(false)
      else throw err
    }
    const text = response.text
    if (!text || !text.trim()) throw new ProviderError('Gemini returned an empty response.', 'invalid-output')
    return { text, model: response.modelVersion || cfg.model }
  } catch (err) {
    throw mapGeminiError(err, controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

export async function geminiCheckModel(): Promise<{ model: string; displayName: string | null }> {
  const { cfg, ai } = geminiClient()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs(), 10000))
  try {
    const m = await ai.models.get({ model: cfg.model, config: { abortSignal: controller.signal } })
    return { model: m.name ?? cfg.model, displayName: m.displayName ?? null }
  } catch (err) {
    throw mapGeminiError(err, controller.signal)
  } finally {
    clearTimeout(timer)
  }
}
