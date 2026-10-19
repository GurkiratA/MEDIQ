/**
 * Synthetic 21-point hand landmark fixtures (normalised image coordinates)
 * for testing the classifier without a camera. Geometry is a simplified,
 * upright right hand facing the camera.
 */
import type { Landmark } from './classifier'

type FingerState = 'extended' | 'curled'

export interface HandSpec {
  thumb: 'out' | 'in' | 'up'
  fingers: [FingerState, FingerState, FingerState, FingerState]
  pinch?: boolean
  dx?: number
  dy?: number
}

const MCP_X = [0.43, 0.48, 0.53, 0.58]

export function makeHand(spec: HandSpec): Landmark[] {
  const lm: Landmark[] = new Array(21)
  lm[0] = { x: 0.5, y: 0.8 }
  // Thumb
  if (spec.thumb === 'up') {
    lm[1] = { x: 0.44, y: 0.72 }
    lm[2] = { x: 0.42, y: 0.62 }
    lm[3] = { x: 0.42, y: 0.52 }
    lm[4] = { x: 0.42, y: 0.42 }
  } else if (spec.thumb === 'out') {
    lm[1] = { x: 0.44, y: 0.76 }
    lm[2] = { x: 0.39, y: 0.71 }
    lm[3] = { x: 0.35, y: 0.67 }
    lm[4] = { x: 0.31, y: 0.63 }
  } else {
    lm[1] = { x: 0.45, y: 0.76 }
    lm[2] = { x: 0.43, y: 0.71 }
    lm[3] = { x: 0.46, y: 0.68 }
    lm[4] = { x: 0.5, y: 0.67 }
  }
  spec.fingers.forEach((state, i) => {
    const base = 5 + i * 4
    const x = MCP_X[i]
    lm[base] = { x, y: 0.6 }
    if (state === 'extended') {
      lm[base + 1] = { x, y: 0.5 }
      lm[base + 2] = { x, y: 0.44 }
      lm[base + 3] = { x, y: 0.39 }
    } else {
      lm[base + 1] = { x, y: 0.53 }
      lm[base + 2] = { x, y: 0.59 }
      lm[base + 3] = { x, y: 0.63 }
    }
  })
  if (spec.pinch) {
    lm[4] = { x: 0.41, y: 0.5 }
    lm[6] = { x: 0.43, y: 0.52 }
    lm[7] = { x: 0.425, y: 0.5 }
    lm[8] = { x: 0.415, y: 0.495 }
  }
  const dx = spec.dx ?? 0
  const dy = spec.dy ?? 0
  return lm.map((p) => ({ x: p.x + dx, y: p.y + dy, z: 0 }))
}

export const OPEN_PALM = makeHand({ thumb: 'out', fingers: ['extended', 'extended', 'extended', 'extended'] })
export const FIST = makeHand({ thumb: 'in', fingers: ['curled', 'curled', 'curled', 'curled'] })
export const THUMBS_UP = makeHand({ thumb: 'up', fingers: ['curled', 'curled', 'curled', 'curled'] })
export const PINCH = makeHand({ thumb: 'out', fingers: ['curled', 'extended', 'extended', 'extended'], pinch: true })
export const POINT = makeHand({ thumb: 'in', fingers: ['extended', 'curled', 'curled', 'curled'] })
