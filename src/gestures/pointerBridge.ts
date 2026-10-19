/**
 * Turns tracked hands into ordinary PointerEvents dispatched at whatever is
 * under each hand's cursor — so every control that works with a mouse works
 * with a hand, and the floating report panels handle both through one code
 * path. Each hand is its own pointer (ids 9000/9001, pointerType 'touch').
 *
 *  pinch closes  → pointerdown at the aim point (where the finger was before
 *                  the fingers closed), target latched
 *  hand moves    → pointermove to the latched target while pressed (bubbles to
 *                  window, where drag handlers listen), else to the hovered
 *                  element
 *  pinch opens   → pointerup; plus a click if the hand barely travelled and is
 *                  still over the pressed control
 *  hand lost     → pointerup + pointercancel, so nothing stays stuck
 *
 * Safety: presses are never delivered inside modal dialogs or elements marked
 * `data-no-gesture` (enrollment, authorization, revocation, save confirmations).
 * Those still require a mouse/keyboard or the explicit review-then-thumbs-up
 * flow in confirmBus.
 */
import type { TrackedHand } from './handTracker'

export const HAND_POINTER_BASE = 9000
export const handPointerId = (handId: number) => HAND_POINTER_BASE + handId
export const isHandPointer = (e: { pointerId?: number }) => (e.pointerId ?? 0) >= HAND_POINTER_BASE && (e.pointerId ?? 0) < HAND_POINTER_BASE + 10

const INTERACTIVE = 'button, a[href], [role="tab"], [role="button"], [role="menuitem"], [role="option"], input, select, textarea, summary, label'

export function defaultIsBlocked(el: Element): boolean {
  return !!el.closest('[data-no-gesture], [aria-modal="true"]')
}

export type BridgeEvent =
  | { type: 'press'; id: number; target: Element | null; x: number; y: number }
  | { type: 'release'; id: number; target: Element | null; clicked: boolean }
  | { type: 'blocked'; id: number; target: Element }

export interface BridgeOptions {
  hitTest?: (x: number, y: number) => Element | null
  isBlocked?: (el: Element) => boolean
  /** Below this travel (px) a press-and-release is a click, not a drag. */
  clickSlop?: number
  onEvent?: (e: BridgeEvent) => void
}

interface Press {
  pressed: boolean
  blocked: boolean
  target: Element | null
  downX: number
  downY: number
  maxTravel: number
  hover: Element | null
}

function makePointerEvent(type: string, init: PointerEventInit & { pointerId: number }): Event {
  if (typeof PointerEvent === 'function') return new PointerEvent(type, init)
  // jsdom without PointerEvent: a MouseEvent carrying the pointer fields.
  const e = new MouseEvent(type, init)
  for (const k of ['pointerId', 'pointerType', 'isPrimary', 'pressure', 'width', 'height'] as const) {
    Object.defineProperty(e, k, { value: init[k as keyof PointerEventInit] })
  }
  return e
}

let capturePatched = false
/**
 * Synthetic pointer ids are unknown to the browser, so setPointerCapture with
 * one throws NotFoundError and kills the interaction. Capture is only an
 * optimisation here — hand events are routed to the pressed target every
 * frame — so failures for hand pointers are swallowed. Real pointers behave
 * exactly as before.
 */
export function patchPointerCapture() {
  if (capturePatched || typeof Element === 'undefined') return
  capturePatched = true
  const capture = Element.prototype.setPointerCapture
  const release = Element.prototype.releasePointerCapture
  Element.prototype.setPointerCapture = function (id: number) {
    try {
      return capture.call(this, id)
    } catch (err) {
      if (!isHandPointer({ pointerId: id })) throw err
    }
  }
  Element.prototype.releasePointerCapture = function (id: number) {
    try {
      return release.call(this, id)
    } catch (err) {
      if (!isHandPointer({ pointerId: id })) throw err
    }
  }
}

export class PointerBridge {
  private presses = new Map<number, Press>()
  private readonly hitTest: (x: number, y: number) => Element | null
  private readonly isBlocked: (el: Element) => boolean
  private readonly clickSlop: number
  private readonly onEvent?: (e: BridgeEvent) => void

  constructor(o: BridgeOptions = {}) {
    this.hitTest = o.hitTest ?? ((x, y) => document.elementFromPoint(x, y))
    this.isBlocked = o.isBlocked ?? defaultIsBlocked
    this.clickSlop = o.clickSlop ?? 18
    this.onEvent = o.onEvent
  }

