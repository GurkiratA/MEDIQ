import { clsx } from 'clsx'
import { CheckCircle2, Circle, Loader2, Mic, RotateCcw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, Button, Field, Modal } from '../components/ui'
import { newId } from '../db/database'
import type { Authorization, DoctorProfile, Permission } from '../db/schema'
import { useData, useSnap } from '../state/DataContext'
import { useToast } from '../state/ToastContext'
import { ENROLLMENT_PHRASES } from '../voice/phrases'
import { assessSample, ENROLL_THRESHOLDS, type QualityReport } from '../voice/quality'
import { recordClip } from '../voice/recorder'
import { embedUtterance, loadSpeakerModel, SPEAKER_MODEL } from '../voice/speakerModel'
import { centroid, consistency, cosine } from '../voice/verification'
import { useVoice } from '../voice/VoiceContext'

export type WizardMode = { kind: 'owner' } | { kind: 'clinician'; ownerId: string } | { kind: 'reenroll'; profile: DoctorProfile; ownerId: string }

const MIN_SAMPLES = 3
const MIN_CONSISTENCY = 0.4

interface Sample {
  phrase: string
  status: 'pending' | 'recording' | 'processing' | 'ok' | 'rejected'
  quality: QualityReport | null
  embedding: number[] | null
  issues: string[]
}

export function nextClinicianId(profiles: DoctorProfile[]): string {
  const max = profiles.reduce((m, p) => Math.max(m, Number(p.clinicianId.slice(-4)) || 0), 0)
  return `SYN-CLN-${String(max + 1).padStart(4, '0')}`
}

