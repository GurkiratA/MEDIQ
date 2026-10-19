import { AlertTriangle, CheckCircle2, Pill } from 'lucide-react'
import { useMemo, useState } from 'react'
import { allergyClassKey, CLASSES, DRUGS } from '../ai/drugKnowledge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Button, Card, EmptyState, NotDocumented, PageHeader, Tabs, type Tone } from '../components/ui'
import type { MedicationEffect } from '../db/schema'
import { fmtDate } from '../lib/format'
import { useData, useSnap } from '../state/DataContext'
import { useNav, type MedsTab } from '../state/NavContext'
import { useToast } from '../state/ToastContext'

const CAT_TONE: Record<MedicationEffect['category'], Tone> = {
  'Beneficial (documented)': 'ok',
  'Adverse (documented)': 'danger',
  'Patient-reported': 'cyan',
  'Potential interaction / contraindication (flagged for review)': 'warn',
  'Not yet assessed': 'neutral',
}

export function EffectsTable({ effects, allowReview = true }: { effects: MedicationEffect[]; allowReview?: boolean }) {
  const snap = useSnap()
  const { run } = useData()
  const toast = useToast()
  const [reviewing, setReviewing] = useState<MedicationEffect | null>(null)
  if (effects.length === 0) return <EmptyState title="No medication effects documented" />
  const med = (id: string) => snap.medications.find((m) => m.id === id)
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              {['Patient', 'Medication', 'Category', 'Documented effect', 'Severity', 'Recorded', 'Source', 'Review', 'Follow-up'].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {effects.map((e) => (
              <tr key={e.id} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-cyan">{e.patientId}</td>
                <td className="px-3 py-2 font-medium text-ink">{med(e.medicationId)?.name ?? <span className="text-danger">Invalid reference</span>}</td>
                <td className="px-3 py-2"><Badge tone={CAT_TONE[e.category]} className="whitespace-normal">{e.category}</Badge></td>
                <td className="px-3 py-2 text-ink">
                  {e.effect}
                  {e.reportedSymptoms.length > 0 && <span className="block text-xs text-ink-muted">Symptoms: {e.reportedSymptoms.join(', ')}</span>}
                  {e.relatedAlert && <span className="block text-xs text-warn">Related alert: {e.relatedAlert}</span>}
                </td>
                <td className="px-3 py-2 text-ink-muted">{e.severity}</td>
                <td className="px-3 py-2 text-xs text-ink-muted">{fmtDate(e.recordedAt)}</td>
                <td className="px-3 py-2 text-xs text-ink-faint">{e.source}</td>
                <td className="px-3 py-2">
                  <Badge tone={e.reviewStatus === 'Reviewed by clinician' ? 'ok' : 'warn'}>{e.reviewStatus}</Badge>
                  {allowReview && e.reviewStatus !== 'Reviewed by clinician' && (
                    <button type="button" className="mt-1 block text-xs text-cyan hover:underline" onClick={() => setReviewing(e)}>
                      Mark reviewed…
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-muted">{e.followUpStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reviewing && (
        <ConfirmDialog
          open
          title="Record clinician review of a documented effect"
          target={`Patient ${reviewing.patientId} · ${med(reviewing.medicationId)?.name} · ${reviewing.id}`}
          changes={[{ label: 'Review status', before: reviewing.reviewStatus, after: 'Reviewed by clinician' }]}
          warnings={['This records a review status only. It does not start, stop or change any medication.']}
          source="Manual action in Medication Records"
          confirmLabel="Confirm review status"
          gestureAllowed
          onCancel={() => setReviewing(null)}
          onConfirm={async () => {
            await run((db) => db.updateEffectReview(reviewing.id, 'Reviewed by clinician'))
            toast({ tone: 'ok', title: 'Review status recorded' })
            setReviewing(null)
          }}
        />
      )}
    </>
  )
}

export function MedicationsView() {
  const snap = useSnap()
  const nav = useNav()
  const [patientFilter, setPatientFilter] = useState<string>(nav.patientId ?? 'all')
  const meds = snap.medications.filter((m) => patientFilter === 'all' || m.patientId === patientFilter)
  const effects = snap.effects.filter((e) => patientFilter === 'all' || e.patientId === patientFilter)

  const conflicts = useMemo(() => {
    const out: { key: string; patientId: string; title: string; detail: string; source: string }[] = []
    for (const p of snap.patients) {
      if (patientFilter !== 'all' && p.id !== patientFilter) continue
      for (const m of snap.medications.filter((x) => x.patientId === p.id && x.status === 'Active')) {
        const d = DRUGS[(m.genericName ?? m.name).toLowerCase()] ?? DRUGS[m.name.toLowerCase()]
        for (const a of p.allergies.filter((x) => x.status === 'Active')) {
          const k = allergyClassKey(a.substance, a.substanceClass)
          if (d && k && d.cls === k)
            out.push({ key: `${m.id}-${a.id}`, patientId: p.id, title: `${m.name} vs documented ${a.substance} allergy`, detail: `Same class (${CLASSES[k]?.label}). Requires qualified clinician review.`, source: 'Local deterministic rule' })
        }
        for (const f of m.safetyFlags) out.push({ key: `${m.id}-${f}`, patientId: p.id, title: `${m.name}: ${f}`, detail: 'Flag documented on the synthetic medication record.', source: 'Medication record' })
      }
    }
    for (const e of snap.effects.filter((x) => x.category.startsWith('Potential') && (patientFilter === 'all' || x.patientId === patientFilter)))
      out.push({ key: e.id, patientId: e.patientId, title: e.relatedAlert ?? 'Potential interaction', detail: e.effect, source: e.source })
    return out
  }, [snap, patientFilter])

  return (
    <>
      <PageHeader
        title="Medication Records"
        icon={<Pill className="size-5" />}
        subtitle="Separate medication and medication-effects databases. Values are shown only as documented — never inferred."
        actions={
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Patient
            <select className="input h-9 w-auto" value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}>
              <option value="all">All synthetic patients</option>
              {snap.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.fullName}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <Tabs<MedsTab>
        label="Medication records"
        tabs={[
          { id: 'medications', label: 'Medications', count: meds.length },
          { id: 'effects', label: 'Documented effects', count: effects.length },
          { id: 'alerts', label: 'Potential safety conflicts', count: conflicts.length },
        ]}
        value={nav.medsTab}
        onChange={(t) => nav.navigate({ medsTab: t })}
      />
      <Card className="mt-4">
        {nav.medsTab === 'medications' &&
          (meds.length === 0 ? (
            <EmptyState title="No medications for this filter" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="text-xs text-ink-muted">
                  <tr className="border-b border-line">
                    {['Patient', 'Medication', 'Dose', 'Route', 'Frequency', 'Start – end', 'Status', 'Indication', 'Prescriber', 'Source', 'Flags'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {meds.map((m) => (
                    <tr key={m.id} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-2">
                        <button type="button" className="font-mono text-xs text-cyan hover:underline" onClick={() => nav.navigate({ view: 'patients', patientId: m.patientId, patientTab: 'medications' })}>
                          {m.patientId}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{m.name}</span>
                        <span className="block text-xs text-ink-faint">{[m.genericName, m.medicationClass].filter(Boolean).join(' · ') || 'Class not documented'}</span>
                      </td>
                      <td className="px-3 py-2"><NotDocumented value={m.dose} /></td>
                      <td className="px-3 py-2"><NotDocumented value={m.route} /></td>
                      <td className="px-3 py-2"><NotDocumented value={m.frequency} /></td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{fmtDate(m.startDate)} – {m.endDate ? fmtDate(m.endDate) : 'ongoing'}</td>
                      <td className="px-3 py-2"><Badge tone={m.status === 'Active' ? 'teal' : 'neutral'}>{m.status}</Badge></td>
                      <td className="px-3 py-2 text-ink-muted"><NotDocumented value={m.indication} /></td>
                      <td className="px-3 py-2 text-xs text-ink-muted"><NotDocumented value={m.prescriber} /></td>
                      <td className="px-3 py-2 text-xs text-ink-faint">{m.source}</td>
                      <td className="px-3 py-2">{m.safetyFlags.map((f) => <Badge key={f} tone="warn" className="mb-1 whitespace-normal">{f}</Badge>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {nav.medsTab === 'effects' && (
          <div>
            <p className="border-b border-line px-4 py-2 text-xs text-ink-faint">
              Categories distinguish documented beneficial/adverse effects, patient reports, potential interactions flagged for review, and effects not yet assessed. All are synthetic.
            </p>
            <EffectsTable effects={effects} />
          </div>
        )}
        {nav.medsTab === 'alerts' &&
          (conflicts.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-6" />} title="No potential conflicts identified by the local rules" body="Absence of a flag is not a clinical clearance." />
          ) : (
            <ul className="divide-y divide-line">
              {conflicts.map((c) => (
                <li key={c.key} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">
                      Patient {c.patientId}: {c.title}
                    </p>
                    <p className="text-ink-muted">{c.detail}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">Source: {c.source} · requires qualified clinician review</p>
                  </div>
                  <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => nav.navigate({ view: 'patients', patientId: c.patientId, patientTab: 'medications' })}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </Card>
      <p className="mt-3 text-xs text-ink-faint">
        Drug-class matching uses a small general reference table based on the WHO ATC classification (atcddd.fhi.no). It is general reference information, not patient-specific facts, and not a complete knowledge base.
      </p>
    </>
  )
}
