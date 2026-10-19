import { clsx } from 'clsx'
import { CircleHelp, Hand, VideoOff, X } from 'lucide-react'
import { useGestures } from './GestureContext'

const MOVES: { pose: string; does: string }[] = [
  { pose: '☝ Point', does: 'Move the cursor' },
  { pose: '🤏 Pinch', does: 'Click · pinch and move to drag a report (anywhere on it)' },
  { pose: '🤏🤏 Both hands', does: 'Pinch with both hands, pull apart / together to resize' },
  { pose: '✌ Two fingers', does: 'Hold over a report, move hand up/down to scroll' },
  { pose: '✊ Fist', does: 'Hold ~1 s over a report to close it' },
  { pose: '👍 Thumbs-up', does: 'Confirm a reviewed dialog (when allowed)' },
]

/** Small camera tile + tracking status, and the gesture guide. Always mounted so the video ref exists. */
export function GesturePreview() {
  const g = useGestures()
  const visible = g.status !== 'off' && g.status !== 'error'
  return (
    <>
      <div
        aria-hidden={!visible}
        className={clsx('glass fixed bottom-4 left-4 z-[60] w-[184px] overflow-hidden rounded-2xl transition-opacity', visible ? 'opacity-100' : 'pointer-events-none opacity-0')}
      >
        <div className="relative aspect-[4/3] bg-black">
          {/* Mirrored selfie view; frames never leave the browser. */}
          <video ref={g.videoRef} className="absolute inset-0 size-full -scale-x-100 object-cover opacity-70" muted playsInline />
          {g.status === 'starting' && <div className="absolute inset-0 grid place-items-center text-xs text-ink-muted">Starting camera…</div>}
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-cyan-soft">LOCAL · NOT RECORDED</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px]">
          <span className={clsx('size-1.5 shrink-0 rounded-full', g.status === 'tracking' ? 'bg-ok shadow-[0_0_8px] shadow-ok' : 'bg-warn')} />
          <span className="min-w-0 flex-1 truncate text-ink-muted" aria-live="polite">
            {g.status === 'tracking' ? `Hand tracked · ${g.poses}` : g.status === 'no-hand' ? 'No hand detected' : 'Starting'}
          </span>
          <button type="button" onClick={() => g.setGuideOpen(!g.guideOpen)} className="rounded p-0.5 text-ink-muted hover:text-ink" aria-label="Show gesture controls">
            <CircleHelp className="size-3.5" />
          </button>
          <button type="button" onClick={g.disable} className="rounded p-0.5 text-ink-muted hover:text-ink" aria-label="Turn off camera and gestures">
            <VideoOff className="size-3.5" />
          </button>
        </div>
        {g.lastEvent && Date.now() - g.lastEvent.at < 4000 && <p className="border-t border-line px-2 py-1 text-[10px] leading-snug text-ink-muted">{g.lastEvent.text}</p>}
      </div>

      {visible && g.guideOpen && (
        <div className="glass fixed bottom-4 left-[208px] z-[60] w-[300px] animate-fade-in rounded-2xl p-3" role="note" aria-label="Gesture controls">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-soft">
              <Hand className="size-3.5" /> Hand control
            </span>
            <button type="button" onClick={() => g.setGuideOpen(false)} className="rounded p-0.5 text-ink-muted hover:text-ink" aria-label="Hide gesture controls">
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {MOVES.map((m) => (
              <li key={m.pose} className="grid grid-cols-[92px_1fr] gap-2 text-[11.5px] leading-snug">
                <span className="text-ink">{m.pose}</span>
                <span className="text-ink-muted">{m.does}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10.5px] leading-snug text-ink-faint">Either hand works. Keep hands ~50–80 cm from the camera. Confirmations and access controls still need mouse or keyboard.</p>
        </div>
      )}
    </>
  )
}
