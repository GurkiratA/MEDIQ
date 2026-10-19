import { clsx } from 'clsx'
import { AlertOctagon, ArrowLeft, BedDouble, FilePlus2, FlaskConical, HeartPulse, Pill, ScanLine, Users, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Section, SourceTag } from '../components/display'
import { Alert, Badge, Button, Card, EmptyState, KeyValue, NotDocumented, PageHeader, SyntheticTag, Tabs } from '../components/ui'
import { activeAdmissionFor, isActive } from '../db/allocation'
import type { Patient } from '../db/schema'
import { ageFromDob, bp, fmtDate, fmtDateTime, latestVitals } from '../lib/format'
import { useSnap } from '../state/DataContext'
import { PATIENT_TABS, useNav, type PatientTab } from '../state/NavContext'
import { useToast } from '../state/ToastContext'
import { speak } from '../voice/tts'
import { AllocationDialogs, type AllocationIntent } from './AllocationDialogs'
import { EffectsTable } from './MedicationsView'

const TAB_LABEL: Record<PatientTab, string> = {
  overview: 'Overview',
  vitals: 'Vitals',
  labs: 'Labs',
  notes: 'Visit Notes',
  medications: 'Medications',
  imaging: 'Imaging & Injuries',
  admission: 'Admission',
}

export function PatientsView() {
  const nav = useNav()
  return nav.patientId ? <PatientWorkspace patientId={nav.patientId} /> : <PatientList />
}

