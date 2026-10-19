import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, Button, Field, Modal } from '../components/ui'
import { isActive, planAdmission, planDischarge, planTransfer, roomOccupancy, type Proposal } from '../db/allocation'
import { RiskCategory, type Admission } from '../db/schema'
import { useData, useSnap } from '../state/DataContext'
import { useToast } from '../state/ToastContext'

export const ACTOR = 'Demo user (manual action)'

export type AllocationIntent = { kind: 'admit'; patientId?: string; roomId?: string } | { kind: 'transfer'; admissionId: string } | { kind: 'discharge'; admissionId: string }

/** Single entry point: renders the right form + confirmation for an allocation intent. */
export function AllocationDialogs({ intent, onClose }: { intent: AllocationIntent | null; onClose: () => void }) {
  if (!intent) return null
  if (intent.kind === 'admit') return <AdmitFlow patientId={intent.patientId} roomId={intent.roomId} onClose={onClose} />
  if (intent.kind === 'transfer') return <TransferFlow admissionId={intent.admissionId} onClose={onClose} />
  return <DischargeFlow admissionId={intent.admissionId} onClose={onClose} />
}

function useBookable(excludeAdmissionId?: string) {
  const snap = useSnap()
  return useMemo(() => {
    const adms = snap.admissions.filter((a) => a.id !== excludeAdmissionId)
    return snap.rooms.map((r) => roomOccupancy(r, adms)).filter((o) => o.bookable)
  }, [snap, excludeAdmissionId])
}

