import { clsx } from 'clsx'
import { Activity, BedDouble, BrainCircuit, FileText, LayoutDashboard, Mic, Pill, ShieldCheck, Users } from 'lucide-react'
import { useNav, type View } from '../state/NavContext'
import { useSnap } from '../state/DataContext'

const ITEMS: { id: View; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'rooms', label: 'Rooms & Admissions', icon: BedDouble },
  { id: 'medications', label: 'Medication Records', icon: Pill },
  { id: 'voice', label: 'Voice Assistant', icon: Mic },
  { id: 'notes', label: 'Visit Notes', icon: FileText },
  { id: 'doctors', label: 'Authorized Doctors & Voiceprints', icon: ShieldCheck },
  { id: 'ai', label: 'AI Provider Settings', icon: BrainCircuit },
  { id: 'activity', label: 'Activity Log', icon: Activity },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav()
  const snap = useSnap()
  const pending = snap.visits.filter((v) => v.reviewStatus === 'Pending review').length
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = nav.view === id
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              nav.navigate(id === 'patients' ? { view: id, patientId: nav.view === 'patients' ? null : nav.patientId } : { view: id })
              onNavigate?.()
            }}
            className={clsx(
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
              active ? 'bg-teal/15 text-ink ring-1 ring-teal/40' : 'text-ink-muted hover:bg-surface-3 hover:text-ink',
            )}
          >
            <Icon className={clsx('size-4 shrink-0', active ? 'text-cyan' : 'text-ink-faint group-hover:text-ink-muted')} />
            <span className="flex-1 leading-tight">{label}</span>
            {id === 'notes' && pending > 0 && <span className="rounded bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">{pending}</span>}
          </button>
        )
      })}
      <div className="mt-auto rounded-lg border border-sim/30 bg-sim/5 p-3 text-[11px] leading-relaxed text-ink-muted">
        <p className="font-semibold text-sim">Hackathon prototype</p>
        Synthetic data only. Not a medical device. All AI output and safety flags require qualified clinician review.
      </div>
    </nav>
  )
}
