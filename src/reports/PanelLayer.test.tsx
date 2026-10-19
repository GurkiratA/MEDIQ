import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { handSignals } from '../gestures/handSignals'
import type { TrackedHand } from '../gestures/handTracker'
import { PointerBridge } from '../gestures/pointerBridge'
import { DataProvider, useData } from '../state/DataContext'
import { ToastProvider } from '../state/ToastContext'
import { PanelProvider, usePanels, type PanelsApi } from './PanelContext'
import { PanelLayer } from './PanelLayer'

let api: PanelsApi
function Grab() {
  api = usePanels()
  const { snap } = useData()
  return snap ? <PanelLayer /> : null
}

let n = 0
async function mount() {
  render(
    <ToastProvider>
      <DataProvider dbName={`panel-test-${++n}`}>
        <PanelProvider>
          <Grab />
        </PanelProvider>
      </DataProvider>
    </ToastProvider>,
  )
  let id = ''
  act(() => {
    id = api.open('summary', '104')
  })
  await screen.findByRole('dialog', { name: 'Clinical summary' })
  return id
}

const hand = (p: Partial<TrackedHand>): TrackedHand => ({ id: 0, side: 'right', points: [], x: 0, y: 0, aimX: p.x ?? 0, aimY: p.y ?? 0, pinched: false, closeness: 0, pose: 'point', span: 80, ...p })

afterEach(() => {
  handSignals.twoHandActive = false
})

describe('floating report panel', () => {
  it('renders the synthetic record with safety warning, title and close control', async () => {
    await mount()
    const dlg = screen.getByRole('dialog', { name: 'Clinical summary' })
    expect(dlg).toHaveTextContent('104')
    expect(dlg).toHaveTextContent('Documented severe allergy')
    expect(dlg).toHaveTextContent('requires qualified clinician review')
    fireEvent.click(screen.getByRole('button', { name: 'Close report' }))
    expect(screen.queryByRole('dialog', { name: 'Clinical summary' })).toBeNull()
  })

  it('a hand pinch drags the panel from anywhere in its body (not just the header)', async () => {
    const id = await mount()
    const body = document.querySelector(`[data-panel-scroll="${id}"] .rp-block`)!
    const bridge = new PointerBridge({ hitTest: () => body })
    const start = { ...api.store.get(id)! }
    act(() => {
      bridge.sync([hand({ x: 300, y: 300, pinched: true })])
      bridge.sync([hand({ x: 305, y: 302, pinched: true })]) // below drag slop: no movement yet
    })
    expect(api.store.get(id)!.x).toBe(start.x)
    act(() => {
      for (let i = 1; i <= 10; i++) bridge.sync([hand({ x: 300 - i * 10, y: 300 + i * 5, pinched: true })])
      bridge.sync([hand({ x: 200, y: 350, pinched: false })])
    })
    const end = api.store.get(id)!
    expect(end.x).toBe(start.x - 100)
    expect(end.y).toBe(start.y + 50)
    expect(screen.getByRole('dialog', { name: 'Clinical summary' })).toBeInTheDocument() // drag did not click anything
  })

  it('a hand pinch on the close button without moving closes the panel', async () => {
    const id = await mount()
    const close = screen.getByRole('button', { name: 'Close report' })
    const bridge = new PointerBridge({ hitTest: () => close })
    act(() => {
      bridge.sync([hand({ x: 10, y: 10, pinched: true })])
      bridge.sync([hand({ x: 11, y: 10, pinched: false })])
    })
    expect(api.store.get(id)).toBeNull()
  })

  it('mouse drags only from the header, so report text stays selectable', async () => {
    const id = await mount()
    const start = { ...api.store.get(id)! }
    const body = document.querySelector(`[data-panel-scroll="${id}"]`)!
    fireEvent.pointerDown(body, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 150, clientY: 150 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(api.store.get(id)!.x).toBe(start.x)

    const head = document.querySelector(`[data-panel-id="${id}"] .fpanel-head h2`)!
    fireEvent.pointerDown(head, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 60, clientY: 130 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(api.store.get(id)!.x).toBe(start.x - 40)
    expect(api.store.get(id)!.y).toBe(start.y + 30)
  })

  it('freezes a one-hand drag while both hands pinch (resize), then resumes without jumping', async () => {
    const id = await mount()
    const body = document.querySelector(`[data-panel-scroll="${id}"]`)!
    const bridge = new PointerBridge({ hitTest: () => body })
    const start = { ...api.store.get(id)! }
    act(() => {
      bridge.sync([hand({ x: 300, y: 300, pinched: true })])
      bridge.sync([hand({ x: 260, y: 300, pinched: true })]) // dragged 40px left
    })
    expect(api.store.get(id)!.x).toBe(start.x - 40)
    act(() => {
      handSignals.twoHandActive = true
      bridge.sync([hand({ x: 160, y: 300, pinched: true })]) // moves while two-handed: ignored
      handSignals.twoHandActive = false
      bridge.sync([hand({ x: 150, y: 300, pinched: true })]) // resumes: only the next 10px count
    })
    expect(api.store.get(id)!.x).toBe(start.x - 50)
  })

  it('two-hand resize targets the panel the hands pressed on', async () => {
    const id = await mount()
    const body = document.querySelector(`[data-panel-scroll="${id}"]`)!
    const start = { ...api.store.get(id)! }
    act(() => {
      api.handResize(300, [body, body])
      for (let i = 0; i < 25; i++) api.handResize(390, [body, body])
      api.handResize(null, [])
    })
    expect(api.store.get(id)!.w).toBeGreaterThan(start.w * 1.2)
  })
})
