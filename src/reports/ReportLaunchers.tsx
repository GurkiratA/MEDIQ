import { clsx } from 'clsx'
import { ClipboardList, FileText, FlaskConical, HeartPulse, Pill } from 'lucide-react'
import { usePanels } from './PanelContext'
import { REPORT_TITLE, type ReportKind } from './reportKinds'

const ICON: Record<ReportKind, typeof Pill> = { summary: ClipboardList, visit: FileText, medications: Pill, labs: FlaskConical, vitals: HeartPulse }
const SHORT: Record<ReportKind, string> = { summary: 'Summary', visit: 'Visit note', medications: 'Medications', labs: 'Labs', vitals: 'Vitals' }

/** Buttons that open floating reports for a patient. */
export function ReportLaunchers({ patientId, className, compact }: { patientId: string; className?: string; compact?: boolean }) {
  const { open, panels } = usePanels()
  return (
    <div className={clsx('flex flex-wrap gap-2', className)} role="group" aria-label="Open report">
      {(Object.keys(ICON) as ReportKind[]).map((k) => {
        const Icon = ICON[k]
        const isOpen = panels.some((p) => p.kind === k && p.patientId === patientId)
        return (
          <button
            key={k}
            type="button"
            onClick={() => open(k, patientId)}
            aria-label={`Open ${REPORT_TITLE[k].toLowerCase()} for patient ${patientId}`}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl border px-3 text-[13px] transition-colors',
              compact ? 'h-8' : 'h-10',
              isOpen ? 'border-cyan/60 bg-cyan/10 text-cyan-soft' : 'border-line-strong bg-surface-2/60 text-ink-muted hover:border-cyan/40 hover:text-ink',
            )}
          >
            <Icon className="size-4" />
            {SHORT[k]}
          </button>
        )
      })}
    </div>
  )
}
