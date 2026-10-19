import { describe, expect, it } from 'vitest'
import { HandTracker, twoHandPinch } from './handTracker'
import { synthHand, type SynthPose } from './synthetic'

const VW = 1440
const VH = 900
const DT = 33

/** Feeds `frames` identical frames and returns the tracker's last result. */
function run(t: HandTracker, clock: { now: number }, hands: { x: number; y: number; pose: SynthPose; side?: 'Left' | 'Right' }[], frames = 1) {
  let r = { hands: t.hands, lost: [] } as ReturnType<HandTracker['update']>
  for (let i = 0; i < frames; i++) {
    clock.now += DT
    r = t.update(hands.map((h) => synthHand(h.x, h.y, { pose: h.pose, vw: VW, vh: VH, side: h.side })), { w: VW, h: VH }, clock.now)
  }
  return r
}

function settle(t: HandTracker, clock: { now: number }, x: number, y: number, pose: SynthPose = 'point', side: 'Left' | 'Right' = 'Right') {
  const hands = [{ x, y, pose, side }]
  let r = t.update(hands.map((h) => synthHand(h.x, h.y, { pose: h.pose, vw: VW, vh: VH, side: h.side })), { w: VW, h: VH }, clock.now)
  for (let i = 0; i < 14; i++) {
    clock.now += DT
    r = t.update(hands.map((h) => synthHand(h.x, h.y, { pose: h.pose, vw: VW, vh: VH, side: h.side })), { w: VW, h: VH }, clock.now)
  }
  return r
}

const frame = (t: HandTracker, clock: { now: number }, hands: { x: number; y: number; pose: SynthPose; side?: 'Left' | 'Right' }[]) => {
  clock.now += DT
  return t.update(hands.map((h) => synthHand(h.x, h.y, { pose: h.pose, vw: VW, vh: VH, side: h.side })), { w: VW, h: VH }, clock.now)
}

