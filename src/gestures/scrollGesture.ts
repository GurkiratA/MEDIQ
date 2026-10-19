/**
 * Hand scrolling: hold index + middle finger up ("peace") over something
 * scrollable and move the hand up or down. Moving the hand up scrolls the
 * content up (reveals what is below), like pushing a page. The scroll target
 * is latched when the pose starts so it cannot jump to another element
 * mid-gesture. A small dead zone swallows landmark jitter.
 */

export interface ScrollConfig {
  /** Screen px of scroll per px of hand travel (a hand has less travel than a wheel). */
  gain: number
  /** Per-frame hand movement below this (px) is treated as jitter. */
  deadZone: number
}

export const DEFAULT_SCROLL: ScrollConfig = { gain: 2.4, deadZone: 0.8 }

type Scrollable = { scrollTop: number }

export function isScrollable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.scrollHeight <= el.clientHeight + 2) return false
  const oy = getComputedStyle(el).overflowY
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay'
}

/** Nearest scrollable ancestor of `el`, else the page itself. */
export function closestScrollable(el: Element | null): Scrollable | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.closest('[aria-modal="true"]') && !n.closest('[data-panel-scroll]')) break
    if (isScrollable(n)) return n as HTMLElement
  }
  return document.scrollingElement ?? null
}

export class ScrollGesture {
  private active = new Map<number, { lastY: number; target: Scrollable | null }>()
  private readonly c: ScrollConfig

  constructor(c: Partial<ScrollConfig> = {}) {
    this.c = { ...DEFAULT_SCROLL, ...c }
  }

  isActive(id: number) {
    return this.active.has(id)
  }

  /** Returns the scroll delta applied this frame. */
  step(id: number, y: number, findTarget: () => Scrollable | null): number {
    const s = this.active.get(id)
    if (!s) {
      this.active.set(id, { lastY: y, target: findTarget() })
      return 0
    }
    const dy = y - s.lastY
    if (Math.abs(dy) < this.c.deadZone) return 0
    s.lastY = y
    if (!s.target) return 0
    const delta = -dy * this.c.gain
    s.target.scrollTop += delta
    return delta
  }

  end(id: number) {
    this.active.delete(id)
  }

  reset() {
    this.active.clear()
  }
}
