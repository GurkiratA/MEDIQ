/**
 * Compact assistant bar: push-to-talk, live level + transcript, and the last
 * verification outcome in one line. Detail (history, typed commands, wake
 * phrase, help) stays in the Voice view.
 */
import { clsx } from 'clsx'
import { Loader2, Mic, MicOff, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNav } from '../state/NavContext'
import { useVoice } from '../voice/VoiceContext'

const OUTCOME_MS = 9000

export function AssistantDock() {
  const voice = useVoice()
  const nav = useNav()
  const [, tick] = useState(0)
  const listening = voice.status === 'listening'
  const pending = voice.status === 'verification-pending' || voice.status === 'loading-model'
  const o = voice.lastOutcome
  const fresh = o && Date.now() - new Date(o.at).getTime() < OUTCOME_MS

  useEffect(() => {
    if (!o) return
    const id = window.setTimeout(() => tick((n) => n + 1), OUTCOME_MS + 50)
    return () => window.clearTimeout(id)
  }, [o])

  let line: React.ReactNode
  if (listening) line = <span className="text-ink">{voice.transcript || <span className="text-ink-muted">Listening…</span>}</span>
  else if (pending) line = <span className="text-ink-muted">{voice.statusDetail ?? 'Verifying speaker…'}</span>
  else if (fresh && o)
    line = (
      <span className={clsx('flex min-w-0 items-center gap-1.5', o.executed ? 'text-ok' : o.decision && o.decision.outcome !== 'accepted' ? 'text-danger-soft' : 'text-ink')}>
        {o.executed ? <ShieldCheck className="size-3.5 shrink-0" /> : o.decision && o.decision.outcome !== 'accepted' ? <ShieldAlert className="size-3.5 shrink-0" /> : null}
        <span className="truncate">{o.headline}</span>
      </span>
    )
  else line = <span className="text-ink-faint">“Show the clinical summary” · “Close the report”</span>

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
      <div className="glass pointer-events-auto flex w-full max-w-[560px] items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4" aria-live="polite">
        <button
          type="button"
          onClick={() => (listening ? voice.stopPushToTalk() : void voice.startPushToTalk())}
          disabled={pending}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening (Alt+V)' : 'Push to talk — voice command with speaker verification (Alt+V)'}
          title="Push to talk (Alt+V)"
          className={clsx(
            'relative grid size-10 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-60',
            listening ? 'animate-pulse-ring border-cyan bg-cyan/25 text-cyan-soft' : 'border-teal/50 bg-teal/15 text-teal-bright hover:bg-teal/25',
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {listening && <span className="absolute -inset-1 rounded-full border border-cyan/50" style={{ transform: `scale(${1 + voice.level * 0.35})` }} aria-hidden />}
        </button>
        <div className="min-w-0 flex-1 truncate text-[13px]">{line}</div>
        <button type="button" onClick={() => nav.navigate({ view: 'voice' })} className="shrink-0 text-[11px] text-ink-faint hover:text-ink" aria-label="Open voice assistant details">
          Voice
        </button>
      </div>
    </div>
  )
}
