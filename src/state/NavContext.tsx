import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type View = 'overview' | 'patients' | 'rooms' | 'medications' | 'voice' | 'notes' | 'doctors' | 'ai' | 'activity'

/** Swipe order: Overview → Vitals → Labs → Visit Notes, then the remaining tabs. */
export const PATIENT_TABS = ['overview', 'vitals', 'labs', 'notes', 'medications', 'imaging', 'admission'] as const
export type PatientTab = (typeof PATIENT_TABS)[number]

export type RoomsFilter = 'all' | 'available' | 'occupied'
export type RoomsTab = 'rooms' | 'admissions'
export type MedsTab = 'medications' | 'effects' | 'alerts'

export interface NavState {
  view: View
  patientId: string | null
  patientTab: PatientTab
  roomsFilter: RoomsFilter
  roomsTab: RoomsTab
  medsTab: MedsTab
  /** Section to scroll to / highlight after navigation (e.g. "allergies"). */
  focus: string | null
}

const initial: NavState = { view: 'overview', patientId: null, patientTab: 'overview', roomsFilter: 'all', roomsTab: 'rooms', medsTab: 'medications', focus: null }

interface NavApi extends NavState {
  navigate: (next: Partial<NavState>) => void
  back: () => boolean
  canGoBack: boolean
  shiftPatientTab: (dir: 1 | -1) => void
}

const Ctx = createContext<NavApi | null>(null)

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavState>(initial)
  const history = useRef<NavState[]>([])
  const [depth, setDepth] = useState(0)

  const navigate = useCallback((next: Partial<NavState>) => {
    setState((cur) => {
      const merged = { ...cur, focus: null, ...next }
      const same = (Object.keys(merged) as (keyof NavState)[]).every((k) => merged[k] === cur[k])
      if (same) return cur
      history.current.push(cur)
      if (history.current.length > 50) history.current.shift()
      setDepth(history.current.length)
      return merged
    })
  }, [])

  const back = useCallback(() => {
    const prev = history.current.pop()
    setDepth(history.current.length)
    if (!prev) return false
    setState(prev)
    return true
  }, [])

  const shiftPatientTab = useCallback(
    (dir: 1 | -1) => {
      setState((cur) => {
        if (cur.view !== 'patients' || !cur.patientId) return cur
        const i = PATIENT_TABS.indexOf(cur.patientTab)
        const nextTab = PATIENT_TABS[(i + dir + PATIENT_TABS.length) % PATIENT_TABS.length]
        history.current.push(cur)
        setDepth(history.current.length)
        return { ...cur, patientTab: nextTab, focus: null }
      })
    },
    [],
  )

  const value = useMemo(() => ({ ...state, navigate, back, canGoBack: depth > 0, shiftPatientTab }), [state, navigate, back, depth, shiftPatientTab])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNav(): NavApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNav outside NavProvider')
  return v
}
