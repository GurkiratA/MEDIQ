import { Mic, ShieldCheck, Square } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Alert, Button, Modal } from '../components/ui'
import { useData, useSnap } from '../state/DataContext'
import { challengePhrase } from '../voice/phrases'
import { decisionReason } from '../voice/verification'
import { useVoice } from '../voice/VoiceContext'

/**
 * Owner re-verification before any profile-management action: a fresh,
 * random challenge phrase is spoken and verified against the OWNER profile
 * (permission "manage-profiles"). When speech recognition is available the
 * transcript must contain the challenge words — a basic liveness prompt,
 * NOT anti-spoofing.
 */
export function OwnerCheck({ purpose, onVerified, onCancel }: { purpose: string; onVerified: () => void; onCancel: () => void }) {
  const snap = useSnap()
  const { log } = useData()
  const voice = useVoice()
  const owner = snap.doctors.find((d) => d.role === 'Owner')
  const [phrase, setPhrase] = useState(() => challengePhrase())
  const words = useMemo(() => phrase.replace(/^MEDIQ owner check: /, '').replace(/[^a-z ]/gi, ' ').split(/\s+/).filter((w) => w.length > 3), [phrase])
  const [state, setState] = useState<'idle' | 'recording' | 'checking'>('idle')
  const [level, setLevel] = useState(0)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  const start = async () => {
    setResult(null)
    setState('recording')
    const c = new AbortController()
    ctrl.current = c
    try {
      const r = await voice.verifyFresh({ permission: 'manage-profiles', maxSeconds: 8, signal: c.signal, onLevel: setLevel })
      setState('checking')
      const spokenOk = !r.transcriptAvailable || words.filter((w) => r.transcript.toLowerCase().includes(w.toLowerCase())).length >= 2
      const ok = !!r.decision && r.decision.outcome === 'accepted' && r.decision.profileId === owner?.id && spokenOk
      await log({
        kind: ok ? 'verification-success' : 'verification-failed',
        category: 'security',
        mode: 'live',
        profileId: ok ? owner?.id ?? null : null,
        message: ok ? `Owner re-verified for: ${purpose}.` : `Owner re-verification failed for: ${purpose}.`,
        details: { purpose: purpose.slice(0, 80), phraseMatched: spokenOk },
      })
      if (ok) {
        setResult({ ok: true, text: 'Owner verified.' })
        setTimeout(onVerified, 500)
      } else {
        setPhrase(challengePhrase())
        setResult({
          ok: false,
          text: r.error
            ? r.error
            : !r.decision
              ? `Sample rejected: ${r.quality.issues.join(' ')}`
              : r.decision.outcome !== 'accepted' || r.decision.profileId !== owner?.id
                ? `Voice Not Verified: Access Denied. ${r.decision.outcome === 'accepted' ? 'This action needs the owner.' : decisionReason(r.decision)}`
                : 'The spoken words did not match the challenge phrase. Read the new phrase exactly.',
        })
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setState('idle')
      setLevel(0)
      ctrl.current = null
    }
  }

  return (
    <Modal open onClose={() => state === 'idle' && onCancel()} title="Owner verification required">
      <div className="space-y-4 text-sm">
        <p className="text-ink-muted">
          <span className="font-medium text-ink">{purpose}</span> changes who can control MEDIQ by voice. The owner must speak this fresh challenge phrase:
        </p>
        <p className="rounded-lg border border-cyan/40 bg-cyan/5 px-3 py-3 text-center text-lg font-semibold text-ink">“{phrase}”</p>
        {state === 'recording' && (
          <span className="mx-auto block h-1.5 w-48 overflow-hidden rounded bg-cyan/20">
            <span className="block h-full bg-cyan" style={{ width: `${Math.round(level * 100)}%` }} />
          </span>
        )}
        {result && <Alert tone={result.ok ? 'ok' : 'danger'}>{result.text}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={state !== 'idle'}>
            Cancel
          </Button>
          {state === 'recording' ? (
            <Button variant="danger" icon={<Square className="size-4" />} onClick={() => ctrl.current?.abort()}>
              Stop & verify
            </Button>
          ) : (
            <Button variant="primary" icon={state === 'checking' ? <ShieldCheck className="size-4" /> : <Mic className="size-4" />} loading={state === 'checking'} onClick={() => void start()} disabled={!owner}>
              {result && !result.ok ? 'Retry' : 'Record challenge'}
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-faint">Prompted phrases make simple replay harder but are not anti-spoofing. Gestures and typed input cannot satisfy this step.</p>
      </div>
    </Modal>
  )
}
