/**
 * Voice orchestration: push-to-talk → fresh audio sample + transcript →
 * quality check → local speaker embedding → verification decision →
 * authorization → deterministic routing. A command is NEVER executed while
 * verification is pending, and never when it fails. Typed commands are a
 * manual fallback with exactly the same (navigation-only) privileges as
 * clicking. Demo Quick-Sim scenarios are scripted, clearly labelled, and
 * never touch enrollment state or produce live-verification records.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useData } from '../state/DataContext'
import { useNav } from '../state/NavContext'
import { useNoteDrafts } from '../state/NoteDraftContext'
import { useToast } from '../state/ToastContext'
import { usePanels } from '../reports/PanelContext'
import type { ActivityKind, Permission } from '../db/schema'
import { MicCapture, MicPermissionError } from './audioCapture'
import { describeCommand, parseCommand, type Command } from './commands'
import { assessSample, VERIFY_THRESHOLDS, type QualityReport } from './quality'
import { routeCommand } from './router'
import { gateVoiceCommand } from './gate'
import { embedUtterance, loadSpeakerModel, speakerModelStatus, type ModelState } from './speakerModel'
import { Recognizer, speechRecognitionSupported } from './speechRecognition'
import { speak, stopSpeech } from './tts'
import { activeGrant, decide, decisionMessage, decisionReason, type Decision } from './verification'
import { recordClip } from './recorder'

export type VoiceStatus =
  | 'not-enrolled'
  | 'ready'
  | 'loading-model'
  | 'listening'
  | 'verification-pending'
  | 'verified'
  | 'unknown-speaker'
  | 'access-denied'
  | 'unavailable'

export type Origin = 'voice' | 'typed' | 'simulation' | 'wake'

export interface Outcome {
  at: string
  origin: Origin
  command: string | null
  transcript: string | null
  decision: Decision | null
  quality: QualityReport | null
  executed: boolean
  headline: string
  detail: string
}

export type SimScenario = 'authorized' | 'unknown' | 'revoked' | 'dictation'

export interface SimStep {
  label: string
  result: string
  ok: boolean
}

export interface SimRun {
  scenario: SimScenario
  at: string
  title: string
  steps: SimStep[]
  outcome: 'accepted' | 'denied' | 'scenario-loaded'
}

interface VoiceApi {
  status: VoiceStatus
  statusDetail: string | null
  transcript: string
  level: number
  modelState: ModelState
  modelError: string | null
  srSupported: boolean
  micSupported: boolean
  lastOutcome: Outcome | null
  history: Outcome[]
  simRun: SimRun | null
  wakeMode: boolean
  busy: boolean
  enrolling: boolean
  setEnrolling: (on: boolean) => void
  startPushToTalk: () => Promise<void>
  stopPushToTalk: () => void
  cancel: (reason?: string) => void
  runTyped: (text: string) => void
  runSimulation: (s: SimScenario) => void
  setWakeMode: (on: boolean) => void
  pauseListening: (reason: string) => void
  /** Records + verifies a fresh sample for a given permission (dictation, owner checks). */
  verifyFresh: (opts: { permission: Permission; maxSeconds: number; signal: AbortSignal; onLevel?: (l: number) => void; onPartial?: (t: string) => void }) => Promise<{
    decision: Decision | null
    quality: QualityReport
    transcript: string
    transcriptAvailable: boolean
    error: string | null
  }>
}

