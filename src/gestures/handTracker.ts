/**
 * Per-frame hand tracking state, independent of the camera, MediaPipe and the
 * DOM so every transition can be unit-tested with landmark fixtures.
 *
 * Input: MediaPipe HandLandmarker landmarks for up to two hands (normalised,
 * UN-mirrored camera coordinates). Output: up to two tracked hands with
 *  - a stable id (0/1) that survives MediaPipe re-ordering and the occasional
 *    one-frame handedness flip (identity follows continuity first),
 *  - 1€-smoothed joints and cursor in viewport pixels, mirrored so moving your
 *    hand right moves the cursor right,
 *  - a pinch state with hysteresis + confirmation + post-pose settling,
 *  - a held (debounced) pose: point / pinch / peace / open / fist / other,
 *  - an aim point taken from slightly before the pinch closed, because the
 *    fingertip travels while the fingers meet.
 *
 * Approach adapted from the JARVIS reference project's hands.ts (MIT).
 */
import { OneEuroPoint } from './oneEuro'

export interface Landmark {
  x: number
  y: number
  z?: number
}

export interface RawHand {
  landmarks: Landmark[]
  /** MediaPipe category name: 'Left' | 'Right'. */
  handedness?: string
}

export type HandPose = 'point' | 'pinch' | 'peace' | 'open' | 'fist' | 'other'
export type Side = 'left' | 'right'

export interface Point {
  x: number
  y: number
}

export interface TrackedHand {
  id: number
  side: Side
  /** 21 joints in viewport px (smoothed, mirrored). */
  points: Point[]
  /** Cursor: smoothed index fingertip in viewport px, clamped on-screen. */
  x: number
  y: number
  /** Where a press aims: the cursor a moment before the fingers closed. */
  aimX: number
  aimY: number
  pinched: boolean
  /** 0..1 — how closed the pinch is (for the cursor ring). */
  closeness: number
  pose: HandPose
  /** Wrist→middle-knuckle length in px (scale for drawing). */
  span: number
}

export interface TrackerConfig {
  /** Pinch engages below this thumb–index gap (fraction of hand span)… */
  pinchOn: number
  /** …and releases above this one (hysteresis). */
  pinchOff: number
  /** A pinch must persist this long before it presses (ms). */
  pinchConfirmMs: number
  /** After a pose change, presses are ignored for this long (ms). */
  poseSettleMs: number
  /** Non-pinch poses must hold this long before they are reported (ms). */
  poseHoldMs: number
  /** How far back the aim point reads (ms). */
  aimLagMs: number
  /** Fraction of the camera frame trimmed from each edge before mapping to the
   *  viewport, so the screen edges are reachable without leaving the frame. */
  insetX: number
  insetY: number
  /** Camera frame aspect ratio (width / height). */
  frameAspect: number
  cursorMinCutoff: number
  cursorBeta: number
  jointMinCutoff: number
  jointBeta: number
  /** A detection within this fraction of the screen diagonal of last frame's
   *  wrist is the same hand, whatever its handedness label says. */
  maxJumpFraction: number
}

export const DEFAULT_TRACKER: TrackerConfig = {
  pinchOn: 0.46,
  pinchOff: 0.66,
  pinchConfirmMs: 55,
  poseSettleMs: 160,
  poseHoldMs: 140,
  aimLagMs: 150,
  insetX: 0.1,
  insetY: 0.12,
  frameAspect: 4 / 3,
  cursorMinCutoff: 1.1,
  cursorBeta: 0.012,
  jointMinCutoff: 2.4,
  jointBeta: 0.02,
  maxJumpFraction: 0.28,
}

const WRIST = 0
const THUMB_MCP = 2
const THUMB_TIP = 4
const INDEX_PIP = 6
const INDEX_TIP = 8
const MIDDLE_MCP = 9
const MIDDLE_PIP = 10
const MIDDLE_TIP = 12
const RING_PIP = 14
const RING_TIP = 16
const PINKY_PIP = 18
const PINKY_TIP = 20
const EXTEND_RATIO = 1.12
const TRAIL_MS = 500

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export interface Fingers {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
}

/** Rotation-invariant: a finger is extended when its tip is clearly farther from the wrist than its middle joint. */
export function fingersOf(p: Point[]): Fingers {
  const ext = (tip: number, pip: number) => dist(p[tip], p[WRIST]) > dist(p[pip], p[WRIST]) * EXTEND_RATIO
  const span = dist(p[WRIST], p[MIDDLE_MCP]) || 1
  return {
    thumb: dist(p[THUMB_TIP], p[WRIST]) > dist(p[THUMB_MCP], p[WRIST]) * 1.35 || dist(p[THUMB_TIP], p[INDEX_PIP]) > span * 1.1,
    index: ext(INDEX_TIP, INDEX_PIP),
    middle: ext(MIDDLE_TIP, MIDDLE_PIP),
    ring: ext(RING_TIP, RING_PIP),
    pinky: ext(PINKY_TIP, PINKY_PIP),
  }
}

