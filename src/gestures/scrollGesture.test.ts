import { describe, expect, it } from 'vitest'
import { ScrollGesture } from './scrollGesture'

describe('ScrollGesture', () => {
  it('scrolls the latched target opposite to hand travel (hand up → content advances)', () => {
    const g = new ScrollGesture({ gain: 2, deadZone: 1 })
    const el = { scrollTop: 100 }
    let finds = 0
    const find = () => (finds++, el)
    expect(g.step(0, 500, find)).toBe(0) // first frame only latches
    g.step(0, 480, find) // hand moved up 20px
    expect(el.scrollTop).toBe(140)
    g.step(0, 500, find) // back down 20px
    expect(el.scrollTop).toBe(100)
    expect(finds).toBe(1)
  })

  it('ignores jitter inside the dead zone', () => {
    const g = new ScrollGesture({ deadZone: 2 })
    const el = { scrollTop: 0 }
    g.step(0, 300, () => el)
    g.step(0, 300.8, () => el)
    g.step(0, 299.5, () => el)
    expect(el.scrollTop).toBe(0)
  })

  it('re-latches after the gesture ends', () => {
    const g = new ScrollGesture()
    const a = { scrollTop: 0 }
    const b = { scrollTop: 0 }
    g.step(0, 300, () => a)
    g.end(0)
    g.step(0, 200, () => b)
    g.step(0, 190, () => b)
    expect(a.scrollTop).toBe(0)
    expect(b.scrollTop).toBeGreaterThan(0)
  })
})
