import { clsx } from 'clsx'
import { CheckCircle2, Info, ShieldAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastTone = 'ok' | 'info' | 'error' | 'sim'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: string
}

const Ctx = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++seq
      setToasts((cur) => [...cur.slice(-3), { ...t, id }])
      setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={clsx(
              'card pointer-events-auto flex animate-fade-in items-start gap-2.5 px-3 py-2.5',
              t.tone === 'ok' && 'border-ok/40',
              t.tone === 'error' && 'border-danger/60',
              t.tone === 'sim' && 'border-sim/50',
            )}
          >
            {t.tone === 'ok' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
            {t.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-cyan" />}
            {t.tone === 'error' && <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />}
            {t.tone === 'sim' && <Info className="mt-0.5 size-4 shrink-0 text-sim" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-ink-muted">{t.body}</p>}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast outside ToastProvider')
  return v
}
