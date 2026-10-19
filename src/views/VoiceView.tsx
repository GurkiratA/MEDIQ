import { clsx } from 'clsx'
import { CheckCircle2, FlaskConical, Keyboard, Languages, Loader2, Mic, MicOff, Pause, Play, Radio, ShieldCheck, Square, Volume2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { translateText } from '../ai/client'
import { SourceTag } from '../components/display'
import { Alert, Badge, Button, Card, CardHeader, Field, PageHeader } from '../components/ui'
import { VOICE_STATUS } from '../layout/TopBar'
import { relativeTime } from '../lib/format'
import { useData, useSnap } from '../state/DataContext'
import { useNav } from '../state/NavContext'
import { useNoteDrafts } from '../state/NoteDraftContext'
import { useProviders } from '../state/ProvidersContext'
import { COMMAND_HELP } from '../voice/commands'
import { loadSpeakerModel } from '../voice/speakerModel'
import { pauseSpeech, resumeSpeech, speak, stopSpeech, ttsSupported, useSpeechState, useVoices } from '../voice/tts'
import { useVoice, type SimScenario } from '../voice/VoiceContext'

const LANGUAGES = [
  { label: 'French', code: 'fr-FR' },
  { label: 'Spanish', code: 'es-ES' },
  { label: 'Punjabi', code: 'pa-IN' },
  { label: 'Hindi', code: 'hi-IN' },
  { label: 'Mandarin Chinese (Simplified)', code: 'zh-CN' },
  { label: 'Arabic', code: 'ar-SA' },
  { label: 'Tagalog', code: 'fil-PH' },
  { label: 'Portuguese', code: 'pt-PT' },
]

const DEMO_SOURCE = 'Your appointment is confirmed for tomorrow morning. Please bring a list of your current medications.'
const DEMO_TRANSLATIONS: Record<string, string> = {
  French: 'Votre rendez-vous est confirmé pour demain matin. Veuillez apporter la liste de vos médicaments actuels.',
  Spanish: 'Su cita está confirmada para mañana por la mañana. Por favor, traiga una lista de sus medicamentos actuales.',
}

export function VoiceView() {
  const voice = useVoice()
  const snap = useSnap()
  const nav = useNav()
  const [typed, setTyped] = useState('')
  const listening = voice.status === 'listening'
  const vs = VOICE_STATUS[voice.status]
  const o = voice.lastOutcome

  useEffect(() => {
    if (nav.focus === 'tts') document.getElementById('sec-tts')?.scrollIntoView({ behavior: 'smooth' })
  }, [nav.focus])

  return (
    <>
      <PageHeader title="Voice Assistant" icon={<Mic className="size-5" />} subtitle="Spoken commands run only after on-device speaker verification." />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Verified voice command" icon={<ShieldCheck className="size-4" />} actions={<Badge tone={vs.tone}>{voice.enrolling ? 'Enrolling' : vs.label}</Badge>} />
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => (listening ? voice.stopPushToTalk() : void voice.startPushToTalk())}
                disabled={voice.status === 'verification-pending' || voice.status === 'loading-model'}
                aria-pressed={listening}
                aria-label={listening ? 'Stop listening' : 'Start push-to-talk'}
                className={clsx(
                  'grid size-20 place-items-center rounded-full border-2 transition-colors disabled:opacity-60',
                  listening ? 'animate-pulse-ring border-cyan bg-cyan/20 text-cyan-soft' : 'border-teal bg-teal/15 text-teal-bright hover:bg-teal/25',
                )}
              >
                {voice.status === 'verification-pending' || voice.status === 'loading-model' ? <Loader2 className="size-8 animate-spin" /> : listening ? <MicOff className="size-8" /> : <Mic className="size-8" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-muted">{voice.statusDetail ?? (listening ? 'Listening…' : 'Press and speak — e.g. “Show the clinical summary”.')}</p>
                <p className="mt-1 min-h-6 text-lg font-medium text-ink" aria-live="polite">
                  {voice.transcript || <span className="text-ink-faint">Transcript appears here</span>}
                </p>
                {listening && (
                  <span className="mt-1 block h-1.5 w-40 overflow-hidden rounded bg-cyan/20">
                    <span className="block h-full bg-cyan" style={{ width: `${Math.round(voice.level * 100)}%` }} />
                  </span>
                )}
              </div>
            </div>

            {o && (
              <div
                className={clsx(
                  'rounded-lg border p-3',
                  o.executed ? 'border-ok/40 bg-ok/5' : o.decision && o.decision.outcome !== 'accepted' ? 'border-danger/50 bg-danger/10' : 'border-line bg-surface-2',
                )}
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {o.executed ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-danger" />}
                  <span className="font-semibold text-ink">{o.headline}</span>
                  <Badge tone={o.origin === 'typed' ? 'neutral' : 'cyan'}>{o.origin === 'typed' ? 'Typed (manual)' : o.origin === 'wake' ? 'Live · wake phrase' : 'Live microphone'}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{o.detail}</p>
                {o.command && <p className="mt-1 text-xs text-ink-faint">Intent: {o.command}</p>}
                {o.quality && (
                  <p className="mt-1 text-xs text-ink-faint">
                    Sample: {o.quality.voicedSec.toFixed(1)} s voiced · SNR ≈ {o.quality.snrDb.toFixed(0)} dB · peak {(o.quality.peak * 100).toFixed(0)}%
                  </p>
                )}
                {!o.executed && o.decision && <p className="mt-1 text-xs text-ink-faint">You may retry. Manual navigation remains available.</p>}
              </div>
            )}

            <ol className="grid gap-2 text-xs sm:grid-cols-3">
              <li className="rounded-lg border border-line bg-surface-2 p-2.5">
                <p className="font-semibold text-ink">1 · Speech recognition</p>
                <p className="text-ink-muted">What was said (browser Web Speech; may use the vendor’s online service).</p>
              </li>
              <li className="rounded-lg border border-line bg-surface-2 p-2.5">
                <p className="font-semibold text-ink">2 · Speaker verification</p>
                <p className="text-ink-muted">Who said it — on-device voiceprint, threshold {snap.settings.verificationThreshold.toFixed(2)}.</p>
              </li>
              <li className="rounded-lg border border-line bg-surface-2 p-2.5">
                <p className="font-semibold text-ink">3 · Authorization</p>
                <p className="text-ink-muted">Active, unrevoked, owner-granted access.</p>
              </li>
            </ol>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone={voice.srSupported ? 'ok' : 'warn'}>Speech recognition {voice.srSupported ? 'supported' : 'unsupported — use Chrome/Edge or type'}</Badge>
              <Badge tone={voice.micSupported ? 'ok' : 'warn'}>Microphone API {voice.micSupported ? 'available' : 'unavailable'}</Badge>
              <Badge tone={voice.modelState === 'ready' ? 'ok' : voice.modelState === 'error' ? 'danger' : 'neutral'}>
                Voice model: {voice.modelState}
                {voice.modelError ? ` — ${voice.modelError}` : ''}
              </Badge>
              {voice.modelState !== 'ready' && (
                <button type="button" className="text-cyan hover:underline" onClick={() => void loadSpeakerModel().catch(() => {})}>
                  Preload model
                </button>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <SimPanel />
          <Card>
            <CardHeader title="Typed command (manual fallback)" icon={<Keyboard className="size-4" />} />
            <form
              className="space-y-2 p-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) voice.runTyped(typed)
                setTyped('')
              }}
            >
              <input className="input" aria-label="Type a command" placeholder="e.g. show available rooms" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <Button type="submit" size="sm" disabled={!typed.trim()}>
                Run typed command
              </Button>
              <p className="text-xs text-ink-faint">Equivalent to clicking: no verification, no extra privileges.</p>
            </form>
          </Card>
          <Card>
            <CardHeader title="Experimental wake phrase" icon={<Radio className="size-4" />} />
            <div className="space-y-2 p-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-teal" checked={voice.wakeMode} onChange={(e) => voice.setWakeMode(e.target.checked)} />
                Listen for “Hey MEDIQ …”
              </label>
              <p className="text-xs text-ink-faint">
                Experimental, keeps the mic open. Every command is still speaker-verified. Say “stop listening” or show an open palm to end.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Commands" subtitle="Deterministic — no LLM is used for navigation" />
          <ul className="divide-y divide-line">
            {COMMAND_HELP.map((c) => (
              <li key={c.phrase} className="px-4 py-2 text-sm">
                <span className="font-medium text-ink">“{c.phrase}”</span>
                <span className="block text-xs text-ink-muted">{c.description}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="This session’s attempts" subtitle="No audio or transcripts are persisted" />
          {voice.history.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">No attempts yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {voice.history.map((h) => (
                <li key={h.at} className="px-4 py-2 text-xs">
                  <span className={clsx('font-medium', h.executed ? 'text-ok' : 'text-danger-soft')}>{h.headline}</span>
                  <span className="block text-ink-faint">
                    {h.origin} · {relativeTime(h.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <TtsPanel />
      </div>
      <TranslatorPanel />
    </>
  )
}

function SimPanel() {
  const voice = useVoice()
  const run = voice.simRun
  const items: { id: SimScenario; label: string }[] = [
    { id: 'authorized', label: 'Authorized doctor' },
    { id: 'unknown', label: 'Unknown speaker' },
    { id: 'revoked', label: 'Revoked doctor' },
    { id: 'dictation', label: 'Penicillin dictation' },
  ]
  return (
    <Card className="border-sim/40">
      <CardHeader title="Demo Quick-Sim" icon={<FlaskConical className="size-4 text-sim" />} actions={<Badge tone="sim">SIMULATION</Badge>} />
      <div className="space-y-3 p-4">
        <p className="text-xs text-ink-muted">Scripted scenarios for noisy venues — not live biometrics; never changes enrollment or privileges.</p>
        <div className="grid grid-cols-2 gap-2">
          {items.map((i) => (
            <Button key={i.id} size="sm" variant="sim" onClick={() => voice.runSimulation(i.id)}>
              {i.label}
            </Button>
          ))}
        </div>
        {run && (
          <div className="rounded-lg border border-sim/40 bg-sim/5 p-3" aria-live="polite">
            <p className="text-sm font-semibold text-sim">
              {run.title} · {run.outcome === 'accepted' ? 'Accepted (simulated)' : run.outcome === 'denied' ? 'Voice Not Verified: Access Denied (simulated)' : 'Scenario loaded'}
            </p>
            <ol className="mt-2 space-y-1 text-xs">
              {run.steps.map((s) => (
                <li key={s.label} className="flex gap-1.5">
                  {s.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" />}
                  <span>
                    <span className="font-medium text-ink">{s.label}:</span> <span className="text-ink-muted">{s.result}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Card>
  )
}

function TtsPanel() {
  const snap = useSnap()
  const { saveSettings } = useData()
  const nav = useNav()
  const drafts = useNoteDrafts()
  const voices = useVoices()
  const speech = useSpeechState()
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const summary = nav.patientId ? drafts.get(nav.patientId).result?.primary.note.summary : null
  return (
    <Card id="sec-tts" className="scroll-mt-24">
      <CardHeader title="Text-to-speech" icon={<Volume2 className="size-4" />} subtitle="Speaks only when you press Speak" />
      <div className="space-y-3 p-4">
        {!ttsSupported() && <Alert tone="warn">Speech synthesis is not supported in this browser.</Alert>}
        <textarea className="input min-h-20" aria-label="Text to speak" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter text to read aloud…" />
        {summary && (
          <button type="button" className="text-xs text-cyan hover:underline" onClick={() => setText(summary)}>
            Use the current draft summary for patient {nav.patientId}
          </button>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Voice" htmlFor="tts-voice">
            <select id="tts-voice" className="input" value={snap.settings.ttsVoiceURI ?? ''} onChange={(e) => void saveSettings({ ...snap.settings, ttsVoiceURI: e.target.value || null })}>
              <option value="">Browser default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Rate ${snap.settings.ttsRate.toFixed(1)}×`} htmlFor="tts-rate">
            <input id="tts-rate" type="range" min={0.5} max={1.6} step={0.1} value={snap.settings.ttsRate} onChange={(e) => void saveSettings({ ...snap.settings, ttsRate: Number(e.target.value) })} className="accent-teal" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} disabled={!text.trim()} onClick={() => speak(text, { voiceURI: snap.settings.ttsVoiceURI, rate: snap.settings.ttsRate, onError: setErr })}>
            Speak
          </Button>
          <Button size="sm" icon={<Pause className="size-3.5" />} disabled={!speech.speaking} onClick={() => (speech.paused ? resumeSpeech() : pauseSpeech())}>
            {speech.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" icon={<Square className="size-3.5" />} disabled={!speech.speaking} onClick={stopSpeech}>
            Stop
          </Button>
        </div>
        {speech.text && (
          <p className="rounded-md border border-cyan/30 bg-cyan/5 px-2 py-1.5 text-xs text-ink">
            <span className="label mr-1">Speaking:</span>
            {speech.text}
          </p>
        )}
        {err && <Alert tone="warn">{err}</Alert>}
      </div>
    </Card>
  )
}

function TranslatorPanel() {
  const snap = useSnap()
  const prov = useProviders()
  const [text, setText] = useState(DEMO_SOURCE)
  const [lang, setLang] = useState(LANGUAGES[0])
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ text: string; kind: 'ai' | 'demo'; provider?: string; model?: string | null; notes?: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const available = prov.geminiReady || prov.hermesReady
  const demoAvailable = text.trim() === DEMO_SOURCE && DEMO_TRANSLATIONS[lang.label]

  const translate = async () => {
    setBusy(true)
    setErr(null)
    setOut(null)
    const r = await translateText(text, lang.label)
    setBusy(false)
    if (r.ok && r.data) setOut({ text: r.data.translatedText, kind: 'ai', provider: r.provider, model: r.model, notes: r.data.notes })
    else setErr(r.error ?? 'Translation failed.')
  }

  return (
    <Card className="mt-4">
      <CardHeader title="Text-to-speech translator" icon={<Languages className="size-4" />} subtitle="AI-generated translations require human review and are not certified medical interpretation." />
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <textarea className="input min-h-24" aria-label="Text to translate" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Target language" htmlFor="tr-lang">
              <select id="tr-lang" className="input" value={lang.label} onChange={(e) => setLang(LANGUAGES.find((l) => l.label === e.target.value)!)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code}>{l.label}</option>
                ))}
              </select>
            </Field>
            <Button variant="primary" loading={busy} disabled={!text.trim() || !available} onClick={() => void translate()} title={!available ? 'No translation provider configured' : undefined}>
              Translate with AI
            </Button>
            {demoAvailable && (
              <Button variant="sim" onClick={() => setOut({ text: DEMO_TRANSLATIONS[lang.label], kind: 'demo' })}>
                Show pre-written demo example
              </Button>
            )}
          </div>
          {!available && (
            <Alert tone="info">
              No translation provider is configured (Gemini or a DigitalOcean endpoint). MEDIQ will not pretend to translate. For the built-in sample sentence, a clearly labelled pre-written example is available in French and Spanish.
            </Alert>
          )}
          {err && <Alert tone="warn" title="Translation unavailable">{err}</Alert>}
        </div>
        <div className="space-y-2">
          {out ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {out.kind === 'ai' ? (
                  <>
                    <Badge tone="warn">AI-generated — review before use</Badge>
                    <SourceTag kind={out.provider === 'gemini' ? 'gemini' : 'hermes'} model={out.model} />
                  </>
                ) : (
                  <Badge tone="sim">Pre-written demo example — not a live translation</Badge>
                )}
              </div>
              <p className="rounded-lg border border-line bg-surface-2 p-3 text-ink" lang={lang.code}>
                {out.text}
              </p>
              {out.notes && <p className="text-xs text-ink-muted">Translator notes: {out.notes}</p>}
              <Button size="sm" icon={<Volume2 className="size-3.5" />} onClick={() => speak(out.text, { lang: lang.code, rate: snap.settings.ttsRate, onError: setErr })}>
                Play translation
              </Button>
              <p className="text-xs text-ink-faint">Playback uses a browser voice for {lang.label} if one is installed.</p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">The translation will appear here for review.</p>
          )}
        </div>
      </div>
    </Card>
  )
}
