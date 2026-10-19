/**
 * Floating report windows. Each panel can be:
 *  - dragged by a hand pinch from ANYWHERE on the panel (header, body, even a
 *    button — a press that moves more than a few pixels becomes a drag, one
 *    that stays put is a click), or by the mouse/touch from the header;
 *  - resized with two pinching hands (see TwoHandResizer), the corner grip,
 *    the −/+ buttons, or voice;
 *  - scrolled with the wheel, touch, a two-finger "peace" hand moved up/down,
 *    or voice;
 *  - closed with ×, Esc, a held fist, or voice.
 * Content stays selectable with the mouse because mouse drags start only from
 * the header.
 */
import { clsx } from 'clsx'
import { GripHorizontal, Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { SyntheticTag } from '../components/ui'
import { handSignals } from '../gestures/handSignals'
import { isHandPointer } from '../gestures/pointerBridge'
import { useSnap } from '../state/DataContext'
import { usePanels } from './PanelContext'
import type { PanelState } from './panelStore'
import { ReportBody } from './ReportContent'
import { patientLine } from './reportData'
import { REPORT_TITLE } from './reportKinds'

/** A hand press must travel this far before it becomes a drag (below it, it is a click). */
export const HAND_DRAG_SLOP = 12

type Listen = (move: (e: PointerEvent) => void, end: (e: PointerEvent) => void) => void

/** Window-level listeners filtered to one pointer: hand events are dispatched at
 *  whatever is under the cursor and bubble to window, so this sees mouse and hand alike. */
function track(pointerId: number): Listen {
  return (move, end) => {
    const onMove = (e: PointerEvent) => e.pointerId === pointerId && move(e)
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      end(e)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }
}

function FloatingPanel({ panel, front }: { panel: PanelState; front: boolean }) {
  const snap = useSnap()
  const { store, close } = usePanels()
  const [mode, setMode] = useState<'idle' | 'drag' | 'resize'>('idle')
  const root = useRef<HTMLDivElement>(null)
  const patient = snap.patients.find((p) => p.id === panel.patientId)

  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    store.focus(panel.id)
    const target = e.target as Element
    const hand = isHandPointer(e.nativeEvent)
    const onHandle = !!target.closest('[data-drag-handle]') && !target.closest('button, a, input, select, textarea')
    if (!hand && (!onHandle || e.button !== 0)) return
    if (!hand) {
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture is an optimisation */
      }
    }
    const from = { x: panel.x, y: panel.y }
    let baseX = e.clientX
    let baseY = e.clientY
    let dx = 0
    let dy = 0
    let engaged = !hand
    if (engaged) setMode('drag')
    track(e.pointerId)(
      (ev) => {
        if (handSignals.twoHandActive && hand) {
          // Both hands pinching = resize, not drag. Re-anchor so releasing one
          // hand resumes from here instead of jumping.
          baseX = ev.clientX - dx
          baseY = ev.clientY - dy
          return
        }
        dx = ev.clientX - baseX
        dy = ev.clientY - baseY
        if (!engaged) {
          if (Math.hypot(dx, dy) < HAND_DRAG_SLOP) return
          engaged = true
          setMode('drag')
        }
        store.moveTo(panel.id, from.x + dx, from.y + dy)
      },
      () => setMode('idle'),
    )
  }

  const onGrip = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation()
    e.preventDefault()
    store.focus(panel.id)
    const base = { x: panel.x, y: panel.y, w: panel.w, h: panel.h }
    const sx = e.clientX
    const sy = e.clientY
    setMode('resize')
    track(e.pointerId)(
      (ev) => store.setRect(panel.id, { ...base, w: base.w + ev.clientX - sx, h: base.h + ev.clientY - sy }),
      () => setMode('idle'),
    )
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close(panel.id)
    }
  }

  const title = REPORT_TITLE[panel.kind]
  const titleId = `${panel.id}-title`
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-panel-id={panel.id}
      data-panel-kind={panel.kind}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={clsx('fpanel', front && 'fpanel-front', mode !== 'idle' && `fpanel-${mode}`)}
      style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h, zIndex: panel.z }}
    >
      <header className="fpanel-head" data-drag-handle>
        <GripHorizontal className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {patient && (
            <p className="truncate text-xs text-ink-muted">
              <span className="font-mono text-cyan-soft">{patient.id}</span> {patient.fullName} · {patientLine(snap, patient)}
            </p>
          )}
        </div>
        <SyntheticTag />
        <div className="flex items-center gap-0.5">
          <button type="button" className="fpanel-btn" aria-label="Make report smaller" onClick={() => store.scaleAround(panel.id, panel, 0.85)}>
            <Minus className="size-4" />
          </button>
          <button type="button" className="fpanel-btn" aria-label="Make report larger" onClick={() => store.scaleAround(panel.id, panel, 1.18)}>
            <Plus className="size-4" />
          </button>
          <button type="button" className="fpanel-btn fpanel-close" aria-label="Close report" onClick={() => close(panel.id)}>
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div className="fpanel-body" data-panel-scroll={panel.id} tabIndex={0} aria-label={`${title} content`}>
        {patient ? <ReportBody kind={panel.kind} patient={patient} snap={snap} /> : <p className="text-sm text-ink-muted">Patient {panel.patientId} is no longer in the synthetic database.</p>}
      </div>
      <footer className="fpanel-foot">Synthetic record · not a medical device · requires qualified clinician review</footer>
      <span className="fpanel-grip" data-panel-resize onPointerDown={onGrip} aria-hidden title="Drag to resize" />
    </div>
  )
}

export function PanelLayer() {
  const { panels } = usePanels()
  const top = panels.reduce<PanelState | null>((a, b) => (!a || b.z > a.z ? b : a), null)
  return (
    <div className="fpanel-layer">
      {panels.map((p) => (
        <FloatingPanel key={p.id} panel={p} front={p.id === top?.id} />
      ))}
    </div>
  )
}
