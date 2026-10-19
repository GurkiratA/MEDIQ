import { describe, expect, it } from 'vitest'
import { classifyPose, GestureEngine, type GestureEvent, type Landmark } from './classifier'
import { FIST, makeHand, OPEN_PALM, PINCH, POINT, THUMBS_UP } from './fixtures'

describe('pose classification (landmark fixtures)', () => {
  it.each([
    ['open palm', OPEN_PALM, 'open-palm'],
    ['fist', FIST, 'fist'],
    ['thumbs up', THUMBS_UP, 'thumbs-up'],
    ['pinch', PINCH, 'pinch'],
    ['point', POINT, 'point'],
  ] as const)('%s', (_n, lm, expected) => {
    expect(classifyPose(lm)).toBe(expected)
  })

  it('is translation invariant', () => {
    expect(classifyPose(makeHand({ thumb: 'out', fingers: ['extended', 'extended', 'extended', 'extended'], dx: -0.2, dy: 0.1 }))).toBe('open-palm')
  })

  it('handles missing input', () => {
    expect(classifyPose(null)).toBe('unknown')
    expect(classifyPose([])).toBe('unknown')
  })
})

function feed(engine: GestureEngine, frames: (Landmark[] | null)[], startT = 0, fps = 30): GestureEvent[] {
  const events: GestureEvent[] = []
  frames.forEach((f, i) => {
    const e = engine.update(f, startT + (i * 1000) / fps)
    if (e) events.push(e)
  })
  return events
}
const hold = (lm: Landmark[], ms: number, fps = 30) => Array.from({ length: Math.round((ms / 1000) * fps) }, () => lm)

describe('gesture engine', () => {
  it('fires pause once for a held open palm and does not repeat while held', () => {
    const e = new GestureEngine()
    const events = feed(e, hold(OPEN_PALM, 5000))
    expect(events).toEqual([{ type: 'pause' }])
  })

  it('does not fire before the dwell time', () => {
    const e = new GestureEngine()
    expect(feed(e, hold(OPEN_PALM, 400))).toEqual([])
  })

  it('re-arms only after the pose is released', () => {
    const e = new GestureEngine({ cooldownMs: { pause: 0, pinch: 0, 'thumbs-up': 0, swipe: 0 } })
    const events = feed(e, [...hold(OPEN_PALM, 1000), ...hold(FIST, 600), ...hold(OPEN_PALM, 1000)])
    expect(events.filter((x) => x.type === 'pause')).toHaveLength(2)
  })

  it('never swipes for a stationary hand', () => {
    const e = new GestureEngine()
    expect(feed(e, hold(FIST, 4000)).filter((x) => x.type === 'swipe')).toEqual([])
  })

  it('detects a fast horizontal swipe exactly once, with mirrored direction', () => {
    const e = new GestureEngine()
    // Image-space hand moves right (+x) → mirrored preview shows it moving left.
    const frames = Array.from({ length: 12 }, (_, i) => makeHand({ thumb: 'in', fingers: ['curled', 'curled', 'curled', 'curled'], dx: -0.2 + i * 0.04 }))
    const events = feed(e, [...frames, ...hold(frames[11], 1000)])
    expect(events).toEqual([{ type: 'swipe', direction: 'left' }])
  })

  it('ignores slow drift', () => {
    const e = new GestureEngine()
    const frames = Array.from({ length: 120 }, (_, i) => makeHand({ thumb: 'in', fingers: ['curled', 'curled', 'curled', 'curled'], dx: -0.2 + i * 0.003 }))
    expect(feed(e, frames).filter((x) => x.type === 'swipe')).toEqual([])
  })

  it('fires pinch once over many consecutive frames', () => {
    const e = new GestureEngine()
    expect(feed(e, hold(PINCH, 3000))).toEqual([{ type: 'pinch' }])
  })

  it('fires thumbs-up once and respects cooldown after re-arm', () => {
    const e = new GestureEngine()
    const events = feed(e, [...hold(THUMBS_UP, 900), ...hold(FIST, 400), ...hold(THUMBS_UP, 900)])
    expect(events.filter((x) => x.type === 'thumbs-up')).toHaveLength(1)
  })

  it('clears state when the hand disappears', () => {
    const e = new GestureEngine()
    feed(e, hold(OPEN_PALM, 300))
    expect(e.update(null, 400)).toBeNull()
    expect(e.currentPose).toBe('unknown')
  })
})