describe('HandTracker', () => {
  it('maps the mirrored camera frame onto the viewport (cursor = index tip)', () => {
    const t = new HandTracker()
    const r = settle(t, { now: 0 }, 300, 450)
    expect(r.hands).toHaveLength(1)
    expect(r.hands[0].x).toBeCloseTo(300, -1)
    expect(r.hands[0].y).toBeCloseTo(450, -1)
    expect(r.hands[0].pose).toBe('point')
    expect(r.hands[0].pinched).toBe(false)
  })

  it('a hand on the left of the camera image appears on the right of the screen', () => {
    const t = new HandTracker()
    const hand = synthHand(720, 450, { vw: VW, vh: VH })
    const dx = 0.2 - hand.landmarks[8].x // index tip at 20% from the image's left edge
    const r = t.update([{ landmarks: hand.landmarks.map((p) => ({ ...p, x: p.x + dx })) }], { w: VW, h: VH }, 0)
    expect(r.hands[0].x).toBeCloseTo(((0.8 - 0.1) / 0.8) * VW, 0)
  })

  it('confirms a pinch only after it persists, and holds it through the hysteresis band', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    settle(t, clock, 700, 400)
    clock.now += 10
    let r = t.update([synthHand(700, 400, { pose: 'pinch', vw: VW, vh: VH })], { w: VW, h: VH }, clock.now)
    expect(r.hands[0].pinched).toBe(false) // one frame is not a press
    r = frame(t, clock, [{ x: 700, y: 400, pose: 'pinch' }])
    expect(r.hands[0].pinched).toBe(false) // still within confirmation
    r = run(t, clock, [{ x: 700, y: 400, pose: 'pinch' }], 4)
    expect(r.hands[0].pinched).toBe(true)
    expect(r.hands[0].pose).toBe('pinch')

    // Partially open (between ON and OFF thresholds): still pinched.
    const half = synthHand(700, 400, { pose: 'pinch', vw: VW, vh: VH })
    const tip = half.landmarks[8]
    const span = Math.hypot((half.landmarks[0].x - half.landmarks[9].x) * (4 / 3), half.landmarks[0].y - half.landmarks[9].y)
    half.landmarks[4] = { x: tip.x - (0.56 * span) / (4 / 3), y: tip.y }
    for (let i = 0; i < 4; i++) {
      clock.now += DT
      r = t.update([half], { w: VW, h: VH }, clock.now)
    }
    expect(r.hands[0].pinched).toBe(true)

    // Fully open: released.
    r = run(t, clock, [{ x: 700, y: 400, pose: 'point' }], 4)
    expect(r.hands[0].pinched).toBe(false)
  })

  it('ignores a pinch that arrives while the pose is still settling', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    settle(t, clock, 500, 500, 'open')
    // Switch to point then immediately pinch: inside the settle window → no press.
    run(t, clock, [{ x: 500, y: 500, pose: 'point' }], 5)
    let r = run(t, clock, [{ x: 500, y: 500, pose: 'pinch' }], 4)
    expect(r.hands[0].pinched).toBe(false)
    // Once the pose has settled, the same pinch presses.
    r = run(t, clock, [{ x: 500, y: 500, pose: 'pinch' }], 4)
    expect(r.hands[0].pinched).toBe(true)
  })

  it('aims a press from just before the fingers closed', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    settle(t, clock, 400, 300)
    // Hand drifts down while pinching (as the index moves to meet the thumb).
    for (let y = 310; y <= 360; y += 10) frame(t, clock, [{ x: 400, y, pose: 'pinch' }])
    const r = frame(t, clock, [{ x: 400, y: 360, pose: 'pinch' }])
    expect(r.hands[0].pinched).toBe(true)
    expect(r.hands[0].aimY).toBeLessThan(r.hands[0].y)
    expect(r.hands[0].aimY).toBeLessThan(330)
  })

  it('classifies peace (scroll) and fist (close) poses after a short hold', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    expect(settle(t, clock, 600, 500, 'peace').hands[0].pose).toBe('peace')
    expect(settle(t, clock, 600, 500, 'fist').hands[0].pose).toBe('fist')
    expect(settle(t, clock, 600, 500, 'open').hands[0].pose).toBe('open')
  })

  it('keeps hand identity by continuity even if MediaPipe flips the handedness label', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    const r1 = run(t, clock, [{ x: 300, y: 400, pose: 'point', side: 'Left' }, { x: 1100, y: 400, pose: 'point', side: 'Right' }], 5)
    const leftId = r1.hands.find((h) => h.x < 720)!.id
    const rightId = r1.hands.find((h) => h.x > 720)!.id
    expect(leftId).not.toBe(rightId)
    // Labels swapped for one frame, and array order reversed.
    const r2 = frame(t, clock, [{ x: 1110, y: 400, pose: 'point', side: 'Left' }, { x: 310, y: 400, pose: 'point', side: 'Right' }])
    expect(r2.lost).toHaveLength(0)
    expect(r2.hands.find((h) => h.x < 720)!.id).toBe(leftId)
    expect(r2.hands.find((h) => h.x > 720)!.id).toBe(rightId)
  })

  it('reports lost hands (with their pinch state) so presses can be released', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    settle(t, clock, 500, 400)
    run(t, clock, [{ x: 500, y: 400, pose: 'pinch' }], 6)
    clock.now += DT
    const r = t.update([], { w: VW, h: VH }, clock.now)
    expect(r.hands).toHaveLength(0)
    expect(r.lost).toEqual([expect.objectContaining({ wasPinched: true })])
  })

  it('reports two-hand pinch span for resizing', () => {
    const t = new HandTracker()
    const clock = { now: 0 }
    run(t, clock, [{ x: 400, y: 450, pose: 'point', side: 'Left' }, { x: 1000, y: 450, pose: 'point', side: 'Right' }], 12)
    const r = run(t, clock, [{ x: 400, y: 450, pose: 'pinch', side: 'Left' }, { x: 1000, y: 450, pose: 'pinch', side: 'Right' }], 6)
    const two = twoHandPinch(r.hands)
    expect(two).not.toBeNull()
    expect(two!.span).toBeGreaterThan(500)
    expect(two!.span).toBeLessThan(700)
  })
})
