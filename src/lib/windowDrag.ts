import { pinchCount } from './hands'
import { useStore, type DropZone } from '../store'

/**
 * Dragging a window — the MEDIQ dashboard or a blade — by hand or by mouse.
 *
 * Shared because the two must feel identical: a pinch picks either one up,
 * carrying it to the left or right edge docks it to that half of the screen,
 * and pulling it down off the bottom closes it. Learning that once and finding
 * it only half-works on the other kind of window is worse than not having it.
 *
 * Listens on `window`, not the element: the hand controller aims each event
 * with elementFromPoint, so one pixel into a drag the element under the cursor
 * is no longer the one that was grabbed. A synthetic event still bubbles to
 * window, so hand and mouse are handled by the same code.
 */

/** How close to an edge, as a fraction of the screen, before a drop docks or
 *  closes. Generous: a hand cannot hit a thin strip at the screen's edge. */
const SIDE_ZONE = 0.1
const CLOSE_ZONE = 0.86

/** A zone has to be held this long to count, so sweeping past an edge on the
 *  way somewhere else never docks or closes anything. */
const ZONE_DWELL_MS = 280

export function zoneAt(x: number, y: number): DropZone {
  if (y > window.innerHeight * CLOSE_ZONE) return 'close'
  if (x < window.innerWidth * SIDE_ZONE) return 'left'
  if (x > window.innerWidth * (1 - SIDE_ZONE)) return 'right'
  return null
}

export type DragHandlers = {
  /** Called with the movement since the previous event, not since the press —
   *  so a resize that happens mid-drag is never undone by the next move. */
  onMove: (dx: number, dy: number) => void
  /** The drag ended. `zone` is where it was dropped, if it was held in one. */
  onDrop?: (zone: DropZone) => void
}

export function startWindowDrag(e: { clientX: number; clientY: number; pointerType: string }, h: DragHandlers) {
  const setZone = useStore.getState().setDropZone
  let lastX = e.clientX
  let lastY = e.clientY
  let zone: DropZone = null
  let zoneSince = 0
  let cancelled = false
  let ended = false

  const move = (ev: PointerEvent) => {
    /**
     * Both hands pinching is a resize, not a drag. Re-anchor rather than
     * return: tracking the hand keeps the origin current, so when one hand
     * lets go the window carries on from here instead of leaping by however
     * far that hand travelled meanwhile.
     */
    if (ev.pointerType === 'touch' && pinchCount() > 1) {
      lastX = ev.clientX
      lastY = ev.clientY
      if (zone) setZone((zone = null))
      return
    }
    h.onMove(ev.clientX - lastX, ev.clientY - lastY)
    lastX = ev.clientX
    lastY = ev.clientY
    const now = zoneAt(ev.clientX, ev.clientY)
    if (now !== zone) {
      zone = now
      zoneSince = performance.now()
      setZone(now)
    }
  }

  const finish = () => {
    if (ended) return
    ended = true
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    setZone(null)
    const held = zone && performance.now() - zoneSince >= ZONE_DWELL_MS
    // A cancel means the hand left the camera mid-drag, not that someone let
    // go on purpose. Leave the window where it is; never dock or close it.
    h.onDrop?.(held && !cancelled ? zone : null)
  }

  /**
   * The tracker reports a lost hand as pointerup immediately followed by
   * pointercancel, from the same synchronous call. Deferring by a tick lets
   * the cancel arrive first, so a hand dropping out of frame near the bottom
   * of the camera's view can never read as "pulled down to close".
   */
  const up = () => {
    window.removeEventListener('pointermove', move)
    setTimeout(finish, 0)
  }
  const cancel = () => {
    cancelled = true
    finish()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}

/** Elements a pinch should press rather than pick the window up by. */
export const PRESSABLE =
  'button, a, input, select, textarea, label, [role="button"], .mq-click, .mq-list li, .mq-alerts li, .mq-cols .mq-table tbody tr'
