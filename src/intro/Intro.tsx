/**
 * MEDIQ start-up sequence, inspired by the JARVIS reference boot (dark gate →
 * music → instrumentation → name → system checks → spoken greeting → hand-off)
 * but clinical: an ECG trace, a scan line, biometric rings and real readiness
 * checks taken from the live app state. Nothing here claims a check that did
 * not happen: speaker verification is "armed" (enrolment count), never
 * "verified", because verification only happens per spoken command.
 *
 * Shown once per browser tab session (sessionStorage), skippable at any time
 * (button or Esc), shortened under prefers-reduced-motion.
 */
import { clsx } from 'clsx'
import { Check, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSnap } from '../state/DataContext'
import { speak, stopSpeech, voicesReady } from '../voice/tts'
import { markSeen } from './introSession'

/** Stage boundaries in ms from "Initialise". */
const T = { wave: 200, rings: 1500, name: 2600, checks: 3600, voice: 6200, end: 9400, hardEnd: 12500 }
const CHECK_GAP = 600

function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function useMusic() {
  const el = useRef<HTMLAudioElement | null>(null)
  const start = useCallback(() => {
    try {
      const a = new Audio('/audio/boot-music.mp3')
      a.volume = 0.55
      el.current = a
      void a.play().catch(() => {})
    } catch {
      /* no audio: the sequence runs silently */
    }
  }, [])
  const fadeOut = useCallback((ms = 900) => {
    const a = el.current
    if (!a) return
    const from = a.volume
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      a.volume = from * (1 - k)
      if (k < 1) requestAnimationFrame(step)
      else a.pause()
    }
    step()
  }, [])
  useEffect(() => () => el.current?.pause(), [])
  return { start, fadeOut }
}

/** One heartbeat-like ECG complex repeated across the width (viewBox 0..1200). */
const ECG = (() => {
  let d = 'M0 60'
  for (let x = 0; x < 1200; x += 200) {
    d += ` L${x + 70} 60 L${x + 80} 54 L${x + 90} 60 L${x + 100} 60 L${x + 106} 66 L${x + 114} 14 L${x + 122} 84 L${x + 128} 60 L${x + 150} 60 L${x + 164} 50 L${x + 178} 60 L${x + 200} 60`
  }
  return d
})()

export function Intro({ onDone }: { onDone: () => void }) {
  const snap = useSnap()
  const [phase, setPhase] = useState<'gate' | 'run' | 'leaving'>('gate')
  const [t, setT] = useState(0)
  const music = useMusic()
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const finished = useRef(false)
  const spoke = useRef(false)

  const enrolled = snap.doctors.filter((d) => !d.revokedAt).length
  const checks = [
    { k: 'Speaker verification', v: enrolled ? `Armed · ${enrolled} voiceprint${enrolled === 1 ? '' : 's'}` : 'Armed · enrolment required' },
    { k: 'Clinical workspace', v: `${snap.patients.length} synthetic records` },
    { k: 'Safety rules', v: 'Local baseline active' },
    { k: 'Assistant', v: 'Online · human review required' },
  ]

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    markSeen()
    music.fadeOut(reduced ? 200 : 900)
    setPhase('leaving')
    window.setTimeout(onDone, reduced ? 150 : 700)
  }, [music, onDone, reduced])

  const skip = useCallback(() => {
    stopSpeech()
    finish()
  }, [finish])

  const begin = () => {
    setPhase('run')
    music.start()
  }

  // Stage clock on wall time (setInterval, not rAF) so a backgrounded tab cannot freeze the sequence.
  useEffect(() => {
    if (phase !== 'run') return
    const t0 = Date.now()
    const scale = reduced ? 0.35 : 1
    const id = window.setInterval(() => setT((Date.now() - t0) / scale), 50)
    return () => window.clearInterval(id)
  }, [phase, reduced])

  useEffect(() => {
    if (phase !== 'run') return
    if (t >= T.voice && !spoke.current) {
      spoke.current = true
      void voicesReady().then(() =>
        speak(`${greeting()}. MEDIQ is online. Clinical workspace ready. All records in this session are synthetic.`, {
          rate: 0.98,
          onEnd: () => window.setTimeout(finish, 500),
          onError: () => undefined,
        }),
      )
    }
    if (t >= T.hardEnd) finish()
  }, [t, phase, finish])

  // Without speech output the sequence still ends on time.
  useEffect(() => {
    if (phase === 'run' && t >= T.end && typeof window.speechSynthesis === 'undefined') finish()
  }, [t, phase, finish])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
      else if (phase === 'gate' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        begin()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const after = (ms: number) => phase !== 'gate' && t >= ms
  const checksDone = (i: number) => t >= T.checks + i * CHECK_GAP + 450

  return (
    <div className={clsx('intro', phase === 'leaving' && 'intro-leaving')} role="dialog" aria-modal="true" aria-label="MEDIQ start-up">
      <div className="intro-grid" aria-hidden />
      <button type="button" onClick={skip} className="intro-skip">
        Skip intro <kbd>Esc</kbd>
      </button>

      {phase === 'gate' ? (
        <div className="intro-gate">
          <button type="button" onClick={begin} className="intro-ignite" autoFocus>
            <span className="intro-ignite-ring" aria-hidden />
            <span className="intro-ignite-word">Initialise MEDIQ</span>
          </button>
          <p className="intro-gate-sub">Clinical assistant · synthetic data · prototype</p>
        </div>
      ) : (
        <div className="intro-stage">
          {after(T.wave) && <div className="intro-scan" aria-hidden />}
          <svg className={clsx('intro-ecg', after(T.name) && 'intro-ecg-dim')} viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden>
            {after(T.wave) && <path d={ECG} className="intro-ecg-path" />}
          </svg>

          <div className="intro-core">
            <svg viewBox="-160 -160 320 320" className="intro-rings" aria-hidden>
              {after(T.rings) &&
                [150, 128, 104, 82].map((r, i) => (
                  <circle key={r} r={r} className="intro-ring" style={{ animationDelay: `${i * 120}ms`, strokeDasharray: ['2 6', '48 10 10 10', '1 4', '28 6 6 6'][i] }} />
                ))}
              {after(T.rings) &&
                Array.from({ length: 36 }, (_, i) => {
                  const a = (i / 36) * Math.PI * 2
                  const len = 6 + ((i * 7) % 5) * 3
                  return <line key={i} x1={Math.cos(a) * 160} y1={Math.sin(a) * 160} x2={Math.cos(a) * (160 + len)} y2={Math.sin(a) * (160 + len)} className="intro-tick" style={{ animationDelay: `${300 + i * 18}ms` }} />
                })}
            </svg>
            {after(T.name) && (
              <div className="intro-name">
                <h1>MEDIQ</h1>
                <p>Clinical Intelligence</p>
              </div>
            )}
          </div>

          <ul className="intro-checks" aria-live="polite">
            {checks.map((c, i) =>
              after(T.checks + i * CHECK_GAP) ? (
                <li key={c.k} className="intro-check">
                  <span className={clsx('intro-check-dot', checksDone(i) && 'is-done')}>{checksDone(i) && <Check className="size-3" />}</span>
                  <span className="intro-check-k">{c.k}</span>
                  <span className="intro-check-v">{checksDone(i) ? c.v : 'Initialising…'}</span>
                </li>
              ) : null,
            )}
          </ul>

          {after(T.end) && (
            <button type="button" className="intro-continue" onClick={skip}>
              Enter workspace <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      )}
      <p className="intro-credit">Music: “Impact Prelude” — Kevin MacLeod (incompetech.com), CC BY 4.0</p>
    </div>
  )
}