function AdmitFlow({ patientId: fixedPatient, roomId: fixedRoom, onClose }: { patientId?: string; roomId?: string; onClose: () => void }) {
  const snap = useSnap()
  const { run } = useData()
  const toast = useToast()
  const bookable = useBookable()
  const candidates = snap.patients.filter((p) => !snap.admissions.some((a) => a.patientId === p.id && isActive(a)))
  const [patientId, setPatientId] = useState(fixedPatient ?? candidates[0]?.id ?? '')
  const [roomId, setRoomId] = useState(fixedRoom ?? bookable[0]?.room.id ?? '')
  const room = bookable.find((o) => o.room.id === roomId)
  const [bedId, setBedId] = useState(room?.freeBeds[0]?.id ?? '')
  const [risk, setRisk] = useState<RiskCategory>('Moderate')
  const [emergency, setEmergency] = useState(false)
  const [notes, setNotes] = useState('')
  const [clinician, setClinician] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)

  const review = () => {
    const plan = planAdmission(
      { patientId, roomId, bedId, riskCategory: risk, emergency, notes: notes.trim(), responsibleClinician: clinician.trim() || null },
      snap,
      new Date().toISOString(),
      ACTOR,
      'ADM-PREVIEW',
    )
    if (!plan.ok) return setErrors(plan.errors)
    setErrors([])
    setProposal(plan.proposal)
  }

  if (proposal)
    return (
      <ConfirmDialog
        open
        title={proposal.title}
        target={proposal.target}
        changes={proposal.changes}
        warnings={[...proposal.warnings, 'Emergency status and risk category are documented by you — they are never inferred by AI.']}
        source="Entered manually in the Rooms & Admissions form"
        confirmLabel="Confirm admission"
        gestureAllowed
        onCancel={() => setProposal(null)}
        onConfirm={async () => {
          await run((db) => db.admit({ patientId, roomId, bedId, riskCategory: risk, emergency, notes: notes.trim(), responsibleClinician: clinician.trim() || null }, ACTOR))
          toast({ tone: 'ok', title: 'Admission saved', body: `Patient ${patientId} assigned to ${bedId}.` })
          onClose()
        }}
      />
    )

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign patient to an available room"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={review} disabled={!patientId || !roomId || !bedId}>
            Review proposed change
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Patient" htmlFor="adm-patient">
          <select id="adm-patient" className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={!!fixedPatient}>
            {(fixedPatient ? snap.patients.filter((p) => p.id === fixedPatient) : candidates).map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Room (available only)" htmlFor="adm-room">
          <select
            id="adm-room"
            className="input"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value)
              setBedId(bookable.find((o) => o.room.id === e.target.value)?.freeBeds[0]?.id ?? '')
            }}
          >
            {bookable.length === 0 && <option value="">No rooms available</option>}
            {bookable.map((o) => (
              <option key={o.room.id} value={o.room.id}>
                {o.room.roomNumber} · {o.room.type} · {o.free} free
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bed" htmlFor="adm-bed">
          <select id="adm-bed" className="input" value={bedId} onChange={(e) => setBedId(e.target.value)}>
            {(room?.freeBeds ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                Bed {b.label} ({b.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Documented risk category" htmlFor="adm-risk">
          <select id="adm-risk" className="input" value={risk} onChange={(e) => setRisk(e.target.value as RiskCategory)}>
            {RiskCategory.options.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Responsible clinician (optional)" htmlFor="adm-clin">
          <input id="adm-clin" className="input" value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="Fictional name" />
        </Field>
        <label className="mt-5 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-teal" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} /> Emergency admission (documented)
        </label>
        <div className="sm:col-span-2">
          <Field label="Admission notes" htmlFor="adm-notes">
            <textarea id="adm-notes" className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Synthetic notes only" />
          </Field>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="mt-3">
          <Alert tone="danger" title="This allocation is not allowed">
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
    </Modal>
  )
}

function TransferFlow({ admissionId, onClose }: { admissionId: string; onClose: () => void }) {
  const snap = useSnap()
  const { run } = useData()
  const toast = useToast()
  const adm = snap.admissions.find((a) => a.id === admissionId) as Admission | undefined
  const bookable = useBookable(admissionId)
  const options = bookable.flatMap((o) => o.freeBeds.filter((b) => b.id !== adm?.bedId).map((b) => ({ room: o.room, bed: b })))
  const [target, setTarget] = useState(options[0] ? `${options[0].room.id}|${options[0].bed.id}` : '')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  if (!adm) return null
  const [toRoom, toBed] = target.split('|')

  if (proposal)
    return (
      <ConfirmDialog
        open
        title={proposal.title}
        target={proposal.target}
        changes={proposal.changes}
        warnings={proposal.warnings}
        source="Entered manually in the transfer form"
        confirmLabel="Confirm transfer"
        gestureAllowed
        onCancel={() => setProposal(null)}
        onConfirm={async () => {
          await run((db) => db.transfer(adm.id, toRoom, toBed, reason.trim(), ACTOR))
          toast({ tone: 'ok', title: 'Transfer saved', body: `${adm.bedId} → ${toBed}` })
          onClose()
        }}
      />
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={`Transfer patient ${adm.patientId}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target}
            onClick={() => {
              const plan = planTransfer(adm.id, toRoom, toBed, reason.trim(), snap, new Date().toISOString(), ACTOR)
              if (!plan.ok) return setErrors(plan.errors)
              setErrors([])
              setProposal(plan.proposal)
            }}
          >
            Review proposed change
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-ink-muted">
          Currently in <span className="font-mono text-ink">{adm.bedId}</span>.
        </p>
        <Field label="Destination bed (available only)" htmlFor="tr-target">
          <select id="tr-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            {options.length === 0 && <option value="">No beds available</option>}
            {options.map((o) => (
              <option key={o.bed.id} value={`${o.room.id}|${o.bed.id}`}>
                Room {o.room.roomNumber} · bed {o.bed.label} · {o.room.type} · {o.room.ward}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason (documented)" htmlFor="tr-reason">
          <input id="tr-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Step-down from observation (synthetic)" />
        </Field>
        {errors.length > 0 && (
          <Alert tone="danger" title="This transfer is not allowed">
            {errors.join(' ')}
          </Alert>
        )}
      </div>
    </Modal>
  )
}

function DischargeFlow({ admissionId, onClose }: { admissionId: string; onClose: () => void }) {
  const snap = useSnap()
  const { run } = useData()
  const toast = useToast()
  const plan = useMemo(() => planDischarge(admissionId, snap, new Date().toISOString(), ACTOR), [admissionId, snap])
  if (!plan.ok)
    return (
      <Modal open onClose={onClose} title="Cannot discharge" footer={<Button onClick={onClose}>Close</Button>}>
        <Alert tone="danger">{plan.errors.join(' ')}</Alert>
      </Modal>
    )
  return (
    <ConfirmDialog
      open
      title={plan.proposal.title}
      target={plan.proposal.target}
      changes={plan.proposal.changes}
      warnings={plan.proposal.warnings}
      source="Manual discharge action"
      confirmLabel="Confirm discharge"
      danger
      gestureAllowed
      onCancel={onClose}
      onConfirm={async () => {
        await run((db) => db.discharge(admissionId, ACTOR))
        toast({ tone: 'ok', title: 'Discharged', body: 'Bed released.' })
        onClose()
      }}
    />
  )
}
