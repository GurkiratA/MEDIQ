/**
 * Draws each tracked hand on a full-screen canvas: a faint skeleton and a
 * cursor ring at the index fingertip that tightens as the pinch closes. The
 * canvas has `pointer-events: none`, so it never blocks mouse, touch or the
 * synthetic hand events (those are hit-tested with elementFromPoint, which
 * skips it).
 */
import { useEffect, useRef } from 'react'
import { HAND_BONES, pinchPoint } from './handTracker'
import { useGestures } from './GestureContext'

const CYAN = '34, 211, 238'
const TEAL = '45, 212, 191'
const RED = '248, 113, 113'
const AMBER = '251, 191, 36'

export function HandOverlay() {
  const g = useGestures()
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = g.frame

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1
    let drewSomething = false
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const nw = window.innerWidth
      const nh = window.innerHeight
      const nd = Math.min(window.devicePixelRatio || 1, 2)
      if (nw !== w || nh !== h || nd !== dpr) {
        w = nw
        h = nh
        dpr = nd
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      const f = frame.current
      if (!f.hands.length) {
        if (drewSomething) ctx.clearRect(0, 0, w, h)
        drewSomething = false
        return
      }
      drewSomething = true
      ctx.clearRect(0, 0, w, h)
      const now = performance.now()

      if (f.resizing && f.hands.filter((x) => x.pinched).length === 2) {
        const [a, b] = f.hands.filter((x) => x.pinched).map(pinchPoint)
        ctx.setLineDash([6, 6])
        ctx.strokeStyle = `rgba(${TEAL}, 0.75)`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.setLineDash([])
      }

      for (const hand of f.hands) {
        const lw = Math.max(1.2, Math.min(2.4, hand.span / 60))
        ctx.lineCap = 'round'
        ctx.strokeStyle = `rgba(${CYAN}, 0.28)`
        ctx.lineWidth = lw
        ctx.beginPath()
        for (const [a, b] of HAND_BONES) {
          const p = hand.points[a]
          const q = hand.points[b]
          if (!p || !q) continue
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(q.x, q.y)
        }
        ctx.stroke()

        const blocked = now - (f.blocked.get(hand.id) ?? -1e9) < 700
        const tone = blocked ? RED : hand.pinched ? TEAL : CYAN
        const r = 16 - 8 * hand.closeness
        ctx.shadowColor = `rgba(${tone}, 0.8)`
        ctx.shadowBlur = 12
        ctx.strokeStyle = `rgba(${tone}, 0.95)`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(hand.x, hand.y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.fillStyle = `rgba(${tone}, ${hand.pinched ? 0.9 : 0.6})`
        ctx.beginPath()
        ctx.arc(hand.x, hand.y, hand.pinched ? 5 : 2.5, 0, Math.PI * 2)
        ctx.fill()

        if (hand.pose === 'peace') {
          ctx.fillStyle = `rgba(${CYAN}, 0.8)`
          for (const dir of [-1, 1]) {
            const y = hand.y + dir * 26
            ctx.beginPath()
            ctx.moveTo(hand.x - 6, y - dir * 3)
            ctx.lineTo(hand.x + 6, y - dir * 3)
            ctx.lineTo(hand.x, y + dir * 4)
            ctx.fill()
          }
        }

        const closing = f.closing.get(hand.id)
        if (closing !== undefined) {
          ctx.strokeStyle = `rgba(${closing > 0.66 ? RED : AMBER}, 0.95)`
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(hand.x, hand.y, 24, -Math.PI / 2, -Math.PI / 2 + closing * Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [frame])

  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[80] size-full" aria-hidden />
}
