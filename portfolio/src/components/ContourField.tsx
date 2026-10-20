'use client'

import { useEffect, useRef } from 'react'
import styles from './ContourField.module.css'

/**
 * The hero's terrain: contour lines traced (marching squares) over a slowly
 * drifting noise field. A fine pointer raises a hill under the cursor, lines
 * near it pick up the accent colour, and a readout reports the field there.
 *
 * Costs are kept small on purpose: one canvas, started only once the browser
 * is idle, 30 fps while the pointer is active and 12 fps for the ambient
 * drift, coarser cells on slow devices, paused off screen or in a background
 * tab, and drawn once and left still on touch screens or when the visitor
 * prefers reduced motion.
 */

const MIN_CELL = 12 // grid spacing in CSS px
const MAX_CELL = 24
const STEP = 0.075 // contour interval in field units
const INDEX_EVERY = 4 // every Nth line is a heavier "index contour"
const ACTIVE_MS = 1000 / 30
const AMBIENT_MS = 1000 / 12
const BUDGET_MS = 6 // per-frame cost above which the grid gets coarser

// --- Seeded value noise -----------------------------------------------------

function createNoise(seed: number) {
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const perm = new Uint8Array(512)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const values = Float32Array.from({ length: 256 }, () => rand() * 2 - 1)

  const fade = (t: number) => t * t * (3 - 2 * t)
  const at = (x: number, y: number) => values[perm[(perm[x & 255] + y) & 255]]

  const noise = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const v = fade(y - yi)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }

  // Three octaves, each drifting in its own direction so the terrain morphs
  // rather than scrolls.
  return (x: number, y: number, t: number) =>
    0.62 * noise(x + t * 0.6, y - t * 0.35) +
    0.27 * noise(x * 2.03 - t * 0.4, y * 2.03 + t * 0.5 + 17.3) +
    0.11 * noise(x * 4.1 + 41.7, y * 4.1 - t * 0.7)
}

// --- Marching squares -------------------------------------------------------
// Corner bits: top-left 8, top-right 4, bottom-right 2, bottom-left 1.
// Edges: 0 top, 1 right, 2 bottom, 3 left.
const SEGMENTS: number[][] = [
  [], [3, 2], [2, 1], [3, 1], [0, 1], [0, 1, 3, 2], [0, 2], [0, 3],
  [0, 3], [0, 2], [0, 3, 2, 1], [0, 1], [3, 1], [2, 1], [3, 2], [],
]

