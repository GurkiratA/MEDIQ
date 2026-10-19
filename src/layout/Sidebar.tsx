import { clsx } from 'clsx'
import { Activity, BedDouble, BrainCircuit, FileText, LayoutDashboard, Mic, Pill, ShieldCheck, Users } from 'lucide-react'
import { useNav, type View } from '../state/NavContext'
import { useSnap } from '../state/DataContext'

/** Short visible labels; the accessible name keeps the full description. */
const ITEMS: { id: View; label: string; name: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', name: 'Overview', icon: LayoutDashboard },
  { id: 'patients', label: 'Patients', name: 'Patients', icon: Users },
  { id: 'rooms', label: 'Rooms', name: 'Rooms & Admissions', icon: BedDouble },
  { id: 'medications', label: 'Medications', name: 'Medication Records', icon: Pill },
  { id: 'notes', label: 'Visit notes', name: 'Visit Notes', icon: FileText },
  { id: 'voice', label: 'Voice', name: 'Voice Assistant', icon: Mic },
  { id: 'doctors', label: 'Access', name: 'Authorized Doctors & Voiceprints', icon: ShieldCheck },
  { id: 'ai', label: 'AI providers', name: 'AI Provider Settings', icon: BrainCircuit },
  { id: 'activity', label: 'Activity', name: 'Activity Log', icon: Activity },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav()
  const snap = useSnap()
  const pending = snap.visits.filter((v) => v.reviewStatus === 'Pending review').length
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-0.5 px-3 py-4">
      {ITEMS.map(({ id, label, name, icon: Icon }, i) => {
        const active = nav.view === id
        return (
          <div key={id}>
            {(i === 5 || i === 7) && <div className="mx-2 my-2 h-px bg-line/70" aria-hidden />}
            <button
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={name}
              onClick={() => {
                nav.navigate(id === 'patients' ? { view: id, patientId: nav.view === 'patients' ? null : nav.patientId } : { view: id })
                onNavigate?.()
              }}
              className={clsx(
                'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors',
                active ? 'bg-cyan/[0.08] text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan shadow-[0_0_10px] shadow-cyan" aria-hidden />}
              <Icon className={clsx('size-4 shrink-0', active ? 'text-cyan' : 'text-ink-faint group-hover:text-ink-muted')} />
              <span className="flex-1">{label}</span>
              {id === 'notes' && pending > 0 && <span className="rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">{pending}</span>}
            </button>
          </div>
        )
      })}
      <p className="mt-auto px-3 text-[10.5px] leading-relaxed text-ink-faint">
        Prototype · synthetic data only · not a medical device. AI output requires clinician review.
      </p>
    </nav>
  )
}
