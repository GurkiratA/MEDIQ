/**
 * Hand-gesture classification from MediaPipe's 21 hand landmarks (normalised
 * image coordinates, y grows downward). Pure and deterministic so it can be
 * tested with landmark fixtures, independent of the camera and UI.
 *
 * Static poses (open palm, pinch, thumbs-up) must be held stably for a dwell
 * period, fire once, and re-arm only after the pose is released. Swipes need
 * fast horizontal travel, so a stationary hand can never trigger one; each
 * event type has its own cooldown.
 */

export interface Landmark {
  x: number
  y: number
  z?: number
}

export type Pose = 'open-palm' | 'pinch' | 'thumbs-up' | 'fist' | 'point' | 'unknown'

export type GestureEvent = { type: 'pause' } | { type: 'pinch' } | { type: 'thumbs-up' } | { type: 'swipe'; direction: 'left' | 'right' }

const WRIST = 0
const THUMB = [1, 2, 3, 4]
const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

export function palmSize(lm: Landmark[]): number {
  return Math.max(1e-4, dist(lm[WRIST], lm[9]))
}

/** Finger extended when its tip is clearly farther from the wrist than its PIP joint. */
function fingerExtended(lm: Landmark[], f: number[]): boolean {
  return dist(lm[WRIST], lm[f[3]]) > dist(lm[WRIST], lm[f[1]]) * 1.15
}

function thumbExtended(lm: Landmark[]): boolean {
  const p = palmSize(lm)
  return dist(lm[THUMB[3]], lm[5]) > p * 0.45 && dist(lm[THUMB[3]], lm[17]) > dist(lm[THUMB[1]], lm[17]) * 1.05
}

export function classifyPose(lm: Landmark[] | null | undefined): Pose {
  if (!lm || lm.length < 21) return 'unknown'
  const p = palmSize(lm)
  const ext = FINGERS.map((f) => fingerExtended(lm, f))
  const nExt = ext.filter(Boolean).length
  const thumb = thumbExtended(lm)
  const pinchDist = dist(lm[4], lm[8])

  // Pinch: thumb tip touching index tip while the index is not curled into the palm.
  if (pinchDist < p * 0.28 && dist(lm[WRIST], lm[8]) > p * 0.9) return 'pinch'
  // Thumbs-up: four fingers curled, thumb extended and pointing clearly upward.
  if (nExt === 0 && thumb && lm[4].y < Math.min(lm[5].y, lm[9].y, lm[13].y, lm[17].y) - p * 0.4 && lm[4].y < lm[3].y) return 'thumbs-up'
  if (nExt === 4 && thumb) return 'open-palm'
  if (nExt === 0) return 'fist'
  if (ext[0] && nExt === 1) return 'point'
  return 'unknown'
}

export interface EngineOptions {
  /** Hold time before a static pose fires (ms). */
  dwellMs: number
  /** Pose must be absent this long before the same pose can fire again (ms). */
  releaseMs: number
  cooldownMs: Record<GestureEvent['type'], number>
  /** Horizontal travel (fraction of frame width) required for a swipe. */
  swipeDistance: number
  /** Maximum duration of a swipe motion (ms). */
  swipeWindowMs: number
  /** Exponential smoothing factor for the palm centre (0..1, higher = less smoothing). */
  smoothing: number
  /** The preview is mirrored, so user-perspective direction is the inverse of image x. */
  mirrored: boolean
}

export const DEFAULT_ENGINE: EngineOptions = {
  dwellMs: 600,
  releaseMs: 350,
  cooldownMs: { pause: 2000, pinch: 1200, 'thumbs-up': 2000, swipe: 1000 },
  swipeDistance: 0.22,
  swipeWindowMs: 450,
  smoothing: 0.55,
  mirrored: true,
}

const POSE_EVENT: Partial<Record<Pose, GestureEvent['type']>> = { 'open-palm': 'pause', pinch: 'pinch', 'thumbs-up': 'thumbs-up' }

export class GestureEngine {
  private readonly o: EngineOptions
  private pose: Pose = 'unknown'
  private poseSince = 0
  private firedPose: Pose | null = null
  private lastSeenFired = 0
  private lastFired: Partial<Record<GestureEvent['type'], number>> = {}
  private track: { t: number; x: number; y: number }[] = []
  private smooth: { x: number; y: number } | null = null

  constructor(opts: Partial<EngineOptions> = {}) {
    this.o = { ...DEFAULT_ENGINE, ...opts, cooldownMs: { ...DEFAULT_ENGINE.cooldownMs, ...opts.cooldownMs } }
  }

  get currentPose(): Pose {
    return this.pose
  }

  reset() {
    this.pose = 'unknown'
    this.firedPose = null
    this.track = []
    this.smooth = null
  }

  private cooled(type: GestureEvent['type'], t: number) {
    const last = this.lastFired[type]
    return last === undefined || t - last >= this.o.cooldownMs[type]
  }

  private fire(e: GestureEvent, t: number): GestureEvent {
    this.lastFired[e.type] = t
    return e
  }

  /** Feed one frame (null = no hand). Returns at most one discrete event. */
  update(lm: Landmark[] | null, t: number): GestureEvent | null {
    if (!lm || lm.length < 21) {
      this.pose = 'unknown'
      this.track = []
      this.smooth = null
      if (this.firedPose && t - this.lastSeenFired > this.o.releaseMs) this.firedPose = null
      return null
    }

    // Smoothed palm centre (wrist + MCPs).
    const ids = [0, 5, 9, 13, 17]
    const cx = ids.reduce((s, i) => s + lm[i].x, 0) / ids.length
    const cy = ids.reduce((s, i) => s + lm[i].y, 0) / ids.length
    const a = this.o.smoothing
    this.smooth = this.smooth ? { x: this.smooth.x + a * (cx - this.smooth.x), y: this.smooth.y + a * (cy - this.smooth.y) } : { x: cx, y: cy }
    this.track.push({ t, ...this.smooth })
    while (this.track.length && t - this.track[0].t > this.o.swipeWindowMs) this.track.shift()

    // Swipe: fast, mostly-horizontal travel within the window.
    if (this.track.length >= 3 && this.cooled('swipe', t)) {
      const first = this.track[0]
      const dx = this.smooth.x - first.x
      const dy = this.smooth.y - first.y
      if (Math.abs(dx) >= this.o.swipeDistance && Math.abs(dy) < Math.abs(dx) * 0.6) {
        const userDx = this.o.mirrored ? -dx : dx
        this.track = []
        this.poseSince = t // moving hand resets static dwell
        return this.fire({ type: 'swipe', direction: userDx < 0 ? 'left' : 'right' }, t)
      }
    }

    const pose = classifyPose(lm)
    if (pose !== this.pose) {
      this.pose = pose
      this.poseSince = t
    }
    if (this.firedPose) {
      if (pose === this.firedPose) this.lastSeenFired = t
      else if (t - this.lastSeenFired > this.o.releaseMs) this.firedPose = null
    }

    const evType = POSE_EVENT[pose]
    if (!evType || this.firedPose === pose) return null
    // Static gestures require a steady hand (no large recent motion).
    const travel = this.track.length ? Math.hypot(this.smooth.x - this.track[0].x, this.smooth.y - this.track[0].y) : 0
    if (travel > 0.06) {
      this.poseSince = t
      return null
    }
    if (t - this.poseSince >= this.o.dwellMs && this.cooled(evType, t)) {
      this.firedPose = pose
      this.lastSeenFired = t
      return this.fire({ type: evType } as GestureEvent, t)
    }
    return null
  }
}

/** Skeleton connections for drawing (MediaPipe hand topology). */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
