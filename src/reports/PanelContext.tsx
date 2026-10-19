import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { PanelStore, TwoHandResizer, type PanelState } from './panelStore'
import type { ReportKind } from './reportKinds'

export interface PanelsApi {
  store: PanelStore
  panels: PanelState[]
  open: (kind: ReportKind, patientId: string) => string
  close: (id: string) => void
  closeTop: () => boolean
  closeAll: () => void
  /** Scale the front panel (voice "make this larger"). */
  scaleTop: (factor: number) => boolean
  /** Scroll the front panel by roughly a page. */
  scrollTop: (dir: 'up' | 'down') => boolean
  /** Two-hand pinch resize, driven by the gesture loop each frame. */
  handResize: (span: number | null, pressed: (Element | null)[]) => boolean
}

const Ctx = createContext<PanelsApi | null>(null)

export function panelIdOf(el: Element | null): string | null {
  return el?.closest('[data-panel-id]')?.getAttribute('data-panel-id') ?? null
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new PanelStore())
  const [resizer] = useState(() => new TwoHandResizer(store))
  const panels = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    const onResize = () => store.refit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [store])

  const scrollTop = useCallback(
    (dir: 'up' | 'down') => {
      const t = store.top()
      const el = t && document.querySelector<HTMLElement>(`[data-panel-scroll="${t.id}"]`)
      if (!el) return false
      el.scrollBy({ top: (dir === 'down' ? 1 : -1) * el.clientHeight * 0.8, behavior: 'smooth' })
      return true
    },
    [store],
  )

  const handResize = useCallback(
    (span: number | null, pressed: (Element | null)[]) =>
      resizer.update(span, () => pressed.map(panelIdOf).find((id) => id && store.get(id)) ?? store.top()?.id ?? null),
    [resizer, store],
  )

  const value = useMemo<PanelsApi>(
    () => ({
      store,
      panels,
      open: (k, p) => store.open(k, p),
      close: (id) => store.close(id),
      closeTop: () => store.closeTop(),
      closeAll: () => store.closeAll(),
      scaleTop: (f) => store.scaleTop(f),
      scrollTop,
      handResize,
    }),
    [store, panels, scrollTop, handResize],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePanels(): PanelsApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePanels outside PanelProvider')
  return v
}