export function classifyHandPose(f: Fingers, pinched: boolean): HandPose {
  if (pinched) return 'pinch'
  const { index, middle, ring, pinky } = f
  const up = [index, middle, ring, pinky].filter(Boolean).length
  if (index && middle && !ring && !pinky) return 'peace'
  if (index && !middle && !ring && !pinky) return 'point'
  if (up >= 4) return 'open'
  if (up === 0) return 'fist'
  return 'other'
}

interface HandState {
  filters: { cursor: OneEuroPoint; joints: OneEuroPoint[] }
  trail: { x: number; y: number; at: number }[]
  pinchSince: number | null
  poseChangedAt: number
  settling: { raw: HandPose; since: number; held: HandPose }
  sideVote: number
  /** False until this hand has been seen with its fingers apart. A hand that
   *  enters (or re-enters) the frame already pinched cannot press until it opens. */
  armed: boolean
  hand: TrackedHand
}

export interface FrameResult {
  hands: TrackedHand[]
  /** Hands that disappeared this frame, with their last cursor position. */
  lost: { id: number; x: number; y: number; wasPinched: boolean }[]
}

export class HandTracker {
  readonly config: TrackerConfig
  private states = new Map<number, HandState>()

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_TRACKER, ...config }
  }

  setFrameAspect(aspect: number) {
    if (Number.isFinite(aspect) && aspect > 0) this.config.frameAspect = aspect
  }

  get hands(): TrackedHand[] {
    return [...this.states.values()].map((s) => s.hand).sort((a, b) => a.id - b.id)
  }

  /** Forget every hand (camera off). Returns what was dropped so presses can be released. */
  reset(): FrameResult['lost'] {
    const lost = [...this.states.values()].map((s) => ({ id: s.hand.id, x: s.hand.x, y: s.hand.y, wasPinched: s.hand.pinched }))
    this.states.clear()
    return lost
  }

  /** Normalised camera → viewport px, mirrored and inset. */
  toViewport(m: Landmark, vw: number, vh: number): Point {
    const { insetX: ix, insetY: iy } = this.config
    return { x: ((1 - m.x - ix) / (1 - 2 * ix)) * vw, y: ((m.y - iy) / (1 - 2 * iy)) * vh }
  }

  update(raw: RawHand[], viewport: { w: number; h: number }, nowMs: number): FrameResult {
    const c = this.config
    const { w, h } = viewport
    const at = nowMs / 1000
    const reach = Math.hypot(w, h)
    // Viewport px per isotropic camera px, per axis — undone when measuring hand
    // geometry so a stretched mapping cannot bias the pinch ratio.
    const sx = w / (1 - 2 * c.insetX) / c.frameAspect
    const sy = h / (1 - 2 * c.insetY)
    const iso = (a: Point, b: Point) => Math.hypot((a.x - b.x) / sx, (a.y - b.y) / sy)

    const seen = new Set<number>()
    const lost: FrameResult['lost'] = []
    for (const r of raw.slice(0, 2)) {
      const lm = r.landmarks
      if (!lm || lm.length < 21) continue
      const named: Side = r.handedness === 'Right' ? 'right' : 'left'
      const wrist = this.toViewport(lm[WRIST], w, h)
      const slot = this.slotFor(named, wrist, seen, reach)
      const id = slot.id
      seen.add(id)
      const stale = this.states.get(id)
      if (stale && !slot.continuous) {
        // Same slot, different place: a re-acquired hand. Start it fresh so the
        // filters do not glide the cursor across the screen.
        lost.push({ id, x: stale.hand.x, y: stale.hand.y, wasPinched: stale.hand.pinched })
        this.states.delete(id)
      }

      let s = this.states.get(id)
      if (!s) {
        s = {
          filters: {
            cursor: new OneEuroPoint(c.cursorMinCutoff, c.cursorBeta),
            joints: Array.from({ length: 21 }, () => new OneEuroPoint(c.jointMinCutoff, c.jointBeta)),
          },
          trail: [],
          pinchSince: null,
          poseChangedAt: nowMs,
          settling: { raw: 'other', since: nowMs, held: 'other' },
          sideVote: 0,
          armed: false,
          hand: { id, side: named, points: [], x: wrist.x, y: wrist.y, aimX: wrist.x, aimY: wrist.y, pinched: false, closeness: 0, pose: 'other', span: 1 },
        }
        this.states.set(id, s)
      }
      const hand = s.hand
      const points = lm.map((m, j) => {
        const v = this.toViewport(m, w, h)
        return s.filters.joints[j].filter(v.x, v.y, at)
      })
      hand.points = points
      hand.span = dist(points[WRIST], points[MIDDLE_MCP]) || 1
      const gap = iso(points[THUMB_TIP], points[INDEX_TIP]) / (iso(points[WRIST], points[MIDDLE_MCP]) || 1e-6)

      // Pinch: hysteresis, then confirmation, then a settling window after a pose change.
      if (gap >= c.pinchOn) s.armed = true
      const wants = s.armed && (hand.pinched ? gap < c.pinchOff : gap < c.pinchOn)
      if (wants && !hand.pinched) s.pinchSince = s.pinchSince ?? nowMs
      else if (!wants) s.pinchSince = null
      const settled = nowMs - s.poseChangedAt > c.poseSettleMs
      const pinched = hand.pinched ? wants : wants && s.pinchSince !== null && nowMs - s.pinchSince >= c.pinchConfirmMs && settled
      hand.closeness = Math.max(0, Math.min(1, 1 - (gap - c.pinchOn) / (c.pinchOff - c.pinchOn)))

      const tip = points[INDEX_TIP]
      const cur = s.filters.cursor.filter(tip.x, tip.y, at)
      hand.x = Math.max(0, Math.min(w - 1, cur.x))
      hand.y = Math.max(0, Math.min(h - 1, cur.y))
      s.trail.push({ x: hand.x, y: hand.y, at: nowMs })
      while (s.trail.length > 1 && nowMs - s.trail[0].at > TRAIL_MS) s.trail.shift()
      if (!pinched) {
        const want = nowMs - c.aimLagMs
        let pick = s.trail[0]
        for (const p of s.trail) if (p.at <= want) pick = p
        hand.aimX = pick.x
        hand.aimY = pick.y
      }
      hand.pinched = pinched

      const prevPose = hand.pose
      hand.pose = this.stablePose(s, classifyHandPose(fingersOf(points), pinched), nowMs)
      if (hand.pose !== prevPose && hand.pose !== 'pinch' && prevPose !== 'pinch') s.poseChangedAt = nowMs

      s.sideVote = Math.max(-6, Math.min(6, s.sideVote + (named === 'right' ? 1 : -1)))
      hand.side = s.sideVote >= 0 ? 'right' : 'left'
    }

    for (const [id, s] of this.states) {
      if (seen.has(id)) continue
      lost.push({ id, x: s.hand.x, y: s.hand.y, wasPinched: s.hand.pinched })
      this.states.delete(id)
    }
    return { hands: this.hands, lost }
  }

  private stablePose(s: HandState, raw: HandPose, now: number): HandPose {
    if (raw === 'pinch') {
      s.settling = { raw, since: now, held: raw }
      return raw
    }
    if (s.settling.raw !== raw) {
      s.settling = { raw, since: now, held: s.settling.held === 'pinch' ? 'other' : s.settling.held }
      return s.settling.held
    }
    if (now - s.settling.since >= this.config.poseHoldMs) s.settling.held = raw
    return s.settling.held
  }

  /** Continuity first (nearest wrist last frame), handedness only for a genuinely new hand. */
  private slotFor(side: Side, wrist: Point, taken: Set<number>, reach: number): { id: number; continuous: boolean } {
    let best = -1
    let bestDist = Infinity
    for (const [id, s] of this.states) {
      if (taken.has(id) || !s.hand.points[WRIST]) continue
      const d = dist(s.hand.points[WRIST], wrist)
      if (d < bestDist) {
        bestDist = d
        best = id
      }
    }
    if (best !== -1 && bestDist < reach * this.config.maxJumpFraction) return { id: best, continuous: true }
    const want = side === 'right' ? 1 : 0
    const order = [want, want === 1 ? 0 : 1].filter((i) => !taken.has(i))
    const free = order.find((i) => !this.states.has(i))
    return { id: free ?? order[0], continuous: false }
  }
}

/** Pinch point of a hand: midway between thumb and index tips. */
export function pinchPoint(h: TrackedHand): Point {
  const t = h.points[THUMB_TIP]
  const i = h.points[INDEX_TIP]
  return t && i ? { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 } : { x: h.x, y: h.y }
}

/** Both hands pinching: their pinch points and the distance between them. */
export function twoHandPinch(hands: TrackedHand[]): { a: Point; b: Point; span: number; center: Point } | null {
  const p = hands.filter((h) => h.pinched)
  if (p.length < 2) return null
  const a = pinchPoint(p[0])
  const b = pinchPoint(p[1])
  return { a, b, span: dist(a, b), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
}

export const HAND_BONES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]
