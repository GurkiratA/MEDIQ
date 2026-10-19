import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackedHand } from './handTracker'
import { handPointerId, isHandPointer, PointerBridge } from './pointerBridge'

function hand(p: Partial<TrackedHand>): TrackedHand {
  return { id: 0, side: 'right', points: [], x: 0, y: 0, aimX: p.x ?? 0, aimY: p.y ?? 0, pinched: false, closeness: 0, pose: 'point', span: 80, ...p }
}

function setup(html: string) {
  document.body.innerHTML = html
  const log: string[] = []
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click']) {
    window.addEventListener(type, (e) => log.push(`${type}:${(e.target as HTMLElement).id || (e.target as HTMLElement).tagName}`), true)
  }
  let under: Element | null = null
  const bridge = new PointerBridge({ hitTest: () => under })
  return { log, bridge, at: (sel: string) => (under = document.querySelector(sel)) }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PointerBridge', () => {
  it('pinch-and-release in place on a button is a click', () => {
    const { log, bridge, at } = setup('<button id="b">Open</button>')
    const onClick = vi.fn()
    document.getElementById('b')!.addEventListener('click', onClick)
    at('#b')
    bridge.sync([hand({ x: 10, y: 10 })])
    bridge.sync([hand({ x: 10, y: 10, pinched: true })])
    bridge.sync([hand({ x: 12, y: 11, pinched: true })])
    bridge.sync([hand({ x: 12, y: 11, pinched: false })])
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(log.filter((l) => !l.startsWith('pointermove'))).toEqual(['pointerdown:b', 'pointerup:b', 'click:b'])
  })

  it('a press that travels is a drag: moves go to the pressed element and no click fires', () => {
    const { log, bridge, at } = setup('<div id="panel"><p id="body">text</p></div><div id="other"></div>')
    at('#body')
    bridge.sync([hand({ x: 100, y: 100, pinched: true })])
    at('#other') // hand slides off the panel mid-drag
    bridge.sync([hand({ x: 200, y: 160, pinched: true })])
    bridge.sync([hand({ x: 260, y: 200, pinched: false })])
    expect(log).toEqual(['pointerdown:body', 'pointermove:body', 'pointerup:body'])
  })

  it('uses the aim point (before the fingers closed) for the press target', () => {
    document.body.innerHTML = '<button id="aim"></button><div id="live"></div>'
    const hits: [number, number][] = []
    const bridge = new PointerBridge({ hitTest: (x, y) => (hits.push([x, y]), document.getElementById(y < 50 ? 'aim' : 'live')) })
    const down = vi.fn()
    document.getElementById('aim')!.addEventListener('pointerdown', down)
    bridge.sync([hand({ x: 10, y: 80, aimX: 10, aimY: 20, pinched: true })])
    expect(down).toHaveBeenCalledTimes(1)
  })

  it('dispatches pointer events identifiable as hand pointers', () => {
    const { bridge, at } = setup('<div id="t"></div>')
    let seen: PointerEvent | null = null
    document.getElementById('t')!.addEventListener('pointerdown', (e) => (seen = e as PointerEvent))
    at('#t')
    bridge.sync([hand({ id: 1, x: 5, y: 5, pinched: true })])
    expect(seen).not.toBeNull()
    expect(seen!.pointerId).toBe(handPointerId(1))
    expect(isHandPointer(seen!)).toBe(true)
    expect(isHandPointer({ pointerId: 1 })).toBe(false)
  })

  it('refuses presses inside modal dialogs and data-no-gesture areas', () => {
    const { log, bridge, at } = setup('<div aria-modal="true"><button id="confirm">Confirm</button></div><div data-no-gesture><button id="revoke">Revoke</button></div>')
    const events: string[] = []
    const b2 = new PointerBridge({ hitTest: () => document.getElementById('confirm'), onEvent: (e) => events.push(e.type) })
    b2.sync([hand({ pinched: true })])
    b2.sync([hand({ pinched: false })])
    at('#revoke')
    bridge.sync([hand({ pinched: true })])
    bridge.sync([hand({ pinched: false })])
    expect(log.filter((l) => !l.startsWith('pointermove'))).toEqual([])
    expect(events).toEqual(['blocked'])
  })

  it('releases and cancels a held press when the hand is lost (no stuck drags)', () => {
    const { log, bridge, at } = setup('<div id="p"></div>')
    at('#p')
    bridge.sync([hand({ x: 50, y: 50, pinched: true })])
    bridge.sync([], [{ id: 0, x: 60, y: 60 }])
    expect(log).toEqual(['pointerdown:p', 'pointerup:p', 'pointercancel:p'])
    expect(bridge.isPressing(0)).toBe(false)
  })

  it('releaseAll ends every hand press', () => {
    const { log, bridge, at } = setup('<div id="p"></div>')
    at('#p')
    bridge.sync([hand({ id: 0, pinched: true }), hand({ id: 1, pinched: true })])
    bridge.releaseAll()
    expect(log.filter((l) => l.startsWith('pointercancel'))).toHaveLength(2)
  })

  it('tracks two hands as independent pointers', () => {
    const { bridge, at } = setup('<div id="p"></div>')
    const ids: number[] = []
    document.getElementById('p')!.addEventListener('pointerdown', (e) => ids.push((e as PointerEvent).pointerId))
    at('#p')
    bridge.sync([hand({ id: 0, pinched: true }), hand({ id: 1, pinched: true })])
    expect(ids).toEqual([handPointerId(0), handPointerId(1)])
    expect(bridge.pressTarget(0)?.id).toBe('p')
    expect(bridge.pressTarget(1)?.id).toBe('p')
  })
})
