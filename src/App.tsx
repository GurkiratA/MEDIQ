import { AlertOctagon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from './components/ui'
import { GestureProvider } from './gestures/GestureContext'
import { GesturePreview } from './gestures/GesturePreview'
import { Sidebar } from './layout/Sidebar'
import { TopBar } from './layout/TopBar'
import { DataProvider, useData } from './state/DataContext'
import { NavProvider, useNav } from './state/NavContext'
import { NoteDraftProvider } from './state/NoteDraftContext'
import { ProvidersProvider } from './state/ProvidersContext'
import { ToastProvider } from './state/ToastContext'
import { VoiceProvider } from './voice/VoiceContext'
import { ActivityView } from './views/ActivityView'
import { AISettingsView } from './views/AISettingsView'
import { DoctorsView } from './views/DoctorsView'
import { MedicationsView } from './views/MedicationsView'
import { NotesView } from './views/NotesView'
import { OnboardingDialog } from './views/OnboardingDialog'
import { OverviewView } from './views/OverviewView'
import { PatientsView } from './views/PatientsView'
import { RoomsView } from './views/RoomsView'
import { VoiceView } from './views/VoiceView'

function CurrentView() {
  const { view } = useNav()
  switch (view) {
    case 'overview':
      return <OverviewView />
    case 'patients':
      return <PatientsView />
    case 'rooms':
      return <RoomsView />
    case 'medications':
      return <MedicationsView />
    case 'voice':
      return <VoiceView />
    case 'notes':
      return <NotesView />
    case 'doctors':
      return <DoctorsView />
    case 'ai':
      return <AISettingsView />
    case 'activity':
      return <ActivityView />
  }
}

function Shell() {
  const [drawer, setDrawer] = useState(false)
  const nav = useNav()
  const mainRef = useRef<HTMLElement>(null)
  // Move focus to the main region on navigation for keyboard/screen-reader users.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 })
  }, [nav.view, nav.patientId])
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar onMenu={() => setDrawer(true)} />
      <div className="flex">
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-64 shrink-0 overflow-y-auto border-r border-line bg-surface/40 lg:block">
          <Sidebar />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-line bg-surface">
              <div className="flex justify-end p-2">
                <button type="button" className="rounded p-2 text-ink-muted hover:bg-surface-3" onClick={() => setDrawer(false)} aria-label="Close navigation">
                  <X className="size-5" />
                </button>
              </div>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        )}
        <main id="main" ref={mainRef} className="min-w-0 flex-1 px-3 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] animate-fade-in" key={nav.view}>
            <CurrentView />
          </div>
        </main>
      </div>
      <GesturePreview />
      <OnboardingDialog />
    </div>
  )
}

function Loaded() {
  const { snap, error } = useData()
  if (error)
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-md p-6 text-center">
          <AlertOctagon className="mx-auto mb-3 size-8 text-danger" />
          <h1 className="text-lg font-semibold">Local storage unavailable</h1>
          <p className="mt-2 text-sm text-ink-muted">{error}</p>
          <p className="mt-2 text-xs text-ink-faint">MEDIQ stores synthetic data in IndexedDB. Private-browsing modes or blocked site data can prevent this.</p>
        </div>
      </div>
    )
  if (!snap)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading synthetic clinical database…" />
      </div>
    )
  return (
    <NavProvider>
      <ProvidersProvider>
        <NoteDraftProvider>
          <VoiceProvider>
            <GestureProvider>
              <Shell />
            </GestureProvider>
          </VoiceProvider>
        </NoteDraftProvider>
      </ProvidersProvider>
    </NavProvider>
  )
}

export default function App({ dbName }: { dbName?: string }) {
  return (
    <ToastProvider>
      <DataProvider dbName={dbName}>
        <Loaded />
      </DataProvider>
    </ToastProvider>
  )
}
