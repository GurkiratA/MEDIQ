/**
 * The 1€ filter (Casiez, Roussel & Vogel, CHI 2012), adapted from the JARVIS
 * reference project (MIT licence, © 2026 Aditya Dewaskar).
 *
 * A still hand jitters by several pixels a frame; a moving hand needs almost
 * no smoothing or the cursor lags. The filter estimates the signal's speed and
 * opens its cutoff as the hand moves: heavy smoothing at rest, light smoothing
 * in motion.
 *
 *   minCutoff — lower = steadier at rest, slower to respond.
 *   beta      — higher = less lag during fast movement.
 */

const TAU = 2 * Math.PI

function alphaFor(cutoff: number, dt: number): number {
  const tau = 1 / (TAU * cutoff)
  return 1 / (1 + tau / dt)
}

class LowPass {
  private value: number | null = null
  filter(x: number, alpha: number): number {
    this.value = this.value === null ? x : alpha * x + (1 - alpha) * this.value
    return this.value
  }
  get last(): number | null {
    return this.value
  }
  reset() {
    this.value = null
  }
}

export class OneEuro {
  private x = new LowPass()
  private dx = new LowPass()
  private lastAt: number | null = null
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number

  constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  /** @param at timestamp in seconds. */
  filter(x: number, at: number): number {
    if (this.lastAt === null) {
      this.lastAt = at
      this.dx.filter(0, alphaFor(this.dCutoff, 1 / 60))
      return this.x.filter(x, 1)
    }
    // Clamp dt: a backgrounded tab returns with a multi-second gap (alpha → 1,
    // one stale frame snaps the filter); a zero gap divides by nothing.
    const dt = Math.min(Math.max(at - this.lastAt, 1 / 240), 1 / 5)
    this.lastAt = at
    const prev = this.x.last
    const speed = prev === null ? 0 : (x - prev) / dt
    const edx = this.dx.filter(speed, alphaFor(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.x.filter(x, alphaFor(cutoff, dt))
  }

  reset() {
    this.x.reset()
    this.dx.reset()
    this.lastAt = null
  }
}

/** A 1€ filter per axis. */
export class OneEuroPoint {
  private readonly fx: OneEuro
  private readonly fy: OneEuro
  constructor(minCutoff: number, beta: number, dCutoff = 1.0) {
    this.fx = new OneEuro(minCutoff, beta, dCutoff)
    this.fy = new OneEuro(minCutoff, beta, dCutoff)
  }
  filter(x: number, y: number, at: number): { x: number; y: number } {
    return { x: this.fx.filter(x, at), y: this.fy.filter(y, at) }
  }
  reset() {
    this.fx.reset()
    this.fy.reset()
  }
}
