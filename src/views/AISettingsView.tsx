import { BrainCircuit, KeyRound, PlugZap, RefreshCw, Server } from 'lucide-react'
import { useState } from 'react'
import type { ProviderMode } from '../../shared/aiSchemas'
import { checkProvider, setSessionKeys } from '../ai/client'
import { Alert, Badge, Button, Card, CardHeader, Field, PageHeader } from '../components/ui'
import { useData, useSnap } from '../state/DataContext'
import { useProviders } from '../state/ProvidersContext'
import { useToast } from '../state/ToastContext'

const MODES: { id: ProviderMode; title: string; body: string }[] = [
  { id: 'hybrid', title: 'Hybrid Consensus', body: 'Model A (Hermes 3 / DigitalOcean) drafts; Model B (Gemini) audits independently; local rules always run. Results shown side by side.' },
  { id: 'hermes', title: 'Hermes 3 / DigitalOcean', body: 'Model A drafts; safety audit uses local deterministic rules only.' },
  { id: 'gemini', title: 'Gemini', body: 'Gemini drafts and, in a separate call, audits. Local rules always run too.' },
  { id: 'local', title: 'Local Demo Fallback', body: 'No AI calls. Deterministic, labelled local rules only — works with no keys and no network.' },
]

export function AISettingsView() {
  const snap = useSnap()
  const { saveSettings } = useData()
  const prov = useProviders()
  const toast = useToast()
  const [checks, setChecks] = useState<Record<string, { ok: boolean; detail: string } | 'loading'>>({})
  const [form, setForm] = useState({ hermesKey: '', hermesUrl: '', hermesModel: '', geminiKey: '', geminiModel: '' })
  const [saving, setSaving] = useState(false)

  const test = async (id: 'hermes' | 'gemini') => {
    setChecks((c) => ({ ...c, [id]: 'loading' }))
    const r = await checkProvider(id)
    setChecks((c) => ({ ...c, [id]: r }))
  }

  const submitKeys = async () => {
    setSaving(true)
    const body: Parameters<typeof setSessionKeys>[0] = {}
    if (form.hermesKey || form.hermesUrl || form.hermesModel) body.hermes = { apiKey: form.hermesKey || undefined, baseUrl: form.hermesUrl || undefined, model: form.hermesModel || undefined }
    if (form.geminiKey || form.geminiModel) body.gemini = { apiKey: form.geminiKey || undefined, model: form.geminiModel || undefined }
    const r = await setSessionKeys(body)
    setSaving(false)
    // Never keep secrets in browser state longer than necessary.
    setForm({ hermesKey: '', hermesUrl: '', hermesModel: '', geminiKey: '', geminiModel: '' })
    if (r.ok) {
      toast({ tone: 'ok', title: 'Sent to local server memory', body: 'Keys are held only by the local Node process for this session.' })
      await prov.refresh()
    } else toast({ tone: 'error', title: 'Could not update provider settings', body: r.error })
  }

  const clearSession = async () => {
    const r = await setSessionKeys({ hermes: null, gemini: null })
    if (r.ok) {
      toast({ tone: 'info', title: 'Session keys cleared', body: 'Environment-variable configuration (if any) still applies.' })
      await prov.refresh()
    }
  }

  return (
    <>
      <PageHeader title="AI Provider Settings" icon={<BrainCircuit className="size-5" />} subtitle="Optional providers enhance MEDIQ; none is required to run it." actions={<Button size="sm" icon={<RefreshCw className="size-4" />} onClick={() => void prov.refresh()}>Refresh status</Button>} />

      {prov.apiReachable === false && (
        <div className="mb-4">
          <Alert tone="warn" title="Local API unreachable">
            Start it with <code className="font-mono">npm run dev</code> (runs the web app and API together). Until then every AI feature uses labelled local fallbacks.
          </Alert>
        </div>
      )}

      <Card>
        <CardHeader title="Provider mode" />
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="AI provider mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={snap.settings.providerMode === m.id}
              onClick={() => void saveSettings({ ...snap.settings, providerMode: m.id })}
              className={`rounded-lg border p-3 text-left transition-colors ${snap.settings.providerMode === m.id ? 'border-cyan bg-cyan/10' : 'border-line bg-surface-2 hover:border-line-strong'}`}
            >
              <p className="text-sm font-semibold text-ink">{m.title}</p>
              <p className="mt-1 text-xs text-ink-muted">{m.body}</p>
            </button>
          ))}
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
          Effective now: Model A → <span className="text-ink">{prov.effective.documentation}</span> · Model B → <span className="text-ink">{prov.effective.audit}</span>
          {prov.fallbackActive && <Badge tone="warn" className="ml-2">fallback active</Badge>}. Neither model can save notes, change rooms, authorize speakers or act clinically.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {prov.providers.length === 0 && <Card className="p-4 text-sm text-ink-muted">Provider status unavailable (API offline).</Card>}
        {prov.providers.map((p) => {
          const c = checks[p.id]
          return (
            <Card key={p.id}>
              <CardHeader
                title={p.label}
                icon={<Server className="size-4" />}
                subtitle={p.id === 'hermes' ? 'Model A · structured documentation (OpenAI-compatible endpoint)' : 'Model B · independent safety audit (official @google/genai SDK)'}
                actions={<Badge tone={p.configured ? 'ok' : 'neutral'}>{p.configured ? 'Configured' : 'Not configured'}</Badge>}
              />
              <div className="space-y-2 p-4 text-sm">
                <p className="text-ink-muted">Model: <span className="font-mono text-ink">{p.model ?? '—'}</span></p>
                <p className="text-ink-muted">Endpoint host: <span className="font-mono text-ink">{p.baseUrlHost ?? '—'}</span></p>
                <p className="text-ink-muted">Key source: <span className="text-ink">{p.keySource === 'env' ? 'server environment variable' : p.keySource === 'session' ? 'server memory (this session)' : 'none'}</span></p>
                {p.note && <Alert tone="info">{p.note}</Alert>}
                <Button size="sm" icon={<PlugZap className="size-3.5" />} disabled={!p.configured} loading={c === 'loading'} onClick={() => void test(p.id)}>
                  Test connection & model
                </Button>
                {c && c !== 'loading' && <Alert tone={c.ok ? 'ok' : 'warn'}>{c.detail}</Alert>}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="mt-4">
        <CardHeader title="Session credentials (optional)" icon={<KeyRound className="size-4" />} subtitle="Preferred: set server-only environment variables in .env (see .env.example)." />
        <div className="space-y-4 p-4">
          <Alert tone="info">
            Values entered here are sent once to the local MEDIQ server (127.0.0.1) and kept only in that process’s memory until it restarts. They are never stored in the browser, never returned by the API, and never logged. Never use <code className="font-mono">VITE_</code>-prefixed variables for secrets — Vite exposes those to the browser.
          </Alert>
          <form
            className="grid gap-3 md:grid-cols-2"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault()
              void submitKeys()
            }}
          >
            <Field label="DigitalOcean / Hermes base URL" htmlFor="h-url" hint="e.g. https://inference.do-ai.run/v1 or http://<droplet-ip>/v1">
              <input id="h-url" className="input" value={form.hermesUrl} onChange={(e) => setForm({ ...form, hermesUrl: e.target.value })} placeholder="https://…/v1" />
            </Field>
            <Field label="Hermes model ID" htmlFor="h-model" hint="Verify with “Test connection”, which lists the endpoint’s models.">
              <input id="h-model" className="input" value={form.hermesModel} onChange={(e) => setForm({ ...form, hermesModel: e.target.value })} placeholder="NousResearch/Hermes-3-Llama-3.1-8B" />
            </Field>
            <Field label="DigitalOcean / Hermes API key" htmlFor="h-key">
              <input id="h-key" className="input" type="password" value={form.hermesKey} onChange={(e) => setForm({ ...form, hermesKey: e.target.value })} autoComplete="new-password" />
            </Field>
            <div />
            <Field label="Gemini API key" htmlFor="g-key">
              <input id="g-key" className="input" type="password" value={form.geminiKey} onChange={(e) => setForm({ ...form, geminiKey: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Gemini model" htmlFor="g-model" hint="Default gemini-flash-latest (Google’s alias). gemini-2.0-flash was shut down on 2026-06-01.">
              <input id="g-model" className="input" value={form.geminiModel} onChange={(e) => setForm({ ...form, geminiModel: e.target.value })} placeholder="gemini-flash-latest" />
            </Field>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" variant="primary" loading={saving} disabled={!Object.values(form).some(Boolean)}>
                Send to local server memory
              </Button>
              <Button variant="ghost" onClick={() => void clearSession()}>
                Clear session credentials
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </>
  )
}
