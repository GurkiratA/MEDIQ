import { clsx } from 'clsx'
import { BrainCircuit, Camera, CameraOff, ChevronDown, FlaskConical, Menu, MoreHorizontal, Pause, Play, RotateCcw, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Square, UserRound, Volume2, X } from 'lucide-react'
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
  ready: { label: 'Ready', tone: 'teal' },
  'loading-model': { label: 'Loading model', tone: 'cyan' },
  listening: { label: 'Listening', tone: 'cyan' },
  'verification-pending': { label: 'Verification Pending', tone: 'warn' },
  verified: { label: 'Verified', tone: 'ok' },
  'unknown-speaker': { label: 'Unknown Speaker', tone: 'danger' },
  'access-denied': { label: 'Access Denied', tone: 'danger' },
  unavailable: { label: 'Verification Unavailable', tone: 'warn' },
}

const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-ink-faint',
  teal: 'bg-teal-bright',
  cyan: 'bg-cyan',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  sim: 'bg-sim',
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
    <div ref={box} className="relative w-full max-w-[260px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && q.length > 0}
        aria-controls="patient-search-results"
        aria-label="Search synthetic patients by ID or name"
        placeholder="Find patient"
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
        className="input h-9 rounded-full pl-9"
      />
      {open && q.trim() && (
        <ul id="patient-search-results" role="listbox" className="glass absolute left-0 right-0 top-11 z-50 max-h-72 overflow-y-auto rounded-xl py-1">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No match for “{q}”.</li>}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === idx}>
              <button type="button" onClick={() => go(p.id)} className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', i === idx ? 'bg-surface-3' : 'hover:bg-surface-3')}>
                <span className="font-mono text-cyan">{p.id}</span>
                <span className="truncate">{p.fullName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Dropdown({ label, icon, children, tone = 'neutral', showLabel }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; tone?: 'neutral' | 'sim'; showLabel?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false), open)
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={clsx('pill', tone === 'sim' && 'border-sim/40 bg-sim/10 text-sim hover:text-sim')}
      >
        {icon}
        {showLabel && <span className="hidden xl:inline">{label}</span>}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 top-11 z-50 w-72 rounded-xl p-1.5">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function TopBar({ onMenu, onReplayIntro }: { onMenu: () => void; onReplayIntro?: () => void }) {
  const { saveSettings } = useData()
  const snap = useSnap()
  const voice = useVoice()
  const gestures = useGestures()
  const prov = useProviders()
  const nav = useNav()
  const toast = useToast()
  const speech = useSpeechState()
  const owner = snap.doctors.find((d) => d.role === 'Owner')
  const focus = nav.patientId ? snap.patients.find((p) => p.id === nav.patientId) : null

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

  const camOn = gestures.status !== 'off' && gestures.status !== 'error'
  const camTone: Tone = gestures.status === 'tracking' ? 'ok' : gestures.status === 'error' ? 'danger' : gestures.status === 'off' ? 'neutral' : 'cyan'
  const camLabel = gestures.status === 'off' ? 'Hands off' : gestures.status === 'error' ? 'Camera error' : gestures.status === 'starting' ? 'Starting…' : gestures.status === 'tracking' ? 'Hand tracked' : 'No hand'
  const local = prov.fallbackActive || snap.settings.providerMode === 'local' || prov.apiReachable === false

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
      <div className="flex h-[60px] items-center gap-3 px-3 sm:px-5">
        <button type="button" onClick={onMenu} className="rounded-md p-2 text-ink-muted hover:bg-surface-3 lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
        <button type="button" onClick={() => nav.navigate({ view: 'overview' })} className="flex items-center gap-2.5" aria-label="MEDIQ home">
          <span className="relative grid size-8 place-items-center rounded-xl border border-cyan/40 bg-cyan/10 text-[13px] font-bold text-cyan-soft shadow-[0_0_18px_-4px] shadow-cyan/60">M</span>
          <span className="hidden text-[15px] font-semibold tracking-[0.32em] text-ink sm:inline">MEDIQ</span>
        </button>
        <Badge tone="sim" className="hidden uppercase tracking-wide md:inline-flex">
          Synthetic
        </Badge>

        {focus && (
          <span className="hidden items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 py-1 pl-3 pr-1 text-xs md:inline-flex">
            <button type="button" className="flex items-center gap-1.5" onClick={() => nav.navigate({ view: 'patients', patientId: focus.id })} aria-label={`Active patient ${focus.id} ${focus.fullName}`}>
              <span className="font-mono text-teal-bright">{focus.id}</span>
              <span className="max-w-[10rem] truncate text-ink">{focus.fullName}</span>
            </button>
            <button type="button" className="rounded-full p-0.5 text-ink-faint hover:text-ink" onClick={() => nav.navigate({ view: nav.view === 'patients' ? 'overview' : nav.view, patientId: null })} aria-label="Clear active patient">
              <X className="size-3.5" />
            </button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:block">
            <PatientSearch />
          </div>

          <button type="button" onClick={() => nav.navigate({ view: 'voice' })} className="pill" title={voice.statusDetail ?? vs.label} aria-label={`Voice verification status: ${vs.label}`}>
            <VoiceIcon className="size-3.5" />
            <span className={clsx('dot', TONE_DOT[vs.tone])} />
            <span className="hidden lg:inline">{vs.label}</span>
          </button>

          <button
            type="button"
            onClick={() => (camOn ? gestures.disable() : void gestures.enable())}
            className={clsx('pill', camOn && 'border-cyan/40 text-cyan-soft')}
            aria-label={camOn ? 'Disable camera gesture control' : 'Enable camera gesture control'}
            aria-pressed={camOn}
            title={gestures.error ?? 'Hand control (camera processed locally)'}
          >
            {camOn ? <Camera className="size-3.5" /> : <CameraOff className="size-3.5" />}
            <span className={clsx('dot', TONE_DOT[camTone])} />
            <span className="hidden lg:inline">{camLabel}</span>
          </button>

          <label className="pill cursor-pointer" title="AI provider mode">
            <BrainCircuit className="size-3.5" />
            <span className={clsx('dot', local ? 'bg-warn' : 'bg-ok')} />
            <span className="sr-only">AI provider</span>
            <select
              value={snap.settings.providerMode}
              onChange={async (e) => {
                await saveSettings({ ...snap.settings, providerMode: e.target.value as ProviderMode })
                toast({ tone: 'info', title: 'AI provider mode changed', body: MODES.find((m) => m.id === e.target.value)?.label })
              }}
              className="hidden max-w-[8.5rem] bg-transparent text-xs text-ink focus:outline-none xl:block"
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id} className="bg-surface">
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <Dropdown label="Demo Quick-Sim" icon={<FlaskConical className="size-3.5" />} tone="sim" showLabel>
            {(close) => (
              <>
                <p className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-ink-muted">
                  <span className="font-semibold text-sim">SIMULATION</span> — scripted, not live biometrics. Never changes enrollment or privileges.
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

          {speech.speaking && (
            <span className="pill gap-0.5 border-cyan/40 text-cyan-soft">
              <Volume2 className="size-3.5" />
              <button type="button" onClick={() => (speech.paused ? resumeSpeech() : pauseSpeech())} className="rounded p-1 hover:bg-cyan/20" aria-label={speech.paused ? 'Resume speech' : 'Pause speech'}>
                {speech.paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </button>
              <button type="button" onClick={stopSpeech} className="rounded p-1 hover:bg-cyan/20" aria-label="Stop speech">
                <Square className="size-3" />
              </button>
            </span>
          )}

          <Dropdown label="More" icon={<MoreHorizontal className="size-4" />}>
            {(close) => (
              <>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-3" onClick={() => (nav.navigate({ view: 'doctors' }), close())}>
                  <UserRound className="size-4 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{owner ? owner.displayName : 'No owner enrolled'}</span>
                </button>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-3" onClick={() => (nav.navigate({ view: 'voice', focus: 'tts' }), close())}>
                  <Volume2 className="size-4 text-ink-muted" /> Speech output
                </button>
                {onReplayIntro && (
                  <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-3" onClick={() => (onReplayIntro(), close())}>
                    <RotateCcw className="size-4 text-ink-muted" /> Replay intro
                  </button>
                )}
              </>
            )}
          </Dropdown>
        </div>
      </div>
    </header>
  )
}
