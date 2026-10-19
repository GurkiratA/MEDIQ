/**
 * Synthetic MediaPipe-style hand landmarks for tests and the dev feed hook.
 * Produces an upright hand whose index fingertip lands on a chosen viewport
 * point after the tracker's mirroring + inset mapping. Pinching brings the
 * thumb to the index tip (the cursor does not move), as a real pinch does.
 */
import { DEFAULT_TRACKER, type Landmark, type RawHand } from './handTracker'

export type SynthPose = 'point' | 'pinch' | 'peace' | 'open' | 'fist'

const MCP_X = [0.43, 0.48, 0.53, 0.58]
const TIP = { x: 0.43, y: 0.39 }

function base(pose: SynthPose): Landmark[] {
  const lm: Landmark[] = new Array(21)
  lm[0] = { x: 0.5, y: 0.8 }
  lm[1] = { x: 0.45, y: 0.76 }
  lm[2] = { x: 0.43, y: 0.71 }
  lm[3] = { x: 0.46, y: 0.68 }
  lm[4] = { x: 0.5, y: 0.67 }
  const ext = pose === 'open' ? [1, 1, 1, 1] : pose === 'peace' ? [1, 1, 0, 0] : pose === 'fist' ? [0, 0, 0, 0] : [1, 0, 0, 0]
  ext.forEach((on, i) => {
    const b = 5 + i * 4
    const x = MCP_X[i]
    lm[b] = { x, y: 0.6 }
    if (on) {
      lm[b + 1] = { x, y: 0.5 }
      lm[b + 2] = { x, y: 0.44 }
      lm[b + 3] = { x, y: 0.39 }
    } else {
      lm[b + 1] = { x, y: 0.53 }
      lm[b + 2] = { x, y: 0.59 }
      lm[b + 3] = { x, y: 0.63 }
    }
  })
  if (pose === 'open') {
    lm[2] = { x: 0.39, y: 0.71 }
    lm[3] = { x: 0.35, y: 0.67 }
    lm[4] = { x: 0.31, y: 0.63 }
  }
  if (pose === 'pinch') {
    // Thumb swings up to meet the (still) index tip.
    lm[2] = { x: 0.41, y: 0.66 }
    lm[3] = { x: 0.415, y: 0.5 }
    lm[4] = { x: TIP.x - 0.008, y: TIP.y + 0.012 }
  }
  return lm
}

/** Viewport point → where the index tip must be in the (un-mirrored) camera frame. */
export function cameraPointFor(x: number, y: number, vw: number, vh: number, insetX = DEFAULT_TRACKER.insetX, insetY = DEFAULT_TRACKER.insetY): Landmark {
  const u = insetX + (x / vw) * (1 - 2 * insetX)
  return { x: 1 - u, y: insetY + (y / vh) * (1 - 2 * insetY) }
}

export function synthHand(x: number, y: number, opts: { pose?: SynthPose; vw: number; vh: number; side?: 'Left' | 'Right'; scale?: number }): RawHand {
  const pose = opts.pose ?? 'point'
  const target = cameraPointFor(x, y, opts.vw, opts.vh)
  const k = opts.scale ?? 1
  // Anchor the shape on where the index tip sits in the 'point' pose so pose
  // changes (pinch, fist) do not shift the hand.
  const landmarks = base(pose).map((p) => ({ x: target.x + (p.x - TIP.x) * k, y: target.y + (p.y - TIP.y) * k, z: 0 }))
  return { landmarks, handedness: opts.side ?? 'Right' }
}