  /** The element a hand's current press landed on (null when not pressed). */
  pressTarget(id: number): Element | null {
    const p = this.presses.get(id)
    return p?.pressed && !p.blocked ? p.target : null
  }

  isPressing(id: number) {
    return !!this.presses.get(id)?.pressed
  }

  private fire(el: Element | null, type: string, id: number, x: number, y: number, pressed: boolean) {
    if (!el) return
    el.dispatchEvent(
      makePointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        pointerId: handPointerId(id),
        pointerType: 'touch',
        isPrimary: id === 0,
        button: type === 'pointermove' ? -1 : 0,
        buttons: pressed ? 1 : 0,
        width: 1,
        height: 1,
        pressure: pressed ? 0.5 : 0,
      }),
    )
  }

  private setHover(p: Press, el: Element | null) {
    const next = el && !this.isBlocked(el) ? el.closest(INTERACTIVE) : null
    if (next === p.hover) return
    p.hover?.removeAttribute('data-hand-hover')
    next?.setAttribute('data-hand-hover', '')
    p.hover = next
  }

  sync(hands: TrackedHand[], lost: { id: number; x: number; y: number }[] = []) {
    for (const l of lost) this.release(l.id, l.x, l.y, true)
    for (const h of hands) this.step(h)
  }

  private step(h: TrackedHand) {
    let p = this.presses.get(h.id)
    if (!p) {
      p = { pressed: false, blocked: false, target: null, downX: h.x, downY: h.y, maxTravel: 0, hover: null }
      this.presses.set(h.id, p)
    }
    const over = this.hitTest(h.x, h.y)

    if (h.pinched && !p.pressed) {
      const target = this.hitTest(h.aimX, h.aimY) ?? over
      p.pressed = true
      p.target = target
      p.downX = h.aimX
      p.downY = h.aimY
      p.maxTravel = 0
      p.blocked = !!target && this.isBlocked(target)
      if (p.blocked) {
        this.onEvent?.({ type: 'blocked', id: h.id, target: target! })
        return
      }
      this.setHover(p, null)
      this.fire(target, 'pointerdown', h.id, h.aimX, h.aimY, true)
      this.onEvent?.({ type: 'press', id: h.id, target, x: h.aimX, y: h.aimY })
      return
    }

    if (!h.pinched && p.pressed) {
      this.release(h.id, h.x, h.y, false)
      this.setHover(p, over)
      return
    }

    if (p.pressed) {
      p.maxTravel = Math.max(p.maxTravel, Math.hypot(h.x - p.downX, h.y - p.downY))
      if (!p.blocked) this.fire(p.target, 'pointermove', h.id, h.x, h.y, true)
    } else {
      this.setHover(p, over)
      if (over && !this.isBlocked(over)) this.fire(over, 'pointermove', h.id, h.x, h.y, false)
    }
  }

  private release(id: number, x: number, y: number, cancelled: boolean) {
    const p = this.presses.get(id)
    if (!p) return
    if (cancelled) {
      p.hover?.removeAttribute('data-hand-hover')
      this.presses.delete(id)
    }
    if (!p.pressed) return
    const target = p.target
    const blocked = p.blocked
    p.pressed = false
    p.target = null
    p.blocked = false
    if (blocked || !target) return
    p.maxTravel = Math.max(p.maxTravel, Math.hypot(x - p.downX, y - p.downY))
    this.fire(target, 'pointerup', id, x, y, false)
    let clicked = false
    if (cancelled) {
      this.fire(target, 'pointercancel', id, x, y, false)
    } else if (p.maxTravel < this.clickSlop) {
      // Only a press that stayed put is a click; one that travelled was a drag.
      const over = this.hitTest(x, y)
      if (over && (over === target || target.contains(over) || over.contains(target))) {
        const control = (target.closest(INTERACTIVE) ?? target) as HTMLElement
        if (!this.isBlocked(control)) {
          control.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }))
          if (typeof control.focus === 'function' && control.matches('button, a, input, select, textarea, [tabindex]')) control.focus({ preventScroll: true })
          clicked = true
        }
      }
    }
    this.onEvent?.({ type: 'release', id, target, clicked })
  }

  /** Release every press (camera off, tracking stopped). */
  releaseAll() {
    for (const id of [...this.presses.keys()]) this.release(id, this.presses.get(id)!.downX, this.presses.get(id)!.downY, true)
  }
}
