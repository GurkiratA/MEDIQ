/**
 * Geometry and stacking for floating report panels. Framework-free so drag,
 * resize, scale and clamping can be unit-tested; React subscribes through
 * useSyncExternalStore (see PanelContext).
 */
import type { ReportKind } from './reportKinds'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PanelState extends Rect {
  id: string
  kind: ReportKind
  patientId: string
  z: number
}

export const MIN_W = 340
export const MIN_H = 240
/** Always keep this much of a panel on-screen so it can be grabbed back. */
const KEEP_VISIBLE = 96
/** The top bar stays uncovered so navigation is always reachable. */
const TOP_RESERVED = 64
const MARGIN = 8

export type Viewport = () => { w: number; h: number }

const defaultViewport: Viewport = () =>
  typeof window === 'undefined' ? { w: 1440, h: 900 } : { w: window.innerWidth, h: window.innerHeight }

export class PanelStore {
  private panels: PanelState[] = []
  private listeners = new Set<() => void>()
  private seq = 0
  private z = 10
  private readonly viewport: Viewport

  constructor(viewport: Viewport = defaultViewport) {
    this.viewport = viewport
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  getSnapshot = (): PanelState[] => this.panels

  private commit(next: PanelState[]) {
    this.panels = next
    this.listeners.forEach((l) => l())
  }

  private patch(id: string, p: Partial<PanelState>) {
    if (!this.panels.some((x) => x.id === id)) return
    this.commit(this.panels.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }

  get(id: string) {
    return this.panels.find((p) => p.id === id) ?? null
  }

  /** The front-most panel, which voice commands act on. */
  top(): PanelState | null {
    return this.panels.reduce<PanelState | null>((a, b) => (!a || b.z > a.z ? b : a), null)
  }

  maxSize() {
    const v = this.viewport()
    return { w: Math.max(MIN_W, v.w - 2 * MARGIN), h: Math.max(MIN_H, v.h - TOP_RESERVED - MARGIN) }
  }

  clampSize(w: number, h: number) {
    const m = this.maxSize()
    return { w: Math.round(Math.min(m.w, Math.max(MIN_W, w))), h: Math.round(Math.min(m.h, Math.max(MIN_H, h))) }
  }

  clampPos(x: number, y: number, w: number) {
    const v = this.viewport()
    return {
      x: Math.round(Math.min(v.w - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - w, x))),
      y: Math.round(Math.min(v.h - KEEP_VISIBLE / 2, Math.max(TOP_RESERVED, y))),
    }
  }

  /** Fully on-screen when it fits (used when the size changes, so growing never pushes it off an edge). */
  clampInside(x: number, y: number, w: number, h: number) {
    const v = this.viewport()
    const fit = (p: number, size: number, lo: number, hi: number) => (size > hi - lo ? lo + (hi - lo - size) / 2 : Math.min(hi - size, Math.max(lo, p)))
    return { x: Math.round(fit(x, w, MARGIN, v.w - MARGIN)), y: Math.round(fit(y, h, TOP_RESERVED, v.h - MARGIN)) }
  }

  /** Opens a report, or brings an identical one to the front. Returns its id. */
  open(kind: ReportKind, patientId: string): string {
    const existing = this.panels.find((p) => p.kind === kind && p.patientId === patientId)
    if (existing) {
      this.focus(existing.id)
      return existing.id
    }
    const v = this.viewport()
    const { w, h } = this.clampSize(Math.min(760, v.w * 0.52), Math.min(820, (v.h - TOP_RESERVED) * 0.86))
    const cascade = (this.panels.length % 5) * 28
    const pos = this.clampInside(v.w - w - 40 - cascade, TOP_RESERVED + 20 + cascade, w, h)
    const id = `panel-${++this.seq}`
    this.commit([...this.panels, { id, kind, patientId, w, h, ...pos, z: ++this.z }])
    return id
  }

  close(id: string) {
    this.commit(this.panels.filter((p) => p.id !== id))
  }

  closeTop(): boolean {
    const t = this.top()
    if (!t) return false
    this.close(t.id)
    return true
  }

  closeAll() {
    this.commit([])
  }

  focus(id: string) {
    const p = this.get(id)
    if (!p || p.z === this.z) return
    this.patch(id, { z: ++this.z })
  }

  moveTo(id: string, x: number, y: number) {
    const p = this.get(id)
    if (!p) return
    this.patch(id, this.clampPos(x, y, p.w))
  }

  setRect(id: string, r: Rect) {
    const s = this.clampSize(r.w, r.h)
    this.patch(id, { ...s, ...this.clampPos(r.x, r.y, s.w) })
  }

  /** Scales `base` by `factor` about its centre (two-hand resize, voice "larger"). */
  scaleAround(id: string, base: Rect, factor: number) {
    const k = Number.isFinite(factor) && factor > 0 ? factor : 1
    const s = this.clampSize(base.w * k, base.h * k)
    const cx = base.x + base.w / 2
    const cy = base.y + base.h / 2
    this.patch(id, { ...s, ...this.clampInside(cx - s.w / 2, cy - s.h / 2, s.w, s.h) })
  }

  scaleTop(factor: number): boolean {
    const t = this.top()
    if (!t) return false
    this.scaleAround(t.id, t, factor)
    return true
  }

  /** Re-clamp after the window resizes. */
  refit() {
    if (!this.panels.length) return
    this.commit(
      this.panels.map((p) => {
        const s = this.clampSize(p.w, p.h)
        return { ...p, ...s, ...this.clampPos(p.x, p.y, s.w) }
      }),
    )
  }
}

/**
 * Two-hand pinch resize. When both hands pinch, the target panel is scaled
 * about its centre by (current hand distance / starting hand distance). The
 * distance is lightly smoothed and the base is latched at the start, so the
 * size tracks the hands without compounding error. Ends when either hand
 * releases.
 */
export class TwoHandResizer {
  private active: { id: string; base: Rect; span: number; smooth: number } | null = null
  private readonly store: PanelStore

  constructor(store: PanelStore) {
    this.store = store
  }

  get activeId() {
    return this.active?.id ?? null
  }

  /** @param span distance between the two pinch points, or null when fewer than two hands pinch. */
  update(span: number | null, pickTarget: () => string | null): boolean {
    if (span === null) {
      this.active = null
      return false
    }
    if (!this.active) {
      const id = pickTarget()
      const p = id ? this.store.get(id) : null
      if (!p) return false
      this.store.focus(p.id)
      this.active = { id: p.id, base: { x: p.x, y: p.y, w: p.w, h: p.h }, span: Math.max(span, 40), smooth: Math.max(span, 40) }
      return true
    }
    if (!this.store.get(this.active.id)) {
      this.active = null
      return false
    }
    this.active.smooth += (Math.max(span, 1) - this.active.smooth) * 0.4
    this.store.scaleAround(this.active.id, this.active.base, this.active.smooth / this.active.span)
    return true
  }
}
