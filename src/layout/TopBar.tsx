import { clsx } from 'clsx'
import {
  BrainCircuit,
  Camera,
  CameraOff,
  ChevronDown,
  FlaskConical,
  Loader2,
  Menu,
  Mic,
  MicOff,
  Pause,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Square,
  UserRound,
  Volume2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderMode } from '../../shared/aiSchemas'
import { Badge, type Tone } from '../components/ui'
import { useGestures } from '../gestures/GestureContext'
import { useData, useSnap } from '../state/DataContext'
import { useNav } from '../state/NavContext'
import { useProviders } from '../state/ProvidersContext'
import { useToast } from '../state/ToastContext'
import { pauseSpeech, resumeSpeech, stopSpeech, useSpeechState } from '../voice/tts'
import { useVoice, type SimScenario, type VoiceStatus } from '../voice/VoiceContext'

export const VOICE_STATUS: Record<VoiceStatus, { label: string; tone: Tone }> = {
  'not-enrolled': { label: 'Not Enrolled', tone: 'neutral' },
  ready: { label: 'Enrolled · verify per command', tone: 'teal' },
  'loading-model': { label: 'Loading voice model', tone: 'cyan' },
  listening: { label: 'Listening', tone: 'cyan' },
  'verification-pending': { label: 'Verification Pending', tone: 'warn' },
  verified: { label: 'Verified', tone: 'ok' },
  'unknown-speaker': { label: 'Unknown Speaker', tone: 'danger' },
  'access-denied': { label: 'Access Denied', tone: 'danger' },
  unavailable: { label: 'Verification Unavailable', tone: 'warn' },
}

const MODES: { id: ProviderMode; label: string }[] = [
  { id: 'hybrid', label: 'Hybrid Consensus' },
  { id: 'hermes', label: 'Hermes 3 / DigitalOcean' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'local', label: 'Local Demo Fallback' },
]

const SIMS: { id: SimScenario; label: string; hint: string }[] = [
  { id: 'authorized', label: 'Simulate Authorized Doctor', hint: '“Open patient 104” — accepted' },
  { id: 'unknown', label: 'Simulate Unknown Speaker', hint: '“Open patient 104” — rejected' },
  { id: 'revoked', label: 'Simulate Revoked Doctor', hint: '“Open patient 104” — rejected' },
  { id: 'dictation', label: 'Simulate Clinical Dictation', hint: 'Penicillin contraindication scenario' },
]

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onOut()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOut()
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [ref, onOut, active])
}

