import { clsx } from 'clsx'
import { AlertOctagon, AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SafetySeverity } from '../../shared/aiSchemas'
import { Badge, type Tone } from './ui'

/** Stat tile: sentence-case label, proportional-figure value, optional context line. */
export function StatTile({ label, value, context, icon, onClick }: { label: string; value: ReactNode; context?: ReactNode; icon?: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={clsx('card flex flex-col gap-1 px-4 py-3.5 text-left', onClick && 'transition-colors hover:border-line-strong hover:bg-surface-2')}
    >
      <span className="flex items-center justify-between text-xs font-medium text-ink-muted">
        {label}
        {icon && <span className="text-ink-faint">{icon}</span>}
      </span>
      <span className="text-3xl font-semibold tracking-tight text-ink">{value}</span>
      {context && <span className="text-xs text-ink-muted">{context}</span>}
    </Comp>
  )
}

/** Occupancy meter: fill carries severity; track is a lighter step of the same hue. */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const full = pct >= 100
  const high = pct >= 75
  return (
    <div className="flex items-center gap-2" title={`${label}: ${value} of ${max}`}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={clsx('h-1.5 flex-1 overflow-hidden rounded-full', full ? 'bg-danger/20' : high ? 'bg-warn/20' : 'bg-teal/20')}
      >
        <div className={clsx('h-full rounded-full', full ? 'bg-danger' : high ? 'bg-warn' : 'bg-teal-bright')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-ink-muted">
        {value}/{max}
      </span>
    </div>
  )
}

const SEV: Record<SafetySeverity, { tone: Tone; label: string; Icon: typeof Info }> = {
  critical: { tone: 'danger', label: 'Critical', Icon: AlertOctagon },
  high: { tone: 'danger', label: 'High', Icon: ShieldAlert },
  moderate: { tone: 'warn', label: 'Moderate', Icon: AlertTriangle },
  low: { tone: 'neutral', label: 'Low', Icon: Info },
  info: { tone: 'cyan', label: 'Info', Icon: Info },
}

export function SeverityBadge({ severity }: { severity: SafetySeverity }) {
  const s = SEV[severity]
  return (
    <Badge tone={s.tone} icon={<s.Icon className="size-3" />}>
      {s.label}
    </Badge>
  )
}

export type SourceKind = 'gemini' | 'hermes' | 'local' | 'local-rule' | 'record' | 'original' | 'confirmed' | 'simulation' | 'missing'

const SOURCE: Record<SourceKind, { tone: Tone; label: string }> = {
  gemini: { tone: 'cyan', label: 'Google Gemini' },
  hermes: { tone: 'teal', label: 'Hermes 3 · DigitalOcean' },
  local: { tone: 'warn', label: 'Local deterministic fallback' },
  'local-rule': { tone: 'warn', label: 'Local Deterministic Safety Rule' },
  record: { tone: 'neutral', label: 'Record-derived' },
  original: { tone: 'neutral', label: 'Original text' },
  confirmed: { tone: 'ok', label: 'Clinician-confirmed' },
  simulation: { tone: 'sim', label: 'Simulation' },
  missing: { tone: 'warn', label: 'Missing information' },
}

/** Provenance label so every piece of text says where it came from. */
export function SourceTag({ kind, model, className }: { kind: SourceKind; model?: string | null; className?: string }) {
  const s = SOURCE[kind]
  const label = kind === 'hermes' && model && !/hermes/i.test(model) ? 'DigitalOcean model' : s.label
  return (
    <Badge tone={s.tone} className={className}>
      {label}
      {model ? ` · ${model}` : ''}
    </Badge>
  )
}

export function Section({ id, title, children, actions, highlight }: { id?: string; title: ReactNode; children: ReactNode; actions?: ReactNode; highlight?: boolean }) {
  return (
    <section id={id} className={clsx('card scroll-mt-24', highlight && 'ring-2 ring-cyan/60')}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
