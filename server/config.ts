/**
 * Server-only provider configuration. Secrets come from environment
 * variables (preferred) or from the in-app settings form, in which case they
 * live ONLY in this process's memory for the current session. Keys are never
 * returned to the browser, logged, or written to disk.
 */
export interface HermesConfig {
  apiKey: string
  baseUrl: string
  model: string
  source: 'env' | 'session'
}

export interface GeminiConfig {
  apiKey: string
  model: string
  source: 'env' | 'session'
}

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest'
export const DEFAULT_HERMES_MODEL = 'NousResearch/Hermes-3-Llama-3.1-8B'

const session: { hermes: Partial<HermesConfig> | null; gemini: Partial<GeminiConfig> | null } = { hermes: null, gemini: null }

const env = (k: string) => (process.env[k] ?? '').trim()

export function timeoutMs(): number {
  const n = Number(env('AI_TIMEOUT_MS'))
  return Number.isFinite(n) && n >= 2000 && n <= 120000 ? n : 20000
}

export function hermesConfig(): HermesConfig | null {
  const s = session.hermes
  const apiKey = s?.apiKey || env('DO_HERMES_API_KEY')
  const baseUrl = (s?.baseUrl || env('DO_HERMES_BASE_URL')).replace(/\/+$/, '')
  const model = s?.model || env('DO_HERMES_MODEL') || DEFAULT_HERMES_MODEL
  if (!apiKey || !baseUrl) return null
  return { apiKey, baseUrl, model, source: s?.apiKey ? 'session' : 'env' }
}

export function geminiConfig(): GeminiConfig | null {
  const s = session.gemini
  const apiKey = s?.apiKey || env('GEMINI_API_KEY')
  const model = s?.model || env('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL
  if (!apiKey) return null
  return { apiKey, model, source: s?.apiKey ? 'session' : 'env' }
}

export function setSessionConfig(input: {
  hermes?: { apiKey?: string; baseUrl?: string; model?: string } | null
  gemini?: { apiKey?: string; model?: string } | null
}) {
  if (input.hermes === null) session.hermes = null
  else if (input.hermes) session.hermes = { ...session.hermes, ...stripEmpty(input.hermes) }
  if (input.gemini === null) session.gemini = null
  else if (input.gemini) session.gemini = { ...session.gemini, ...stripEmpty(input.gemini) }
}

function stripEmpty<T extends Record<string, string | undefined>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim() !== '').map(([k, v]) => [k, v!.trim()])) as Partial<T>
}

/** Removes any configured secret from a string before it leaves the server. */
export function redact(message: string): string {
  let out = message
  for (const secret of [hermesConfig()?.apiKey, geminiConfig()?.apiKey, env('DO_HERMES_API_KEY'), env('GEMINI_API_KEY')]) {
    if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]')
  }
  // Generic key-looking query parameters / bearer tokens.
  return out.replace(/(key=)[^&\s"']+/gi, '$1[redacted]').replace(/(Bearer\s+)[A-Za-z0-9._\-~+/=]+/g, '$1[redacted]')
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