function PatientList() {
  const snap = useSnap()
  const nav = useNav()
  const [q, setQ] = useState('')
  const rows = snap.patients.filter((p) => !q.trim() || p.id.includes(q.trim()) || p.fullName.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <PageHeader title="Patients" icon={<Users className="size-5" />} subtitle="Synthetic patient database — every record is fictional." />
      <Card>
        <div className="border-b border-line p-3">
          <input className="input max-w-sm" type="search" aria-label="Filter patients" placeholder="Filter by ID or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No patients match your search" body="Try an ID such as 104." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  {['ID', 'Name', 'Age / gender', 'Allergies', 'Status', 'Room', 'Documentation'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const adm = activeAdmissionFor(p.id, snap.admissions)
                  const room = adm && snap.rooms.find((r) => r.id === adm.roomId)
                  const severe = p.allergies.some((a) => a.severity === 'Severe' && a.status === 'Active')
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-2.5 font-mono text-cyan">{p.id}</td>
                      <td className="px-4 py-2.5">
                        <button type="button" className="font-medium text-ink hover:underline" onClick={() => nav.navigate({ view: 'patients', patientId: p.id, patientTab: 'overview' })}>
                          {p.fullName}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">
                        {ageFromDob(p.dateOfBirth)} · {p.gender}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.noKnownDrugAllergies ? (
                          <span className="text-ink-muted">NKDA (documented)</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {p.allergies.map((a) => (
                              <Badge key={a.id} tone={a.severity === 'Severe' ? 'danger' : 'warn'} icon={severe && a.severity === 'Severe' ? <AlertOctagon className="size-3" /> : undefined}>
                                {a.substance}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{p.currentVisitStatus}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{room ? `${room.roomNumber} · ${adm.bedId.split('-').pop()}` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={p.documentationStatus === 'Complete' ? 'ok' : 'warn'}>{p.documentationStatus}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

function PatientWorkspace({ patientId }: { patientId: string }) {
  const snap = useSnap()
  const nav = useNav()
  const toast = useToast()
  const patient = snap.patients.find((p) => p.id === patientId)
  const [intent, setIntent] = useState<AllocationIntent | null>(null)

  useEffect(() => {
    if (nav.focus) document.getElementById(`sec-${nav.focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [nav.focus, nav.patientTab])

  if (!patient)
    return (
      <Card>
        <EmptyState title={`Patient ${patientId} not found`} body="It may have been removed by a data reset or import." action={<Button onClick={() => nav.navigate({ patientId: null })}>Back to patients</Button>} />
      </Card>
    )

  const meds = snap.medications.filter((m) => m.patientId === patient.id)
  const visits = snap.visits.filter((v) => v.patientId === patient.id)
  const adm = activeAdmissionFor(patient.id, snap.admissions)
  const age = ageFromDob(patient.dateOfBirth)
  const tabs = PATIENT_TABS.map((t) => ({ id: t, label: TAB_LABEL[t], count: t === 'labs' ? patient.labResults.length : t === 'notes' ? visits.length : t === 'medications' ? meds.length : undefined }))
  const readAloud = (text: string) => speak(text, { voiceURI: snap.settings.ttsVoiceURI, rate: snap.settings.ttsRate, lang: snap.settings.speechLang, onError: (m) => toast({ tone: 'error', title: 'Text-to-speech', body: m }) })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => nav.navigate({ patientId: null })} aria-label="Back to patient list">
            Patients
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-ink">
              <span className="font-mono text-cyan">{patient.id}</span> {patient.fullName} <SyntheticTag />
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {age ?? '—'} y · {patient.gender} · {patient.bloodGroup} · {patient.currentVisitStatus}
              {adm && ` · Room ${snap.rooms.find((r) => r.id === adm.roomId)?.roomNumber} bed ${adm.bedId.split('-').pop()}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Volume2 className="size-4" />} onClick={() => readAloud(`Patient ${patient.id.split('').join(' ')}, ${patient.fullName}, synthetic record. Age ${age}.`)}>
            Read identifiers
          </Button>
          <Button size="sm" variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => nav.navigate({ view: 'notes', patientId: patient.id })}>
            Start visit note
          </Button>
        </div>
      </div>

      {patient.allergies.some((a) => a.severity === 'Severe' && a.status === 'Active') && (
        <div className="mb-4">
          <Alert tone="danger" icon={<AlertOctagon className="size-4" />} title="Documented severe allergy">
            {patient.allergies
              .filter((a) => a.severity === 'Severe')
              .map((a) => `${a.substance} — ${a.reaction}`)
              .join('; ')}
          </Alert>
        </div>
      )}

      <Tabs label="Patient workspace sections" tabs={tabs} value={nav.patientTab} onChange={(t) => nav.navigate({ patientTab: t })} />
      <p className="mt-1 text-[11px] text-ink-faint">Tip: swipe a hand left/right (gestures on) or say “next tab” to move between sections.</p>

      <div role="tabpanel" id={`panel-${nav.patientTab}`} aria-labelledby={`tab-${nav.patientTab}`} className="mt-4 space-y-4">
        {nav.patientTab === 'overview' && <OverviewTab patient={patient} highlight={nav.focus} readAloud={readAloud} />}
        {nav.patientTab === 'vitals' && <VitalsTab patient={patient} />}
        {nav.patientTab === 'labs' && <LabsTab patient={patient} />}
        {nav.patientTab === 'notes' && (
          <Section title="Previous visit notes" actions={<Button size="sm" onClick={() => nav.navigate({ view: 'notes', patientId: patient.id })}>New visit note</Button>}>
            {visits.length === 0 ? (
              <EmptyState title="No visits recorded" />
            ) : (
              <ul className="space-y-3">
                {visits.map((v) => (
                  <li key={v.id} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-ink">{v.type}</span>
                      <span className="text-ink-faint">{fmtDateTime(v.visitAt)}</span>
                      <span className="text-ink-faint">{v.clinicianName ?? 'Clinician not documented'}</span>
                      {v.reviewStatus === 'Saved (clinician-confirmed)' ? <SourceTag kind="confirmed" /> : <Badge tone="warn">{v.reviewStatus}</Badge>}
                      {v.provenance.documentation !== 'seed' && <Badge tone="neutral">Draft by: {v.provenance.documentation}{v.provenance.audit ? ` · audit: ${v.provenance.audit}` : ''}</Badge>}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{v.finalNote}</pre>
                    {v.safetyFindings.length > 0 && (
                      <p className="mt-2 text-xs text-danger-soft">Safety findings acknowledged at save: {v.safetyFindings.map((f) => f.title).join('; ')}</p>
                    )}
                    {v.missingInformation.length > 0 && <p className="mt-1 text-xs text-warn">Missing: {v.missingInformation.join('; ')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        {nav.patientTab === 'medications' && <MedsTab patient={patient} />}
        {nav.patientTab === 'imaging' && <ImagingTab patient={patient} />}
        {nav.patientTab === 'admission' && <AdmissionTab patient={patient} onIntent={setIntent} />}
      </div>
      <AllocationDialogs intent={intent} onClose={() => setIntent(null)} />
    </>
  )
}

function OverviewTab({ patient, highlight, readAloud }: { patient: Patient; highlight: string | null; readAloud: (t: string) => void }) {
  const snap = useSnap()
  const meds = snap.medications.filter((m) => m.patientId === patient.id && m.status === 'Active')
  const v = latestVitals(patient)
  const pending = snap.visits.filter((x) => x.patientId === patient.id && x.reviewStatus === 'Pending review')
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Section id="sec-allergies" title="Allergies" highlight={highlight === 'allergies'} actions={
          patient.allergies.length > 0 && (
            <Button size="sm" variant="ghost" icon={<Volume2 className="size-3.5" />} onClick={() => readAloud(`Documented allergies: ${patient.allergies.map((a) => `${a.substance}, ${a.severity}, reaction ${a.reaction}`).join('. ')}.`)}>
              Read aloud
            </Button>
          )
        }>
          {patient.noKnownDrugAllergies ? (
            <p className="text-sm text-ink">No known drug allergies <span className="text-ink-muted">(explicitly documented)</span></p>
          ) : patient.allergies.length === 0 ? (
            <p className="text-sm italic text-ink-faint">Allergy status not documented</p>
          ) : (
            <ul className="space-y-2">
              {patient.allergies.map((a) => (
                <li key={a.id} className={clsx('rounded-lg border px-3 py-2', a.severity === 'Severe' ? 'border-danger/50 bg-danger/10' : 'border-line bg-surface-2')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.substance}</span>
                    <Badge tone={a.severity === 'Severe' ? 'danger' : a.severity === 'Moderate' ? 'warn' : 'neutral'}>{a.severity}</Badge>
                    <Badge tone="neutral">{a.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    Reaction: <span className="text-ink">{a.reaction}</span>
                    {a.substanceClass && <> · Class: {a.substanceClass}</>}
                  </p>
                  <p className="text-xs text-ink-faint">
                    Recorded {fmtDate(a.recordedAt)} · {a.source}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Current medications">
          {meds.length === 0 ? (
            <p className="text-sm text-ink-muted">No active medications documented.</p>
          ) : (
            <ul className="divide-y divide-line">
              {meds.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-ink">
                    {m.name} <span className="font-normal text-ink-muted">· {m.medicationClass ?? 'Class not documented'}</span>
                  </span>
                  <span className="text-ink-muted">
                    <NotDocumented value={m.dose} /> · <NotDocumented value={m.route} /> · <NotDocumented value={m.frequency} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Relevant history">
          {patient.history.length === 0 ? (
            <p className="text-sm italic text-ink-faint">Not documented</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {patient.history.map((h) => (
                <li key={h.condition}>
                  {h.condition}
                  {h.since && <span className="text-ink-muted"> · since {h.since}</span>}
                  {h.notes && <span className="text-ink-faint"> · {h.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Personal information">
          <KeyValue
            cols={1}
            items={[
              { k: 'Patient ID', v: <span className="font-mono">{patient.id}</span> },
              { k: 'Date of birth', v: `${fmtDate(patient.dateOfBirth)} (age ${ageFromDob(patient.dateOfBirth)})` },
              { k: 'Gender · blood group', v: `${patient.gender} · ${patient.bloodGroup}` },
              { k: 'Phone (fictional)', v: patient.phone },
              { k: 'Email (fictional)', v: patient.email },
              { k: 'Address (fictional)', v: `${patient.address.line1}, ${patient.address.city}, ${patient.address.region}` },
            ]}
          />
        </Section>
        <Section title="Latest vitals">
          {v ? (
            <KeyValue
              items={[
                { k: 'Blood pressure', v: bp(v) ? `${bp(v)} mmHg` : <NotDocumented value={null} /> },
                { k: 'Heart rate', v: v.heartRate !== null ? `${v.heartRate} bpm` : <NotDocumented value={null} /> },
                { k: 'Temperature', v: v.temperatureC !== null ? `${v.temperatureC.toFixed(1)} °C` : <NotDocumented value={null} /> },
                { k: 'SpO₂', v: v.spo2 !== null ? `${v.spo2}%` : <NotDocumented value={null} /> },
              ]}
            />
          ) : (
            <p className="text-sm italic text-ink-faint">No vitals documented</p>
          )}
          {v && <p className="mt-2 text-xs text-ink-faint">Recorded {fmtDateTime(v.recordedAt)} · {v.source}</p>}
        </Section>
        <Section title="Documentation">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={patient.documentationStatus === 'Complete' ? 'ok' : 'warn'}>{patient.documentationStatus}</Badge>
            <span className="text-xs text-ink-faint">Updated {fmtDateTime(patient.updatedAt)}</span>
          </div>
          {patient.missingInformationFlags.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-warn">
              {patient.missingInformationFlags.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          )}
          {pending.length > 0 && <p className="mt-2 text-xs text-ink-muted">{pending.length} visit note(s) pending review.</p>}
        </Section>
      </div>
    </div>
  )
}

function VitalsTab({ patient }: { patient: Patient }) {
  const rows = [...patient.vitals].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  return (
    <Section title={<span className="flex items-center gap-2"><HeartPulse className="size-4 text-cyan" /> Vital signs</span>}>
      {rows.length === 0 ? (
        <EmptyState title="No vitals documented" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr className="border-b border-line">
                {['Recorded', 'BP (mmHg)', 'HR (bpm)', 'Temp (°C)', 'RR (/min)', 'SpO₂ (%)', 'Source'].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink-muted">{fmtDateTime(v.recordedAt)}</td>
                  <td className="px-3 py-2"><NotDocumented value={bp(v)} /></td>
                  <td className="px-3 py-2"><NotDocumented value={v.heartRate} /></td>
                  <td className="px-3 py-2"><NotDocumented value={v.temperatureC?.toFixed(1)} /></td>
                  <td className="px-3 py-2"><NotDocumented value={v.respiratoryRate} /></td>
                  <td className="px-3 py-2"><NotDocumented value={v.spo2} /></td>
                  <td className="px-3 py-2 text-xs text-ink-faint">{v.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

const FLAG_TONE = { Normal: 'ok', High: 'warn', Low: 'warn', Critical: 'danger', Pending: 'neutral' } as const

function LabsTab({ patient }: { patient: Patient }) {
  return (
    <Section title={<span className="flex items-center gap-2"><FlaskConical className="size-4 text-cyan" /> Laboratory results</span>}>
      {patient.labResults.length === 0 ? (
        <EmptyState title="No laboratory results documented" body="No labs are recorded for this synthetic patient." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr className="border-b border-line">
                {['Test', 'Result', 'Unit', 'Reference range', 'Flag', 'Status', 'Collected'].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patient.labResults.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{l.name}</td>
                  <td className="px-3 py-2 tabular-nums">{l.value ?? <span className="italic text-ink-faint">Pending</span>}</td>
                  <td className="px-3 py-2 text-ink-muted">{l.unit || '—'}</td>
                  <td className="px-3 py-2 text-ink-muted">{l.referenceRange}</td>
                  <td className="px-3 py-2"><Badge tone={FLAG_TONE[l.flag]}>{l.flag}</Badge></td>
                  <td className="px-3 py-2 text-ink-muted">{l.status}</td>
                  <td className="px-3 py-2 text-xs text-ink-faint">{fmtDateTime(l.collectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function MedsTab({ patient }: { patient: Patient }) {
  const snap = useSnap()
  const meds = snap.medications.filter((m) => m.patientId === patient.id)
  const current = meds.filter((m) => m.status === 'Active' || m.status === 'On hold')
  const history = meds.filter((m) => !(m.status === 'Active' || m.status === 'On hold'))
  const effects = snap.effects.filter((e) => e.patientId === patient.id)
  const table = (rows: typeof meds) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-line">
            {['Medication', 'Dose', 'Route', 'Frequency', 'Status', 'Indication', 'Source', 'Flags'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-line align-top last:border-0">
              <td className="px-3 py-2">
                <span className="font-medium text-ink">{m.name}</span>
                <span className="block text-xs text-ink-faint">{m.medicationClass ?? 'Class not documented'}</span>
              </td>
              <td className="px-3 py-2"><NotDocumented value={m.dose} /></td>
              <td className="px-3 py-2"><NotDocumented value={m.route} /></td>
              <td className="px-3 py-2"><NotDocumented value={m.frequency} /></td>
              <td className="px-3 py-2"><Badge tone={m.status === 'Active' ? 'teal' : 'neutral'}>{m.status}</Badge></td>
              <td className="px-3 py-2 text-ink-muted"><NotDocumented value={m.indication} /></td>
              <td className="px-3 py-2 text-xs text-ink-faint">{m.source}</td>
              <td className="px-3 py-2">{m.safetyFlags.map((f) => <Badge key={f} tone="warn" className="mb-1 whitespace-normal">{f}</Badge>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  return (
    <>
      <Section title={<span className="flex items-center gap-2"><Pill className="size-4 text-cyan" /> Current medications</span>}>
        {current.length ? table(current) : <EmptyState title="No current medications documented" />}
      </Section>
      <Section title="Medication history">{history.length ? table(history) : <EmptyState title="No historical medications documented" />}</Section>
      <Section title="Documented medication effects">
        <EffectsTable effects={effects} />
      </Section>
    </>
  )
}

function ImagingTab({ patient }: { patient: Patient }) {
  return (
    <>
      <Section title="Injuries">
        {patient.injuries.length === 0 ? (
          <p className="text-sm italic text-ink-faint">No injury documented</p>
        ) : (
          <ul className="space-y-2">
            {patient.injuries.map((i) => (
              <li key={i.id} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{i.anatomicalArea}</span>
                  <Badge tone="neutral">Severity: {i.severity}</Badge>
                  <Badge tone={i.xrayStatus === 'Completed' ? 'teal' : 'warn'}>X-ray: {i.xrayStatus}</Badge>
                  <Badge tone={i.reviewStatus === 'Reviewed by clinician' ? 'ok' : 'warn'}>{i.reviewStatus}</Badge>
                </div>
                <p className="mt-1 text-ink-muted">{i.description}</p>
                <p className="text-xs text-ink-faint">Reported {fmtDate(i.dateReported)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={<span className="flex items-center gap-2"><ScanLine className="size-4 text-cyan" /> Imaging</span>}>
        {patient.imaging.length === 0 ? (
          <p className="text-sm italic text-ink-faint">No imaging documented</p>
        ) : (
          <ul className="space-y-2">
            {patient.imaging.map((m) => (
              <li key={m.id} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    {m.modality} · {m.bodyArea}
                  </span>
                  <Badge tone={m.status === 'Completed' ? 'teal' : 'warn'}>{m.status}</Badge>
                  <Badge tone={m.reviewStatus === 'Reviewed by clinician' ? 'ok' : 'warn'}>{m.reviewStatus}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {m.requestSource} · requested {fmtDateTime(m.requestedAt)} · reported {fmtDateTime(m.reportedAt)}
                </p>
                {m.report && <p className="mt-2 rounded border border-line bg-canvas px-2 py-1.5 text-ink">{m.report}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-faint">Imaging status reflects documented, clinician-entered decisions in the synthetic scenario — never an AI decision.</p>
      </Section>
    </>
  )
}

function AdmissionTab({ patient, onIntent }: { patient: Patient; onIntent: (i: AllocationIntent) => void }) {
  const snap = useSnap()
  const all = useMemo(() => snap.admissions.filter((a) => a.patientId === patient.id).sort((a, b) => b.admittedAt.localeCompare(a.admittedAt)), [snap.admissions, patient.id])
  const active = all.find(isActive)
  const roomOf = (id: string) => snap.rooms.find((r) => r.id === id)
  return (
    <>
      <Section
        title={<span className="flex items-center gap-2"><BedDouble className="size-4 text-cyan" /> Current admission</span>}
        actions={
          active ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onIntent({ kind: 'transfer', admissionId: active.id })}>Transfer</Button>
              <Button size="sm" variant="danger" onClick={() => onIntent({ kind: 'discharge', admissionId: active.id })}>Discharge</Button>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => onIntent({ kind: 'admit', patientId: patient.id })}>Assign to room</Button>
          )
        }
      >
        {active ? (
          <KeyValue
            items={[
              { k: 'Admission ID', v: <span className="font-mono">{active.id}</span> },
              { k: 'Status', v: active.status },
              { k: 'Room · bed', v: `${roomOf(active.roomId)?.roomNumber} · ${active.bedId} (${roomOf(active.roomId)?.ward})` },
              { k: 'Admitted', v: fmtDateTime(active.admittedAt) },
              { k: 'Documented risk category', v: active.riskCategory },
              { k: 'Emergency (documented)', v: active.emergency ? 'Yes' : 'No' },
              { k: 'Responsible clinician', v: <NotDocumented value={active.responsibleClinician} /> },
              { k: 'Notes', v: active.notes || <NotDocumented value={null} /> },
            ]}
          />
        ) : (
          <EmptyState title="No active admission" body="This synthetic patient is not currently admitted." />
        )}
      </Section>
      <Section title="Admission & assignment history">
        {all.length === 0 ? (
          <p className="text-sm text-ink-muted">No admissions recorded.</p>
        ) : (
          <ul className="space-y-3">
            {all.map((a) => (
              <li key={a.id} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                <p className="font-medium text-ink">
                  {a.id} · {a.status} · {fmtDateTime(a.admittedAt)}
                  {a.dischargedAt && ` → ${fmtDateTime(a.dischargedAt)}`}
                </p>
                <ol className="mt-1 space-y-0.5 text-xs text-ink-muted">
                  {a.assignmentHistory.map((h, i) => (
                    <li key={i}>
                      {fmtDateTime(h.at)} · {h.action} {h.fromBedId ? `from ${h.fromBedId} ` : ''}
                      {h.toBedId ? `to ${h.toBedId} ` : ''}· {h.reason} · by {h.by}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