const Ctx = createContext<VoiceApi | null>(null)
const MAX_LISTEN_MS = 8000

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { snap, log, run } = useData()
  const nav = useNav()
  const drafts = useNoteDrafts()
  const toast = useToast()
  const panels = usePanels()

  const [status, setStatus] = useState<VoiceStatus>('not-enrolled')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [level, setLevel] = useState(0)
  const [lastOutcome, setLastOutcome] = useState<Outcome | null>(null)
  const [history, setHistory] = useState<Outcome[]>([])
  const [simRun, setSimRun] = useState<SimRun | null>(null)
  const [wakeMode, setWakeModeState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [model, setModel] = useState(speakerModelStatus.get())
  useEffect(() => speakerModelStatus.subscribe(() => setModel(speakerModelStatus.get())), [])

  const micRef = useRef<MicCapture | null>(null)
  const recRef = useRef(new Recognizer())
  const sessionRef = useRef<{ finalText: string; finished: boolean; timer: number | null; raf: number } | null>(null)
  const lastExecRef = useRef<{ key: string; at: number } | null>(null)
  const wakeRef = useRef<{ mic: MicCapture | null; rec: Recognizer; utteranceStart: number | null; awaitUntil: number; stopped: boolean } | null>(null)

  // Refs to the latest values so long-lived callbacks never act on stale state.
  const snapRef = useRef(snap)
  snapRef.current = snap
  const navRef = useRef(nav)
  navRef.current = nav
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  const authorizedCount = useMemo(() => {
    if (!snap) return 0
    return snap.doctors.filter((p) => !p.revokedAt && activeGrant(p.id, snap.authorizations, 'voice-navigation')).length
  }, [snap])

  // Idle status reflects enrollment state.
  useEffect(() => {
    if (busy) return
    setStatus((s) => {
      if (['verified', 'unknown-speaker', 'access-denied', 'unavailable'].includes(s)) return s
      return authorizedCount ? 'ready' : 'not-enrolled'
    })
  }, [authorizedCount, busy])

  const record = useCallback((o: Omit<Outcome, 'at'>) => {
    const full = { ...o, at: new Date().toISOString() }
    setLastOutcome(full)
    setHistory((h) => [full, ...h].slice(0, 25))
    return full
  }, [])

  const settings = snap?.settings

  const sayIfAllowed = useCallback(
    (text: string | null) => {
      if (text) speak(text, { voiceURI: settings?.ttsVoiceURI ?? null, rate: settings?.ttsRate ?? 1, lang: settings?.speechLang })
    },
    [settings],
  )

  const stopEverything = useCallback(() => {
    const s = sessionRef.current
    if (s?.timer) window.clearTimeout(s.timer)
    if (s) cancelAnimationFrame(s.raf)
    sessionRef.current = null
    recRef.current.abort()
    micRef.current?.close()
    micRef.current = null
    setLevel(0)
  }, [])

  const stopWake = useCallback(() => {
    const w = wakeRef.current
    if (!w) return
    w.stopped = true
    w.rec.abort()
    w.mic?.close()
    wakeRef.current = null
    setWakeModeState(false)
  }, [])

  /** Executes a parsed command through the deterministic router. */
  const execute = useCallback(
    (cmd: Command, origin: Origin): { executed: boolean; message: string } => {
      const key = JSON.stringify(cmd)
      const now = Date.now()
      if (lastExecRef.current && lastExecRef.current.key === key && now - lastExecRef.current.at < 1500) {
        return { executed: false, message: 'Duplicate command ignored.' }
      }
      const n = navRef.current
      const r = routeCommand(cmd, {
        activePatientId: n.patientId,
        navigate: n.navigate,
        back: n.back,
        shiftPatientTab: n.shiftPatientTab,
        patientExists: (id) => !!snapRef.current?.patients.some((p) => p.id === id),
        hasDraftText: (id) => !!draftsRef.current.get(id).text.trim(),
        generateSummary: (id) => void draftsRef.current.generate(id),
        latestSummary: (id) => draftsRef.current.get(id).result?.primary.note.summary ?? null,
        speak: (t) => sayIfAllowed(t),
        stopListening: () => {
          stopEverything()
          stopWake()
        },
        reports: {
          open: (kind, patientId) => void panelsRef.current.open(kind, patientId),
          hasOpen: () => !!panelsRef.current.store.top(),
          closeTop: () => panelsRef.current.closeTop(),
          closeAll: () => panelsRef.current.closeAll(),
          scaleTop: (f) => panelsRef.current.scaleTop(f),
          scrollTop: (dir) => panelsRef.current.scrollTop(dir),
        },
      })
      if (r.executed) lastExecRef.current = { key, at: now }
      if (origin !== 'typed' && r.spoken) sayIfAllowed(r.spoken)
      return r
    },
    [sayIfAllowed, stopEverything, stopWake],
  )

  const logDecision = useCallback(
    async (d: Decision | null, quality: QualityReport | null, intent: string | null, origin: Origin) => {
      const base = { category: 'security' as const, mode: 'live' as const, details: { intent: intent ?? 'none', origin } }
      if (!d) {
        if (quality && !quality.ok) await log({ ...base, kind: 'poor-sample-rejected', message: `Voice sample rejected before verification: ${quality.issues[0] ?? 'poor quality'}` })
        return
      }
      const map: Record<Decision['outcome'], ActivityKind> = {
        accepted: 'verification-success',
        'no-profiles': 'verification-failed',
        'unknown-speaker': 'unknown-speaker-rejected',
        ambiguous: 'ambiguous-match-rejected',
        revoked: 'revoked-profile-rejected',
        'not-authorized': 'verification-failed',
        'model-mismatch': 'verification-failed',
      }
      const score = 'score' in d ? d.score : 'bestScore' in d ? d.bestScore : null
      await log({
        ...base,
        kind: map[d.outcome],
        profileId: 'profileId' in d ? d.profileId : null,
        message: d.outcome === 'accepted' ? `Live speaker verification succeeded (${d.displayName}).` : `Live speaker verification rejected: ${decisionReason(d)}`,
        details: { ...base.details, ...(score !== null ? { score: Number(score.toFixed(3)) } : {}) },
      })
    },
    [log],
  )

  /** Shared verification of a captured 16 kHz sample. */
  const verifySample = useCallback(
    async (pcm: Float32Array, permission: Permission): Promise<{ decision: Decision | null; quality: QualityReport; error: string | null }> => {
      const quality = assessSample(pcm, VERIFY_THRESHOLDS)
      if (!quality.ok) return { decision: null, quality, error: null }
      const s = snapRef.current
      if (!s) return { decision: null, quality, error: 'Database not ready.' }
      try {
        const embedding = await embedUtterance(pcm)
        const decision = decide(embedding, s.doctors, s.authorizations, {
          threshold: s.settings.verificationThreshold,
          margin: s.settings.ambiguityMargin,
          permission,
        })
        if (decision.outcome === 'accepted') {
          const p = s.doctors.find((x) => x.id === decision.profileId)
          if (p) void run((db) => db.updateProfile({ ...p, lastVerifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null)).catch(() => {})
        }
        return { decision, quality, error: null }
      } catch (err) {
        return { decision: null, quality, error: `Verification unavailable: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
    [run],
  )

  /** Applies a decision for a voice command and routes it only when accepted. */
  const handleVerifiedCommand = useCallback(
    async (pcm: Float32Array, text: string, origin: Origin) => {
      setStatus('verification-pending')
      setStatusDetail('Verifying speaker…')
      const cmd = parseCommand(text)
      const intent = cmd.type
      const sample = await verifySample(pcm, 'voice-navigation')
      const { quality } = sample
      const gate = gateVoiceCommand(sample)
      if (!gate.allowed && gate.reason === 'unavailable') {
        setStatus('unavailable')
        setStatusDetail(gate.error)
        record({ origin, command: describeCommand(cmd), transcript: text, decision: null, quality, executed: false, headline: 'Verification Unavailable — command not executed.', detail: gate.error })
        await log({ kind: 'verification-failed', category: 'security', mode: 'live', message: 'Speaker verification unavailable; command blocked (fail-closed).', details: { intent } })
        return
      }
      if (!gate.allowed && gate.reason === 'poor-sample') {
        setStatus('access-denied')
        setStatusDetail(quality.issues[0] ?? 'Poor sample')
        record({ origin, command: describeCommand(cmd), transcript: text, decision: null, quality, executed: false, headline: 'Voice Not Verified: Access Denied.', detail: `Sample rejected before verification: ${quality.issues.join(' ')} Please retry.` })
        await logDecision(null, quality, intent, origin)
        return
      }
      await logDecision(sample.decision, quality, intent, origin)
      if (!gate.allowed) {
        const decision = gate.reason === 'rejected' ? gate.decision : sample.decision!
        setStatus(decision.outcome === 'unknown-speaker' ? 'unknown-speaker' : 'access-denied')
        setStatusDetail(decisionReason(decision))
        record({ origin, command: describeCommand(cmd), transcript: text, decision, quality, executed: false, headline: decisionMessage(decision), detail: `${decisionReason(decision)} The command was not executed. You may retry.` })
        return
      }
      const decision = gate.decision
      setStatus('verified')
      setStatusDetail(`${decision.displayName} · score ${decision.score.toFixed(2)}`)
      const r = execute(cmd, origin)
      record({ origin, command: describeCommand(cmd), transcript: text, decision, quality, executed: r.executed, headline: r.executed ? `Verified · ${r.message}` : `Verified, but: ${r.message}`, detail: decisionReason(decision) })
      if (r.executed) await log({ kind: 'command-executed', category: 'security', mode: 'live', profileId: decision.profileId, message: `Verified voice command executed: ${describeCommand(cmd)}.`, details: { intent } })
    },
    [verifySample, record, log, logDecision, execute],
  )

  const finishSession = useCallback(async () => {
    const s = sessionRef.current
    if (!s || s.finished) return
    s.finished = true
    if (s.timer) window.clearTimeout(s.timer)
    cancelAnimationFrame(s.raf)
    recRef.current.abort()
    const mic = micRef.current
    micRef.current = null
    setLevel(0)
    let pcm: Float32Array = new Float32Array(0)
    try {
      if (mic) pcm = await mic.stop()
    } finally {
      mic?.close()
    }
    const text = s.finalText.trim()
    sessionRef.current = null
    try {
      if (!text) {
        setStatus(authorizedCount ? 'ready' : 'not-enrolled')
        setStatusDetail(null)
        record({ origin: 'voice', command: null, transcript: null, decision: null, quality: null, executed: false, headline: 'No command heard.', detail: 'Nothing was recognised, so nothing was verified or executed. Try again, or type the command.' })
        return
      }
      await handleVerifiedCommand(pcm, text, 'voice')
    } finally {
      setBusy(false)
    }
  }, [authorizedCount, handleVerifiedCommand, record])

  const startPushToTalk = useCallback(async () => {
    if (busy || sessionRef.current) return
    stopSpeech()
    if (!authorizedCount) {
      setStatus('not-enrolled')
      record({ origin: 'voice', command: null, transcript: null, decision: { outcome: 'no-profiles' }, quality: null, executed: false, headline: 'Voice commands are locked.', detail: 'No authorized doctor is enrolled. Enroll the owner under “Authorized Doctors & Voiceprints”, or use manual controls, typed commands or Demo Quick-Sim.' })
      return
    }
    if (!speechRecognitionSupported()) {
      setStatus('unavailable')
      setStatusDetail('Speech recognition unsupported')
      toast({ tone: 'error', title: 'Speech recognition unavailable', body: 'Use Chrome or Edge for voice commands, or type the command.' })
      return
    }
    setBusy(true)
    setTranscript('')
    if (model.state !== 'ready') {
      setStatus('loading-model')
      setStatusDetail('Loading on-device voice model…')
      try {
        await loadSpeakerModel()
      } catch (err) {
        setStatus('unavailable')
        setStatusDetail(err instanceof Error ? err.message : String(err))
        setBusy(false)
        return
      }
    }
    let mic: MicCapture
    try {
      mic = await MicCapture.open()
    } catch (err) {
      setStatus('unavailable')
      setStatusDetail(err instanceof MicPermissionError ? err.message : String(err))
      toast({ tone: 'error', title: 'Microphone unavailable', body: err instanceof Error ? err.message : String(err) })
      setBusy(false)
      return
    }
    micRef.current = mic
    mic.start()
    const session = { finalText: '', finished: false, timer: null as number | null, raf: 0 }
    sessionRef.current = session
    const tick = () => {
      setLevel(mic.level())
      session.raf = requestAnimationFrame(tick)
    }
    session.raf = requestAnimationFrame(tick)
    session.timer = window.setTimeout(() => void finishSession(), MAX_LISTEN_MS)
    setStatus('listening')
    setStatusDetail('Listening — speak your command')
    recRef.current.start(
      { lang: snapRef.current?.settings.speechLang ?? 'en-US', continuous: false },
      {
        onPartial: (t) => setTranscript(t),
        onFinal: (t) => {
          session.finalText = `${session.finalText} ${t}`.trim()
          setTranscript(session.finalText)
          void finishSession()
        },
        onError: (msg, code) => {
          if (code !== 'aborted' && code !== 'no-speech') toast({ tone: 'error', title: 'Speech recognition', body: msg })
        },
        onEnd: () => void finishSession(),
      },
    )
  }, [busy, authorizedCount, model.state, record, toast, finishSession])

  const stopPushToTalk = useCallback(() => {
    if (!sessionRef.current) return
    recRef.current.stop()
    const s = sessionRef.current
    if (s.timer) window.clearTimeout(s.timer)
    s.timer = window.setTimeout(() => void finishSession(), 1500)
  }, [finishSession])

  const cancel = useCallback(
    (reason = 'Cancelled') => {
      if (!sessionRef.current) return
      stopEverything()
      setBusy(false)
      setStatus(authorizedCount ? 'ready' : 'not-enrolled')
      setStatusDetail(reason)
    },
    [stopEverything, authorizedCount],
  )

  const pauseListening = useCallback(
    (reason: string) => {
      const active = !!sessionRef.current || !!wakeRef.current
      cancel(reason)
      stopWake()
      stopSpeech()
      if (active) toast({ tone: 'info', title: 'Listening paused', body: reason })
    },
    [cancel, stopWake, toast],
  )

  const runTyped = useCallback(
    (text: string) => {
      const cmd = parseCommand(text)
      const r = execute(cmd, 'typed')
      record({
        origin: 'typed',
        command: describeCommand(cmd),
        transcript: text,
        decision: null,
        quality: null,
        executed: r.executed,
        headline: r.executed ? `Typed command: ${r.message}` : r.message,
        detail: 'Manual typed input — equivalent to clicking. No voice verification is involved and no extra privileges are granted.',
      })
    },
    [execute, record],
  )

  const runSimulation = useCallback(
    (scenario: SimScenario) => {
      const at = new Date().toISOString()
      const sim = (kind: ActivityKind, message: string) => log({ kind, category: 'security', mode: 'simulation', message: `[SIMULATION] ${message}`, details: { scenario } })
      const base: SimStep[] = [
        { label: 'Audio capture', result: 'Scripted — no microphone used', ok: true },
        { label: 'Speech recognition', result: '“Open patient 104” (scripted transcript)', ok: true },
        { label: 'Sample quality', result: 'Scripted pass', ok: true },
      ]
      if (scenario === 'authorized') {
        const r = execute({ type: 'open-patient', patientId: '104' }, 'simulation')
        setSimRun({
          scenario,
          at,
          title: 'Simulate Authorized Doctor',
          outcome: 'accepted',
          steps: [
            ...base,
            { label: 'Speaker verification', result: 'Scripted match to fictional persona “SIM-Dr. Avery” (score 0.74 — scripted, not measured)', ok: true },
            { label: 'Authorization', result: 'Scripted persona authorized for navigation', ok: true },
            { label: 'Routing', result: r.message, ok: r.executed },
          ],
        })
        void sim('verification-success', 'Scripted authorized-doctor scenario accepted; navigation only. No real biometric measurement.')
      } else if (scenario === 'unknown') {
        setSimRun({
          scenario,
          at,
          title: 'Simulate Unknown Speaker',
          outcome: 'denied',
          steps: [
            ...base,
            { label: 'Speaker verification', result: 'Scripted best score 0.21 — below threshold', ok: false },
            { label: 'Authorization', result: 'Not reached', ok: false },
            { label: 'Routing', result: 'Voice Not Verified: Access Denied. Command not executed.', ok: false },
          ],
        })
        void sim('unknown-speaker-rejected', 'Scripted unknown-speaker scenario rejected.')
      } else if (scenario === 'revoked') {
        setSimRun({
          scenario,
          at,
          title: 'Simulate Revoked Doctor',
          outcome: 'denied',
          steps: [
            ...base,
            { label: 'Speaker verification', result: 'Scripted match to fictional persona “SIM-Dr. Rowe” (score 0.69 — scripted)', ok: true },
            { label: 'Authorization', result: 'Persona revoked by owner — rejected', ok: false },
            { label: 'Routing', result: 'Voice Not Verified: Access Denied. Command not executed.', ok: false },
          ],
        })
        void sim('revoked-profile-rejected', 'Scripted revoked-doctor scenario rejected.')
      } else {
        navRef.current.navigate({ view: 'notes', patientId: '104' })
        draftsRef.current.loadDemoScenario('104')
        setSimRun({
          scenario,
          at,
          title: 'Simulate Clinical Dictation (penicillin contraindication)',
          outcome: 'scenario-loaded',
          steps: [
            { label: 'Dictation', result: 'Scripted synthetic note loaded for Patient 104 (no microphone used)', ok: true },
            { label: 'Next step', result: 'Press “Generate structured draft” to run Model A, the independent audit and local rules', ok: true },
          ],
        })
        void log({ kind: 'system', category: 'clinical', mode: 'simulation', message: '[SIMULATION] Penicillin-contraindication dictation scenario loaded for Patient 104.', patientId: '104' })
      }
      toast({ tone: 'sim', title: 'Simulation — not a live biometric test', body: 'Scripted demonstration of expected behaviour.' })
    },
    [execute, log, toast],
  )

  const verifyFresh = useCallback<VoiceApi['verifyFresh']>(
    async ({ permission, maxSeconds, signal, onLevel, onPartial }) => {
      await loadSpeakerModel()
      const clip = await recordClip({ maxSeconds, signal, onLevel, onPartial, transcribe: { lang: snapRef.current?.settings.speechLang ?? 'en-US' } })
      const r = await verifySample(clip.pcm, permission)
      return { ...r, transcript: clip.transcript, transcriptAvailable: clip.transcriptAvailable }
    },
    [verifySample],
  )

  /* ------------------------------------------------ experimental wake phrase */
  const setWakeMode = useCallback(
    async (on: boolean) => {
      if (!on) return stopWake()
      if (!authorizedCount) {
        toast({ tone: 'error', title: 'Wake phrase unavailable', body: 'Enroll an authorized doctor first.' })
        return
      }
      if (!speechRecognitionSupported()) {
        toast({ tone: 'error', title: 'Wake phrase unavailable', body: 'Speech recognition is not supported in this browser.' })
        return
      }
      try {
        await loadSpeakerModel()
        const mic = await MicCapture.open()
        const w = { mic, rec: new Recognizer(), utteranceStart: null as number | null, awaitUntil: 0, stopped: false }
        wakeRef.current = w
        setWakeModeState(true)
        const WAKE = /\b(?:(?:hey|hi|ok|okay)\s+)?(mediq|medic|medi q|media q|medi queue)\b/i
        const startRec = () => {
          if (w.stopped) return
          w.rec.start(
            { lang: snapRef.current?.settings.speechLang ?? 'en-US', continuous: true },
            {
              onPartial: (t) => {
                if (w.utteranceStart === null) w.utteranceStart = performance.now()
                setTranscript(t)
              },
              onFinal: async (t) => {
                const startedAt = w.utteranceStart ?? performance.now() - 2500
                w.utteranceStart = null
                const hasWake = WAKE.test(t)
                const rest = t.replace(WAKE, '').trim()
                const awaiting = performance.now() < w.awaitUntil
                if (!hasWake && !awaiting) return
                if (hasWake && !rest) {
                  w.awaitUntil = performance.now() + 6000
                  setStatusDetail('Wake phrase heard — say the command')
                  return
                }
                w.awaitUntil = 0
                const secs = Math.min(8, Math.max(1.5, (performance.now() - startedAt) / 1000 + 0.8))
                const pcm = await w.mic!.recent(secs)
                setBusy(true)
                try {
                  await handleVerifiedCommand(pcm, rest || t, 'wake')
                } finally {
                  setBusy(false)
                }
              },
              onEnd: () => {
                // Chrome ends continuous sessions periodically; restart while enabled.
                if (!w.stopped) window.setTimeout(startRec, 250)
              },
            },
          )
        }
        startRec()
        toast({ tone: 'info', title: 'Experimental wake phrase on', body: 'Say “Hey MEDIQ, show rooms”. Each command is still speaker-verified.' })
      } catch (err) {
        stopWake()
        toast({ tone: 'error', title: 'Wake phrase unavailable', body: err instanceof Error ? err.message : String(err) })
      }
    },
    [authorizedCount, stopWake, toast, handleVerifiedCommand],
  )

  // Release audio resources on unmount.
  useEffect(
    () => () => {
      stopEverything()
      stopWake()
      stopSpeech()
    },
    [stopEverything, stopWake],
  )

  const value: VoiceApi = {
    status,
    statusDetail,
    transcript,
    level,
    modelState: model.state,
    modelError: model.error,
    srSupported: speechRecognitionSupported(),
    micSupported: MicCapture.supported(),
    lastOutcome,
    history,
    simRun,
    wakeMode,
    busy,
    enrolling,
    setEnrolling,
    startPushToTalk,
    stopPushToTalk,
    cancel,
    runTyped,
    runSimulation,
    setWakeMode: (on) => void setWakeMode(on),
    pauseListening,
    verifyFresh,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useVoice() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useVoice outside VoiceProvider')
  return v
}
