import { Crown, Fingerprint, Pencil, RotateCcw, ShieldCheck, ShieldOff, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader } from '../components/ui'
import type { DoctorProfile } from '../db/schema'
import { fmtDateTime, relativeTime } from '../lib/format'
import { useData, useSnap } from '../state/DataContext'
import { useToast } from '../state/ToastContext'
import { activeGrant } from '../voice/verification'
import { EnrollmentWizard, type WizardMode } from './EnrollmentWizard'
import { OwnerCheck } from './OwnerCheck'

type Pending =
  | { kind: 'rename'; profile: DoctorProfile }
  | { kind: 'revoke'; profile: DoctorProfile }
  | { kind: 'remove'; profile: DoctorProfile }
  | { kind: 'threshold'; threshold: number; margin: number }

export function DoctorsView() {
  const snap = useSnap()
  const { run, saveSettings } = useData()
  const toast = useToast()
  const owner = snap.doctors.find((d) => d.role === 'Owner')
  const [wizard, setWizard] = useState<WizardMode | null>(null)
  const [check, setCheck] = useState<{ purpose: string; then: () => void } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [rename, setRename] = useState('')
  const [threshold, setThreshold] = useState(snap.settings.verificationThreshold)
  const [margin, setMargin] = useState(snap.settings.ambiguityMargin)

  /** Every profile-management action needs a fresh owner voice check first. */
  const withOwner = (purpose: string, then: () => void) => (owner ? setCheck({ purpose, then }) : then())

  const authStatus = (p: DoctorProfile) => (p.revokedAt ? 'Revoked' : activeGrant(p.id, snap.authorizations, 'voice-navigation') ? 'Authorized' : 'Not authorized')
  const grantFor = (p: DoctorProfile) => snap.authorizations.find((a) => a.profileId === p.id)

  return (
    <>
      <PageHeader
        title="Authorized Doctors & Voiceprints"
        icon={<Fingerprint className="size-5" />}
        subtitle="Owner-controlled enrollment, authorization and revocation. Unknown speakers can never enroll themselves."
        actions={
          owner ? (
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => withOwner('Add an authorized doctor', () => setWizard({ kind: 'clinician', ownerId: owner.id }))}>
              Add authorized doctor
            </Button>
          ) : (
            <Button variant="primary" icon={<Crown className="size-4" />} onClick={() => setWizard({ kind: 'owner' })}>
              Set up owner
            </Button>
          )
        }
      />

      <div className="mb-4">
        <Alert tone="warn" title="Prototype security boundary">
          Profiles and permissions live in this browser’s IndexedDB. Anyone with access to this browser profile or machine can read, modify or delete them — this is not tamper-proof or production authentication. Voice verification can be affected by recordings, synthetic voices, similar voices, noise and microphone changes; no anti-spoofing model is integrated.
        </Alert>
      </div>

      <Card>
        <CardHeader title="Enrolled profiles" icon={<ShieldCheck className="size-4" />} subtitle={`${snap.doctors.length} profile(s) · model: WeSpeaker ResNet34 (VoxCeleb)`} />
        {snap.doctors.length === 0 ? (
          <EmptyState
            icon={<Crown className="size-6" />}
            title="No owner enrolled"
            body="Voice commands are locked (fail-closed) until the owner enrolls. Manual controls, typed commands and Demo Quick-Sim work without enrollment."
            action={<Button variant="primary" onClick={() => setWizard({ kind: 'owner' })}>Set up owner</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  {['Name', 'Clinician ID', 'Role', 'Enrollment', 'Authorization', 'Added', 'Last verified', 'Voiceprint', 'Actions'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.doctors.map((p) => {
                  const st = authStatus(p)
                  const g = grantFor(p)
                  return (
                    <tr key={p.id} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-2.5 font-medium text-ink">{p.displayName}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{p.clinicianId}</td>
                      <td className="px-3 py-2.5">{p.role === 'Owner' ? <Badge tone="cyan" icon={<Crown className="size-3" />}>Owner</Badge> : <Badge>Clinician</Badge>}</td>
                      <td className="px-3 py-2.5"><Badge tone={p.enrollmentStatus === 'Enrolled' ? 'ok' : 'warn'}>{p.enrollmentStatus}</Badge></td>
                      <td className="px-3 py-2.5">
                        <Badge tone={st === 'Authorized' ? 'ok' : 'danger'}>{st}</Badge>
                        {g && <span className="mt-1 block text-[11px] text-ink-faint">{g.permissions.join(', ')}</span>}
                        {p.revokedAt && <span className="block text-[11px] text-ink-faint">revoked {fmtDateTime(p.revokedAt)}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-muted">{fmtDateTime(p.createdAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-ink-muted">{relativeTime(p.lastVerifiedAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-ink-faint">
                        {p.voiceModel.dimensions}-d · {p.sampleCount} samples · consistency {p.enrollmentConsistency.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1" data-no-gesture>
                          <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => withOwner(`Rename ${p.clinicianId}`, () => { setRename(p.displayName); setPending({ kind: 'rename', profile: p }) })}>
                            Rename
                          </Button>
                          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => withOwner(`Re-enroll ${p.clinicianId}`, () => setWizard({ kind: 'reenroll', profile: p, ownerId: owner!.id }))}>
                            Re-enroll
                          </Button>
                          {p.role !== 'Owner' && !p.revokedAt && (
                            <Button size="sm" variant="danger" icon={<ShieldOff className="size-3.5" />} onClick={() => withOwner(`Revoke ${p.clinicianId}`, () => setPending({ kind: 'revoke', profile: p }))}>
                              Revoke
                            </Button>
                          )}
                          {p.role !== 'Owner' && (
                            <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => withOwner(`Remove ${p.clinicianId}`, () => setPending({ kind: 'remove', profile: p }))}>
                              Remove
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Verification thresholds" subtitle="Changing these requires owner verification" />
          <div className="space-y-4 p-4">
            <Field label={`Acceptance threshold (cosine): ${threshold.toFixed(2)}`} htmlFor="thr" hint="Default 0.50, calibrated on a small public multi-speaker sample set (see docs). Higher = fewer false accepts, more retries. This is a model score, not a probability.">
              <input id="thr" type="range" min={0.4} max={0.85} step={0.01} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="accent-teal" />
            </Field>
            <Field label={`Ambiguity margin: ${margin.toFixed(2)}`} htmlFor="mar" hint="If two different profiles both pass and differ by less than this, the attempt is rejected.">
              <input id="mar" type="range" min={0} max={0.3} step={0.01} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="accent-teal" />
            </Field>
            <Button
              size="sm"
              disabled={threshold === snap.settings.verificationThreshold && margin === snap.settings.ambiguityMargin}
              onClick={() => withOwner('Change verification thresholds', () => setPending({ kind: 'threshold', threshold, margin }))}
            >
              Apply thresholds…
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="How authorization works" />
          <ol className="list-decimal space-y-1.5 p-4 pl-8 text-sm text-ink-muted">
            <li>The owner enrolls first on this device (no other profile can exist before the owner).</li>
            <li>To add a doctor, the owner re-verifies with a fresh spoken challenge phrase.</li>
            <li>The new doctor consents and records prompted phrases; quality, consistency and duplicate checks run.</li>
            <li>The owner explicitly confirms the authorization (button only — gestures are disabled for this).</li>
            <li>Revoked profiles are still recognised so that their commands are explicitly rejected and logged.</li>
          </ol>
        </Card>
      </div>

      {wizard && <EnrollmentWizard mode={wizard} onClose={() => setWizard(null)} />}
      {check && (
        <OwnerCheck
          purpose={check.purpose}
          onCancel={() => setCheck(null)}
          onVerified={() => {
            const then = check.then
            setCheck(null)
            then()
          }}
        />
      )}

      {pending?.kind === 'rename' && (
        <Modal
          open
          onClose={() => setPending(null)}
          title={`Rename ${pending.profile.clinicianId}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!rename.trim() || rename.trim() === pending.profile.displayName}
                onClick={async () => {
                  const now = new Date().toISOString()
                  await run((db) => db.updateProfile({ ...pending.profile, displayName: rename.trim(), updatedAt: now }, { kind: 'profile-renamed', category: 'security', mode: 'live', profileId: pending.profile.id, message: `Profile ${pending.profile.clinicianId} renamed after owner verification.` }))
                  toast({ tone: 'ok', title: 'Profile renamed' })
                  setPending(null)
                }}
              >
                Save name
              </Button>
            </>
          }
        >
          <Field label="Display name" htmlFor="ren">
            <input id="ren" className="input" value={rename} maxLength={60} onChange={(e) => setRename(e.target.value)} />
          </Field>
        </Modal>
      )}

      {pending?.kind === 'revoke' && (
        <ConfirmDialog
          open
          title="Revoke voice access"
          target={`${pending.profile.displayName} · ${pending.profile.clinicianId}`}
          changes={[{ label: 'Authorization', before: 'Authorized', after: 'Revoked' }]}
          warnings={['Subsequent voice commands from this person will be rejected and logged. The voiceprint is kept so the rejection is explicit; use Remove to delete it.']}
          source="Owner action, re-verified by voice"
          confirmLabel="Revoke access"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await run((db) => db.revokeProfile(pending.profile.id, owner!.id, { kind: 'profile-revoked', category: 'security', mode: 'live', profileId: pending.profile.id, message: `Profile ${pending.profile.clinicianId} revoked by owner.` }))
            toast({ tone: 'ok', title: 'Access revoked' })
            setPending(null)
          }}
        />
      )}

      {pending?.kind === 'remove' && (
        <ConfirmDialog
          open
          title="Remove profile and voiceprint"
          target={`${pending.profile.displayName} · ${pending.profile.clinicianId}`}
          changes={[
            { label: 'Profile', before: 'Stored', after: 'Deleted' },
            { label: 'Voiceprint', before: 'Stored', after: 'Deleted' },
          ]}
          warnings={['After removal this voice becomes an unknown speaker and is rejected as such.']}
          source="Owner action, re-verified by voice"
          confirmLabel="Remove profile"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await run((db) => db.removeProfile(pending.profile.id, { kind: 'profile-removed', category: 'security', mode: 'live', message: `Profile ${pending.profile.clinicianId} removed by owner.` }))
            toast({ tone: 'ok', title: 'Profile removed' })
            setPending(null)
          }}
        />
      )}

      {pending?.kind === 'threshold' && (
        <ConfirmDialog
          open
          title="Change verification thresholds"
          target="Speaker-verification settings (this browser)"
          changes={[
            { label: 'Acceptance threshold', before: snap.settings.verificationThreshold.toFixed(2), after: pending.threshold.toFixed(2) },
            { label: 'Ambiguity margin', before: snap.settings.ambiguityMargin.toFixed(2), after: pending.margin.toFixed(2) },
          ]}
          warnings={pending.threshold < snap.settings.verificationThreshold ? ['Lowering the threshold increases the chance of accepting the wrong speaker.'] : []}
          source="Owner action, re-verified by voice"
          confirmLabel="Apply"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await saveSettings({ ...snap.settings, verificationThreshold: pending.threshold, ambiguityMargin: pending.margin })
            toast({ tone: 'ok', title: 'Thresholds updated' })
            setPending(null)
          }}
        />
      )}
    </>
  )
}
