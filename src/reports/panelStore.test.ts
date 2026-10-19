import { describe, expect, it } from 'vitest'
import { MIN_H, MIN_W, PanelStore, TwoHandResizer } from './panelStore'

const vp = () => ({ w: 1440, h: 900 })

describe('PanelStore', () => {
  it('opens panels on-screen, focuses duplicates instead of reopening, and stacks by z', () => {
    const s = new PanelStore(vp)
    const a = s.open('summary', '104')
    const b = s.open('visit', '104')
    expect(s.getSnapshot()).toHaveLength(2)
    expect(s.top()!.id).toBe(b)
    expect(s.open('summary', '104')).toBe(a)
    expect(s.getSnapshot()).toHaveLength(2)
    expect(s.top()!.id).toBe(a)
    for (const p of s.getSnapshot()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + p.w).toBeLessThanOrEqual(1440)
      expect(p.y + p.h).toBeLessThanOrEqual(900)
    }
  })

  it('moves within bounds so a panel can never be lost off-screen', () => {
    const s = new PanelStore(vp)
    const id = s.open('summary', '104')
    s.moveTo(id, -5000, -5000)
    const p = s.get(id)!
    expect(p.x + p.w).toBeGreaterThanOrEqual(96)
    expect(p.y).toBeGreaterThanOrEqual(0)
    s.moveTo(id, 99999, 99999)
    expect(s.get(id)!.x).toBeLessThanOrEqual(1440 - 96)
  })

  it('scales about the centre and clamps to min/max size', () => {
    const s = new PanelStore(vp)
    const id = s.open('summary', '104')
    const base = { ...s.get(id)! }
    const cx = base.x + base.w / 2
    s.scaleAround(id, base, 0.8)
    const p = s.get(id)!
    expect(p.w).toBe(Math.round(base.w * 0.8))
    expect(p.x + p.w / 2).toBeCloseTo(cx, 0)
    s.scaleAround(id, base, 0.01)
    expect(s.get(id)!.w).toBe(MIN_W)
    expect(s.get(id)!.h).toBe(MIN_H)
    s.scaleAround(id, base, 50)
    expect(s.get(id)!.w).toBeLessThanOrEqual(1440)
  })

  it('growing keeps the panel fully on-screen and below the top bar', () => {
    const s = new PanelStore(vp)
    const id = s.open('summary', '104')
    s.scaleAround(id, { ...s.get(id)! }, 1.6)
    const p = s.get(id)!
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x + p.w).toBeLessThanOrEqual(1440)
    expect(p.y).toBeGreaterThanOrEqual(64)
    expect(p.y + p.h).toBeLessThanOrEqual(900)
    s.moveTo(id, 100, -400)
    expect(s.get(id)!.y).toBe(64)
  })

  it('closes the front panel, or all', () => {
    const s = new PanelStore(vp)
    s.open('summary', '104')
    const b = s.open('labs', '104')
    expect(s.closeTop()).toBe(true)
    expect(s.get(b)).toBeNull()
    s.open('vitals', '105')
    s.closeAll()
    expect(s.getSnapshot()).toHaveLength(0)
    expect(s.closeTop()).toBe(false)
    expect(s.scaleTop(1.2)).toBe(false)
  })
})

describe('TwoHandResizer', () => {
  it('scales the target by hand distance ratio, latched to the size at the start', () => {
    const s = new PanelStore(vp)
    const id = s.open('summary', '104')
    const start = { ...s.get(id)! }
    const r = new TwoHandResizer(s)
    expect(r.update(400, () => id)).toBe(true) // anchor
    for (let i = 0; i < 30; i++) r.update(520, () => id) // hands 30% further apart
    expect(s.get(id)!.w).toBeGreaterThan(start.w * 1.25)
    for (let i = 0; i < 30; i++) r.update(300, () => id) // hands together
    expect(s.get(id)!.w).toBeLessThan(start.w * 0.8)
    expect(r.update(null, () => id)).toBe(false)
    // A new gesture re-anchors on the current size rather than jumping.
    const now = s.get(id)!.w
    r.update(900, () => id)
    expect(s.get(id)!.w).toBe(now)
  })

  it('does nothing without a target panel', () => {
    const s = new PanelStore(vp)
    const r = new TwoHandResizer(s)
    expect(r.update(400, () => null)).toBe(false)
  })
})