export function ContourField({ coordinates, seed = 7 }: { coordinates: string; seed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readoutRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement?.parentElement // the hero section
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const field = createNoise(seed)
    const scale = 1 / 300

    let CELL = MIN_CELL
    let slowFrames = 0
    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let grid = new Float32Array(0)
    let time = 0
    let raf = 0
    let last = 0
    let visible = true

    // Pointer state, eased toward its target each frame.
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, target: 0 }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(width / CELL) + 1
      rows = Math.ceil(height / CELL) + 1
      grid = new Float32Array(cols * rows)
    }

    const sample = () => {
      const sigma2 = 2 * 130 * 130
      const amp = pointer.amp * 0.6
      for (let j = 0; j < rows; j++) {
        const y = j * CELL
        for (let i = 0; i < cols; i++) {
          const x = i * CELL
          let v = field(x * scale, y * scale, time)
          if (amp > 0.001) {
            const dx = x - pointer.x
            const dy = y - pointer.y
            v += amp * Math.exp(-(dx * dx + dy * dy) / sigma2)
          }
          grid[j * cols + i] = v
        }
      }
    }

    const trace = () => {
      const minor = new Path2D()
      const major = new Path2D()
      const edgePoint = (edge: number, i: number, j: number, level: number, v: number[]) => {
        const x = i * CELL
        const y = j * CELL
        const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-6)
        switch (edge) {
          case 0: return [x + lerp(v[0], v[1]) * CELL, y]
          case 1: return [x + CELL, y + lerp(v[1], v[2]) * CELL]
          case 2: return [x + lerp(v[3], v[2]) * CELL, y + CELL]
          default: return [x, y + lerp(v[0], v[3]) * CELL]
        }
      }
      // One pass over the cells; each cell only visits the few contour levels
      // that actually fall between its lowest and highest corner.
      const v = [0, 0, 0, 0]
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          v[0] = grid[j * cols + i]
          v[1] = grid[j * cols + i + 1]
          v[2] = grid[(j + 1) * cols + i + 1]
          v[3] = grid[(j + 1) * cols + i]
          const lo = Math.min(v[0], v[1], v[2], v[3])
          const hi = Math.max(v[0], v[1], v[2], v[3])
          for (let k = Math.ceil(lo / STEP); k * STEP < hi; k++) {
            const level = k * STEP
            const index =
              (v[0] > level ? 8 : 0) | (v[1] > level ? 4 : 0) | (v[2] > level ? 2 : 0) | (v[3] > level ? 1 : 0)
            const seg = SEGMENTS[index]
            const path = k % INDEX_EVERY === 0 ? major : minor
            for (let s = 0; s < seg.length; s += 2) {
              const [x1, y1] = edgePoint(seg[s], i, j, level, v)
              const [x2, y2] = edgePoint(seg[s + 1], i, j, level, v)
              path.moveTo(x1, y1)
              path.lineTo(x2, y2)
            }
          }
        }
      }
      return { minor, major }
    }

    const draw = () => {
      sample()
      const { minor, major } = trace()
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(236, 233, 226, 0.075)'
      ctx.stroke(minor)
      ctx.strokeStyle = 'rgba(236, 233, 226, 0.16)'
      ctx.stroke(major)

      if (pointer.amp > 0.01) {
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 220)
        glow.addColorStop(0, `rgba(95, 212, 244, ${0.85 * pointer.amp})`)
        glow.addColorStop(1, 'rgba(95, 212, 244, 0)')
        ctx.strokeStyle = glow
        ctx.stroke(minor)
        ctx.lineWidth = 1.4
        ctx.stroke(major)

        // Crosshair at the summit
        ctx.lineWidth = 1
        ctx.strokeStyle = `rgba(95, 212, 244, ${pointer.amp})`
        ctx.beginPath()
        ctx.moveTo(pointer.x - 9, pointer.y)
        ctx.lineTo(pointer.x - 3, pointer.y)
        ctx.moveTo(pointer.x + 3, pointer.y)
        ctx.lineTo(pointer.x + 9, pointer.y)
        ctx.moveTo(pointer.x, pointer.y - 9)
        ctx.lineTo(pointer.x, pointer.y - 3)
        ctx.moveTo(pointer.x, pointer.y + 3)
        ctx.lineTo(pointer.x, pointer.y + 9)
        ctx.stroke()
      }
    }

    const readout = () => {
      const el = readoutRef.current
      if (!el) return
      if (pointer.target === 0) {
        el.textContent = coordinates
        return
      }
      const i = Math.min(cols - 1, Math.max(0, Math.round(pointer.tx / CELL)))
      const j = Math.min(rows - 1, Math.max(0, Math.round(pointer.ty / CELL)))
      const z = grid[j * cols + i] ?? 0
      const pad = (n: number) => String(Math.round(n)).padStart(4, '0')
      el.textContent = `x ${pad(pointer.tx)}  y ${pad(pointer.ty)}  z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(3)}`
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const interval = pointer.target || pointer.amp > 0.01 ? ACTIVE_MS : AMBIENT_MS
      if (!visible || now - last < interval) return
      const dt = Math.min(now - last, 100) / 1000
      last = now
      time += dt * 0.045
      const ease = Math.min(1, dt * 6)
      pointer.x += (pointer.tx - pointer.x) * ease
      pointer.y += (pointer.ty - pointer.y) * ease
      pointer.amp += (pointer.target - pointer.amp) * Math.min(1, dt * 2.6)
      const t0 = performance.now()
      draw()
      readout()
      // Adapt to the device: a few expensive frames in a row coarsen the grid.
      slowFrames = performance.now() - t0 > BUDGET_MS ? slowFrames + 1 : 0
      if (slowFrames >= 3 && CELL < MAX_CELL) {
        CELL += 4
        slowFrames = 0
        resize()
      }
    }

    // Touch devices get a still terrain: there is no pointer to respond to,
    // and an idle animation would only cost battery.
    const still = () => reduceMotion.matches || !finePointer.matches

    const start = () => {
      cancelAnimationFrame(raf)
      if (still()) {
        pointer.amp = 0
        draw()
        readout()
        return
      }
      last = performance.now() - ACTIVE_MS
      raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !finePointer.matches || reduceMotion.matches) return
      const rect = canvas.getBoundingClientRect()
      pointer.tx = e.clientX - rect.left
      pointer.ty = e.clientY - rect.top
      if (pointer.target === 0) {
        pointer.x = pointer.tx
        pointer.y = pointer.ty
      }
      pointer.target = 1
    }
    const onLeave = () => {
      pointer.target = 0
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (still()) draw()
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(canvas)
    const onVisibility = () => {
      visible = document.visibilityState === 'visible'
    }

    resize()
    // Wait for the page to settle before spending any main-thread time here.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400))
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout
    const idleId = idle(start, { timeout: 2000 })
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    reduceMotion.addEventListener('change', start)
    finePointer.addEventListener('change', start)

    return () => {
      cancelIdle(idleId)
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      reduceMotion.removeEventListener('change', start)
      finePointer.removeEventListener('change', start)
    }
  }, [coordinates, seed])

  return (
    <div className={styles.field} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <p ref={readoutRef} className={`${styles.readout} mono`}>
        {coordinates}
      </p>
    </div>
  )
}