function PatientSearch() {
  const snap = useSnap()
  const nav = useNav()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useOutside(box, () => setOpen(false), open)
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return snap.patients.filter((p) => p.id.includes(t) || p.fullName.toLowerCase().includes(t)).slice(0, 6)
  }, [q, snap.patients])
  const go = (id: string) => {
    nav.navigate({ view: 'patients', patientId: id, patientTab: 'overview' })
    setQ('')
    setOpen(false)
  }
  return (
    <div ref={box} className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && q.length > 0}
        aria-controls="patient-search-results"
        aria-label="Search synthetic patients by ID or name"
        placeholder="Search patients…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setIdx(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, results.length - 1))
          if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0))
          if (e.key === 'Enter' && results[idx]) go(results[idx].id)
        }}
        className="input h-9 pl-8"
      />
      {open && q.trim() && (
        <ul id="patient-search-results" role="listbox" className="card absolute left-0 right-0 top-11 z-50 max-h-72 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No synthetic patients match “{q}”.</li>}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === idx}>
              <button type="button" onClick={() => go(p.id)} className={clsx('flex w-full items-center justify-between px-3 py-2 text-left text-sm', i === idx ? 'bg-surface-3' : 'hover:bg-surface-3')}>
                <span>
                  <span className="font-mono text-cyan">{p.id}</span> · {p.fullName}
                </span>
                <Badge tone="sim">Synthetic</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Dropdown({ label, icon, children, tone = 'neutral' }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; tone?: 'neutral' | 'sim' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false), open)
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium',
          tone === 'sim' ? 'border-sim/40 bg-sim/10 text-sim hover:bg-sim/20' : 'border-line-strong bg-surface-2 text-ink-muted hover:text-ink',
        )}
      >
        {icon}
        <span className="hidden xl:inline">{label}</span>
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-11 z-50 w-72 p-1.5">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { saveSettings } = useData()
  const snap = useSnap()
  const voice = useVoice()
  const gestures = useGestures()
  const prov = useProviders()
  const nav = useNav()
  const toast = useToast()
  const speech = useSpeechState()
  const owner = snap.doctors.find((d) => d.role === 'Owner')

  const vs = voice.enrolling ? { label: 'Enrolling', tone: 'cyan' as Tone } : VOICE_STATUS[voice.status]
  const listening = voice.status === 'listening'
  const VoiceIcon = voice.status === 'verified' ? ShieldCheck : voice.status === 'access-denied' || voice.status === 'unknown-speaker' ? ShieldAlert : ShieldQuestion

  // Keyboard shortcut: Alt+V toggles push-to-talk.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        if (listening) voice.stopPushToTalk()
        else void voice.startPushToTalk()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [listening, voice])

  const camTone: Tone = gestures.status === 'tracking' ? 'ok' : gestures.status === 'error' ? 'danger' : gestures.status === 'off' ? 'neutral' : 'cyan'

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <button type="button" onClick={onMenu} className="rounded-md p-2 text-ink-muted hover:bg-surface-3 lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
        <button type="button" onClick={() => nav.navigate({ view: 'overview' })} className="flex items-center gap-2 pr-2" aria-label="MEDIQ home">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-teal to-cyan text-sm font-black text-white">M</span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-sm font-bold tracking-[0.18em] text-ink">MEDIQ</span>
            <span className="text-[10px] text-ink-faint">Clinical Co-Pilot</span>
          </span>
        </button>
        <Badge tone="sim" className="hidden uppercase sm:inline-flex">
          Synthetic data
        </Badge>
        <span className="hidden items-center gap-1.5 text-[11px] text-ink-muted md:flex" title={prov.apiReachable ? 'Local database and API online' : 'Local API unreachable — local-only mode'}>
          <span className={clsx('size-2 rounded-full', prov.apiReachable === false ? 'bg-warn' : 'bg-ok')} />
          {prov.apiReachable === false ? 'Local-only' : 'Online'}
        </span>

        <div className="order-last w-full md:order-none md:ml-2 md:w-auto md:flex-1">
          <PatientSearch />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {/* Push-to-talk */}
          <button
            type="button"
            onClick={() => (listening ? voice.stopPushToTalk() : void voice.startPushToTalk())}
            disabled={voice.status === 'verification-pending' || voice.status === 'loading-model'}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening (Alt+V)' : 'Push to talk — voice command with speaker verification (Alt+V)'}
            title="Push to talk (Alt+V)"
            className={clsx(
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-60',
              listening ? 'animate-pulse-ring border-cyan bg-cyan/20 text-cyan-soft' : 'border-teal/50 bg-teal/15 text-teal-bright hover:bg-teal/25',
            )}
          >
            {voice.status === 'verification-pending' || voice.status === 'loading-model' ? <Loader2 className="size-4 animate-spin" /> : listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            <span className="hidden sm:inline">{listening ? 'Stop' : 'Talk'}</span>
          </button>

          <button
            type="button"
            onClick={() => nav.navigate({ view: 'voice' })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2 text-xs"
            title={voice.statusDetail ?? vs.label}
            aria-label={`Voice verification status: ${vs.label}`}
          >
            <VoiceIcon className="size-4 text-ink-muted" />
            <Badge tone={vs.tone}>{vs.label}</Badge>
          </button>

          <button
            type="button"
            onClick={() => (gestures.status === 'off' || gestures.status === 'error' ? void gestures.enable() : gestures.disable())}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2 text-xs"
            aria-label={gestures.status === 'off' ? 'Enable camera gesture control' : 'Disable camera gesture control'}
            title={gestures.error ?? 'Camera & gesture control (processed locally)'}
          >
            {gestures.status === 'off' || gestures.status === 'error' ? <CameraOff className="size-4 text-ink-muted" /> : <Camera className="size-4 text-cyan" />}
            <Badge tone={camTone}>
              {gestures.status === 'off' ? 'Gestures off' : gestures.status === 'error' ? 'Camera error' : gestures.status === 'starting' ? 'Starting…' : gestures.status === 'tracking' ? 'Hand tracked' : 'No hand'}
            </Badge>
          </button>

          <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2 text-xs" title="AI provider mode">
            <BrainCircuit className="size-4 text-ink-muted" />
            <span className="sr-only">AI provider</span>
            <select
              value={snap.settings.providerMode}
              onChange={async (e) => {
                await saveSettings({ ...snap.settings, providerMode: e.target.value as ProviderMode })
                toast({ tone: 'info', title: 'AI provider mode changed', body: MODES.find((m) => m.id === e.target.value)?.label })
              }}
              className="bg-transparent text-xs text-ink focus:outline-none"
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id} className="bg-surface">
                  {m.label}
                </option>
              ))}
            </select>
            {prov.fallbackActive || snap.settings.providerMode === 'local' ? <Badge tone="warn">Local fallback</Badge> : <Badge tone="ok">Live</Badge>}
          </label>

          <Dropdown label="Demo Quick-Sim" icon={<FlaskConical className="size-4" />} tone="sim">
            {(close) => (
              <>
                <p className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-ink-muted">
                  <span className="font-semibold text-sim">SIMULATION</span> — scripted demonstrations, not live biometric tests. They never change enrollment or grant privileges.
                </p>
                {SIMS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      voice.runSimulation(s.id)
                      if (s.id === 'unknown' || s.id === 'revoked') nav.navigate({ view: 'voice' })
                      close()
                    }}
                    className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-surface-3"
                  >
                    <span className="text-sm text-ink">{s.label}</span>
                    <span className="text-[11px] text-ink-faint">{s.hint}</span>
                  </button>
                ))}
              </>
            )}
          </Dropdown>

          {speech.speaking ? (
            <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-cyan/40 bg-cyan/10 px-1.5 text-xs text-cyan-soft">
              <Volume2 className="size-4" />
              <button type="button" onClick={() => (speech.paused ? resumeSpeech() : pauseSpeech())} className="rounded p-1 hover:bg-cyan/20" aria-label={speech.paused ? 'Resume speech' : 'Pause speech'}>
                {speech.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              </button>
              <button type="button" onClick={stopSpeech} className="rounded p-1 hover:bg-cyan/20" aria-label="Stop speech">
                <Square className="size-3.5" />
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => nav.navigate({ view: 'voice', focus: 'tts' })} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface-2 px-2 text-ink-muted hover:text-ink" aria-label="Text-to-speech controls">
              <Volume2 className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => nav.navigate({ view: 'doctors' })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2 text-xs text-ink-muted hover:text-ink"
            aria-label="Clinician profile, users and authorization settings"
          >
            <UserRound className="size-4" />
            <span className="hidden max-w-[9rem] truncate 2xl:inline">{owner ? owner.displayName : 'No owner enrolled'}</span>
          </button>
        </div>
      </div>
      {(listening || voice.status === 'verification-pending') && (
        <div className="flex items-center gap-3 border-t border-line bg-surface/80 px-4 py-1.5 text-xs" aria-live="polite">
          <span className="h-1.5 w-24 overflow-hidden rounded bg-surface-3">
            <span className="block h-full bg-cyan transition-[width]" style={{ width: `${Math.round(voice.level * 100)}%` }} />
          </span>
          <span className="text-ink-muted">{voice.statusDetail}</span>
          <span className="truncate font-medium text-ink">{voice.transcript}</span>
        </div>
      )}
    </header>
  )
}