export function EnrollmentWizard({ mode, onClose }: { mode: WizardMode; onClose: () => void }) {
  const snap = useSnap()
  const { run } = useData()
  const toast = useToast()
  const voice = useVoice()
  const [step, setStep] = useState<'intro' | 'record' | 'review'>('intro')
  const [name, setName] = useState(mode.kind === 'reenroll' ? mode.profile.displayName : '')
  const [consent, setConsent] = useState(false)
  const [samples, setSamples] = useState<Sample[]>(() => ENROLLMENT_PHRASES.slice(0, MIN_SAMPLES).map((phrase) => ({ phrase, status: 'pending', quality: null, embedding: null, issues: [] })))
  const [active, setActive] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const stopRef = useRef<AbortController | null>(null)

  useEffect(() => {
    voice.setEnrolling(true)
    void loadSpeakerModel().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      voice.setEnrolling(false)
      stopRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchSample = (i: number, p: Partial<Sample>) => setSamples((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const record = async (i: number) => {
    setError(null)
    const ctrl = new AbortController()
    stopRef.current = ctrl
    patchSample(i, { status: 'recording', issues: [] })
    try {
      const clip = await recordClip({ maxSeconds: 8, signal: ctrl.signal, onLevel: setLevel })
      patchSample(i, { status: 'processing' })
      const quality = assessSample(clip.pcm, ENROLL_THRESHOLDS)
      if (!quality.ok) {
        patchSample(i, { status: 'rejected', quality, issues: quality.issues, embedding: null })
        return
      }
      const embedding = await embedUtterance(clip.pcm)
      // Raw audio (clip.pcm) goes out of scope here and is never stored.
      patchSample(i, { status: 'ok', quality, embedding, issues: [] })
      const next = samples.findIndex((s, j) => j > i && s.status !== 'ok')
      if (next >= 0) setActive(next)
    } catch (err) {
      patchSample(i, { status: 'rejected', issues: [err instanceof Error ? err.message : String(err)] })
    } finally {
      stopRef.current = null
      setLevel(0)
    }
  }

  const good = samples.filter((s) => s.status === 'ok' && s.embedding)
  const embs = good.map((s) => s.embedding!)
  const cons = embs.length >= 2 ? consistency(embs) : null
  const others = snap.doctors.filter((d) => mode.kind !== 'reenroll' || d.id !== mode.profile.id)
  const cent = embs.length >= MIN_SAMPLES ? centroid(embs) : null
  const dup = cent ? others.map((d) => ({ d, s: cosine(cent, d.embedding) })).sort((a, b) => b.s - a.s)[0] : undefined
  const isDuplicate = !!dup && dup.s >= snap.settings.verificationThreshold
  const consistent = !!cons && cons.mean >= MIN_CONSISTENCY
  const ready = good.length >= MIN_SAMPLES && consistent && !isDuplicate && name.trim().length > 0

  const save = async () => {
    if (!cent || !cons) return
    const now = new Date().toISOString()
    const voiceModel = { type: SPEAKER_MODEL.type, version: SPEAKER_MODEL.version, dimensions: SPEAKER_MODEL.dimensions, threshold: snap.settings.verificationThreshold }
    if (mode.kind === 'reenroll') {
      await run((db) =>
        db.updateProfile(
          { ...mode.profile, displayName: name.trim(), embedding: cent, sampleCount: good.length, enrollmentConsistency: Number(cons.mean.toFixed(3)), enrollmentStatus: 'Enrolled', enrolledAt: now, voiceModel, updatedAt: now },
          { kind: 'profile-reenrolled', category: 'security', mode: 'live', profileId: mode.profile.id, message: `Voice profile ${mode.profile.clinicianId} re-enrolled after owner verification.` },
        ),
      )
      toast({ tone: 'ok', title: 'Profile re-enrolled' })
      return onClose()
    }
    const id = newId('DOC')
    const isOwner = mode.kind === 'owner'
    const profile: DoctorProfile = {
      id,
      displayName: name.trim(),
      clinicianId: nextClinicianId(snap.doctors),
      role: isOwner ? 'Owner' : 'Clinician',
      enrollmentStatus: 'Enrolled',
      enrolledAt: now,
      lastVerifiedAt: null,
      voiceModel,
      embedding: cent,
      sampleCount: good.length,
      enrollmentConsistency: Number(cons.mean.toFixed(3)),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    const permissions: Permission[] = isOwner ? ['voice-navigation', 'voice-dictation', 'manage-profiles'] : ['voice-navigation', 'voice-dictation']
    const auth: Authorization = { id: newId('AUTH'), profileId: id, permissions, grantedBy: isOwner ? 'initial-owner-setup' : mode.ownerId, grantedAt: now, revokedAt: null, revokedBy: null, active: true }
    await run((db) =>
      db.addProfile(profile, auth, {
        kind: isOwner ? 'profile-enrolled' : 'profile-authorized',
        category: 'security',
        mode: 'live',
        profileId: id,
        message: isOwner ? `Owner voice profile enrolled (${profile.clinicianId}).` : `Clinician ${profile.clinicianId} enrolled and explicitly authorized by the owner.`,
        details: { samples: good.length, consistency: Number(cons.mean.toFixed(3)) },
      }),
    )
    toast({ tone: 'ok', title: isOwner ? 'Owner enrolled' : 'Doctor authorized', body: `${profile.displayName} · ${profile.clinicianId}` })
    onClose()
  }

  const title = mode.kind === 'owner' ? 'Owner voice enrollment' : mode.kind === 'clinician' ? 'Add authorized doctor' : `Re-enroll ${mode.profile.displayName}`

  if (confirm && cent && cons)
    return (
      <ConfirmDialog
        open
        title={mode.kind === 'clinician' ? 'Owner authorization' : 'Save voice profile'}
        target={`${name.trim()} · ${mode.kind === 'reenroll' ? mode.profile.clinicianId : nextClinicianId(snap.doctors)}`}
        changes={[
          { label: 'Role', before: mode.kind === 'reenroll' ? mode.profile.role : '—', after: mode.kind === 'owner' ? 'Owner' : mode.kind === 'reenroll' ? mode.profile.role : 'Clinician' },
          { label: 'Permissions', before: mode.kind === 'reenroll' ? 'unchanged' : 'none', after: mode.kind === 'owner' ? 'voice navigation, dictation, manage profiles' : mode.kind === 'reenroll' ? 'unchanged' : 'voice navigation, dictation' },
          { label: 'Voiceprint', before: mode.kind === 'reenroll' ? 'previous centroid' : 'none', after: `${good.length} samples · consistency ${cons.mean.toFixed(2)}` },
        ]}
        warnings={[
          'Only a derived 256-number embedding is stored in this browser’s IndexedDB. Raw recordings are discarded.',
          'Browser storage is not tamper-proof; this is prototype-level access control, not production authentication.',
        ]}
        source={mode.kind === 'owner' ? 'Initial owner setup on this device' : 'Owner re-verified by voice immediately before this step'}
        confirmLabel={mode.kind === 'clinician' ? 'Authorize this doctor' : 'Save profile'}
        gestureAllowed={false}
        onCancel={() => setConfirm(false)}
        onConfirm={save}
      />
    )

  return (
    <Modal open onClose={() => !samples.some((s) => s.status === 'recording') && onClose()} title={title} wide>
      {step === 'intro' && (
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Display name" htmlFor="enr-name">
              <input id="enr-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Avery (demo)" maxLength={60} />
            </Field>
            <Field label="Synthetic clinician identifier">
              <p className="input font-mono text-ink-muted">{mode.kind === 'reenroll' ? mode.profile.clinicianId : nextClinicianId(snap.doctors)}</p>
            </Field>
          </div>
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-ink-muted">
            <p className="mb-1 font-semibold text-ink">What happens</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>You read {MIN_SAMPLES} prompted phrases (≈ 4 s each). Silent, clipped, short or noisy recordings are rejected.</li>
              <li>Each recording is processed on this device into a speaker embedding (WeSpeaker ResNet34). Raw audio is discarded immediately and never uploaded.</li>
              <li>The embeddings are averaged into one voiceprint stored in this browser’s IndexedDB.</li>
              <li>Limitation: recordings, synthetic voices, similar voices and microphone changes can affect results. No anti-spoofing is included.</li>
            </ul>
          </div>
          {mode.kind === 'clinician' && <Alert tone="info">The owner has just been re-verified. After recording, the owner must explicitly confirm the authorization.</Alert>}
          <label className="flex items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>The person being enrolled understands the above and consents to recording short voice samples for this demo.</span>
          </label>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!consent || !name.trim()} onClick={() => setStep('record')}>
              Continue to recording
            </Button>
          </div>
        </div>
      )}

      {step !== 'intro' && (
        <div className="space-y-4">
          <ol className="space-y-2">
            {samples.map((s, i) => (
              <li key={i} className={clsx('rounded-lg border p-3', i === active && step === 'record' ? 'border-cyan/60 bg-cyan/5' : 'border-line bg-surface-2')}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {s.status === 'ok' ? (
                      <CheckCircle2 className="size-5 text-ok" />
                    ) : s.status === 'recording' || s.status === 'processing' ? (
                      <Loader2 className="size-5 animate-spin text-cyan" />
                    ) : (
                      <Circle className={clsx('size-5', s.status === 'rejected' ? 'text-danger' : 'text-ink-faint')} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-faint">Sample {i + 1} — read aloud:</p>
                    <p className="text-base font-medium text-ink">“{s.phrase}”</p>
                    {s.status === 'recording' && (
                      <span className="mt-2 block h-1.5 w-48 overflow-hidden rounded bg-cyan/20">
                        <span className="block h-full bg-cyan" style={{ width: `${Math.round(level * 100)}%` }} />
                      </span>
                    )}
                    {s.status === 'processing' && <p className="mt-1 text-xs text-cyan">Processing on-device…</p>}
                    {s.quality && s.status === 'ok' && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {s.quality.voicedSec.toFixed(1)} s voiced · SNR ≈ {s.quality.snrDb.toFixed(0)} dB · accepted
                      </p>
                    )}
                    {s.issues.length > 0 && <p className="mt-1 text-xs text-danger-soft">{s.issues.join(' ')}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {s.status === 'recording' ? (
                      <Button size="sm" variant="danger" icon={<Square className="size-3.5" />} onClick={() => stopRef.current?.abort()}>
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={s.status === 'ok' ? 'ghost' : 'primary'}
                        icon={s.status === 'ok' || s.status === 'rejected' ? <RotateCcw className="size-3.5" /> : <Mic className="size-3.5" />}
                        disabled={samples.some((x) => x.status === 'recording' || x.status === 'processing')}
                        onClick={() => {
                          setActive(i)
                          setStep('record')
                          void record(i)
                        }}
                      >
                        {s.status === 'ok' ? 'Redo' : s.status === 'rejected' ? 'Retry' : 'Record'}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {samples.length < ENROLLMENT_PHRASES.length && (
            <button
              type="button"
              className="text-xs text-cyan hover:underline"
              onClick={() => setSamples((s) => [...s, { phrase: ENROLLMENT_PHRASES[s.length], status: 'pending', quality: null, embedding: null, issues: [] }])}
            >
              + Add another sample (improves robustness)
            </button>
          )}

          {good.length >= MIN_SAMPLES && cons && (
            <div className="space-y-2">
              <p className="label">Enrollment review</p>
              <p className="text-sm text-ink">
                {good.length} accepted samples · consistency {cons.mean.toFixed(2)} (min pair {cons.min.toFixed(2)}; required mean ≥ {MIN_CONSISTENCY})
              </p>
              {!consistent && <Alert tone="warn">Samples are inconsistent (different speakers or noisy audio?). Redo sample {cons.worstIndex + 1} and check that only one person is speaking.</Alert>}
              {isDuplicate && <Alert tone="danger">This voice closely matches an already-enrolled profile. Duplicate profiles are not allowed.</Alert>}
              {consistent && !isDuplicate && <Alert tone="ok">Quality, consistency and duplicate checks passed.</Alert>}
            </div>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel (discard)
            </Button>
            <Button variant="primary" disabled={!ready} onClick={() => setConfirm(true)}>
              Review & {mode.kind === 'clinician' ? 'authorize' : 'save'}…
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
