import { clsx } from 'clsx'
import { Hand, VideoOff, X } from 'lucide-react'
import { useGestures } from './GestureContext'

const POSE_LABEL: Record<string, string> = {
  'open-palm': 'Open palm',
  pinch: 'Pinch',
  'thumbs-up': 'Thumbs up',
  fist: 'Fist',
  point: 'Pointing',
  unknown: '—',
}

/** Compact picture-in-picture camera preview with landmark overlay. Always mounted so refs exist. */
export function GesturePreview() {
  const g = useGestures()
  const visible = g.status !== 'off' && g.status !== 'error'
  return (
    <div
      aria-hidden={!visible}
      className={clsx('fixed bottom-4 left-4 z-40 w-[220px] overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl transition-opacity sm:w-[260px]', visible ? 'opacity-100' : 'pointer-events-none opacity-0')}
    >
      <div className="relative aspect-[4/3] bg-black">
        {/* Mirrored (selfie) view for natural interaction; frames never leave the browser. */}
        <video ref={g.videoRef} className="absolute inset-0 size-full -scale-x-100 object-cover" muted playsInline />
        <canvas ref={g.canvasRef} className="absolute inset-0 size-full -scale-x-100" />
        {g.status === 'starting' && <div className="absolute inset-0 grid place-items-center text-xs text-ink-muted">Starting camera…</div>}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-cyan-soft">LOCAL ONLY · NOT RECORDED</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Hand className="size-3.5 text-cyan" />
          {g.status === 'tracking' ? POSE_LABEL[g.pose] : g.status === 'no-hand' ? 'No hand detected' : 'Starting'}
        </span>
        <button type="button" onClick={g.disable} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-muted hover:bg-surface-3 hover:text-ink" aria-label="Turn off camera and gestures">
          <VideoOff className="size-3.5" /> Off
        </button>
      </div>
      {g.lastEvent && Date.now() - g.lastEvent.at < 4000 && (
        <p className="flex items-start gap-1 border-t border-line px-2.5 py-1.5 text-[11px] text-ink-muted">
          <X className="mt-0.5 size-3 rotate-45 text-teal-bright" />
          {g.lastEvent.result}
        </p>
      )}
    </div>
  )
}
