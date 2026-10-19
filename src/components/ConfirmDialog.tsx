import { AlertTriangle, Hand, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { confirmBus } from '../state/confirmBus'
import { Alert, Button, Modal } from './ui'

export interface ChangeRow {
  label: string
  before: string
  after: string
}

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Target patient or record. */
  target: string
  /** Where the information came from (e.g. "Typed by user", "Gemini audit + local rule"). */
  source: string
  changes?: ChangeRow[]
  warnings?: string[]
  /** Exact content that will be saved, shown verbatim. */
  exactContent?: ReactNode
  confirmLabel: string
  danger?: boolean
  /** Whether a thumbs-up gesture may confirm (never for authorization changes). */
  gestureAllowed?: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
  extra?: ReactNode
}

/**
 * Mandatory human-review step for every sensitive action. The user must tick
 * "I have reviewed…" before confirmation is possible (by button, or — where
 * allowed — by thumbs-up gesture). Cancel is always available.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, title, target, source, changes = [], warnings = [], exactContent, confirmLabel, danger, gestureAllowed = false, onConfirm, onCancel, extra } = props
  const id = useId()
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReviewed(false)
    setError(null)
  }, [open])

  const doConfirm = async () => {
    if (!reviewed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Register with the gesture bridge while open.
  useEffect(() => {
    if (!open) return
    confirmBus.set({ id, title, gestureAllowed, reviewed, confirm: () => void doConfirm() })
    return () => confirmBus.clear(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, title, gestureAllowed, reviewed])

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      wide={!!exactContent}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={doConfirm} disabled={!reviewed} loading={busy} icon={<ShieldCheck className="size-4" />}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="label">Target</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{target}</p>
        </div>
        {changes.length > 0 && (
          <div>
            <p className="label mb-1.5">Proposed change</p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs text-ink-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Field</th>
                    <th scope="col" className="px-3 py-2 font-medium">Current</th>
                    <th scope="col" className="px-3 py-2 font-medium">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.label} className="border-t border-line">
                      <td className="px-3 py-2 text-ink-muted">{c.label}</td>
                      <td className="px-3 py-2 text-ink-muted">{c.before}</td>
                      <td className="px-3 py-2 font-medium text-ink">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div>
          <p className="label">Source of information</p>
          <p className="mt-0.5 text-sm text-ink">{source}</p>
        </div>
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w) => (
              <Alert key={w} tone="warn" icon={<AlertTriangle className="size-4" />}>
                {w}
              </Alert>
            ))}
          </div>
        )}
        {exactContent && (
          <div>
            <p className="label mb-1.5">Exact content that will be saved</p>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">{exactContent}</div>
          </div>
        )}
        {extra}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span>
            I have reviewed this exact change and confirm it. <span className="text-ink-muted">AI output, voice commands and gestures cannot confirm on their own.</span>
          </span>
        </label>
        {gestureAllowed && (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Hand className="size-3.5" /> After ticking the box, a thumbs-up gesture can also confirm. The button always works.
          </p>
        )}
        {error && (
          <Alert tone="danger" title="Not saved">
            {error}
          </Alert>
        )}
      </div>
    </Modal>
  )
}
