import { clsx } from 'clsx'
import { Loader2, X } from 'lucide-react'
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sim'
const variants: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-bright border border-teal-bright/40 disabled:bg-teal/40',
  secondary: 'bg-surface-3 text-ink hover:bg-line-strong border border-line-strong',
  ghost: 'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-3 border border-transparent',
  danger: 'bg-danger/15 text-danger-soft hover:bg-danger/25 border border-danger/50',
  sim: 'bg-sim/15 text-sim hover:bg-sim/25 border border-sim/40',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variants[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ Badge */

export type Tone = 'neutral' | 'teal' | 'cyan' | 'ok' | 'warn' | 'danger' | 'sim'
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-muted border-line-strong',
  teal: 'bg-teal/15 text-teal-bright border-teal/40',
  cyan: 'bg-cyan/10 text-cyan-soft border-cyan/40',
  ok: 'bg-ok/10 text-ok border-ok/40',
  warn: 'bg-warn/10 text-warn border-warn/40',
  danger: 'bg-danger/15 text-danger-soft border-danger/50',
  sim: 'bg-sim/15 text-sim border-sim/40',
}

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function SyntheticTag() {
  return (
    <Badge tone="sim" className="uppercase tracking-wide">
      Synthetic
    </Badge>
  )
}

/* ------------------------------------------------------------------ Card */

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={clsx('card', className)} {...rest}>
      {children}
    </section>
  )
}

export function CardHeader({ title, subtitle, icon, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-cyan">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-surface-2 text-cyan">{icon}</span>}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ misc */

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <span className="text-ink-faint">{icon}</span>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="max-w-md text-xs text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function KeyValue({ items, cols = 2 }: { items: { k: string; v: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <dt className="label">{i.k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{i.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function NotDocumented({ value }: { value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return <span className="italic text-ink-faint">Not documented</span>
  return <>{value}</>
}

export function Alert({ tone = 'warn', title, children, icon }: { tone?: 'warn' | 'danger' | 'info' | 'sim' | 'ok'; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const map = {
    warn: 'border-warn/40 bg-warn/10 text-warn',
    danger: 'border-danger/60 bg-danger/10 text-danger-soft',
    info: 'border-cyan/40 bg-cyan/5 text-cyan-soft',
    sim: 'border-sim/40 bg-sim/10 text-sim',
    ok: 'border-ok/40 bg-ok/10 text-ok',
  }
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} className={clsx('flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm', map[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink/90">{children}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.id ? 'border-cyan text-ink' : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-surface-3 px-1 text-[11px] text-ink-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Modal */

export function Modal({ open, onClose, title, children, footer, wide, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; labelledBy?: string }) {
  const autoId = useId()
  const titleId = labelledBy ?? `modal-${autoId}`
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const node = ref.current
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
    ;(focusables()[0] ?? node)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx('card flex max-h-[92vh] w-full animate-fade-in flex-col overflow-hidden', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-ink-muted hover:bg-surface-3 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
