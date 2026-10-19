import { clsx } from 'clsx'
import { AlertOctagon, AlertTriangle, ArrowRight, BedDouble, BrainCircuit, ClipboardList, DoorOpen, Hand, Mic, Users } from 'lucide-react'
import { useMemo } from 'react'
import { StatTile } from '../components/display'
import { Badge, SyntheticTag } from '../components/ui'
import { activeAdmissionFor, isActive, roomOccupancy } from '../db/allocation'
import type { Patient } from '../db/schema'
import { useGestures } from '../gestures/GestureContext'
import { VOICE_STATUS } from '../layout/TopBar'
import { ageFromDob, bp, fmtDateTime, latestVitals } from '../lib/format'
import { ReportLaunchers } from '../reports/ReportLaunchers'
import { useSnap } from '../state/DataContext'
import { useNav } from '../state/NavContext'
import { useProviders } from '../state/ProvidersContext'
import { useVoice } from '../voice/VoiceContext'

function severeAllergies(p: Patient) {
  return p.allergies.filter((a) => a.severity === 'Severe' && a.status === 'Active')
}

function FocusCard({ patient }: { patient: Patient }) {
  const snap = useSnap()
  const nav = useNav()
  const v = latestVitals(patient)
  const adm = activeAdmissionFor(patient.id, snap.admissions)
  const room = adm && snap.rooms.find((r) => r.id === adm.roomId)
  const severe = severeAllergies(patient)
  const vitals: [string, string | number | null, string][] = [
    ['BP', bp(v), 'mmHg'],
    ['HR', v?.heartRate ?? null, 'bpm'],
    ['SpO₂', v?.spo2 ?? null, '%'],
    ['Temp', v?.temperatureC?.toFixed(1) ?? null, '°C'],
  ]
  return (
    <section className="card relative overflow-hidden p-5" aria-label="Patient in focus">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-cyan/10 blur-3xl" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">Patient in focus</p>
          <h2 className="mt-1 flex flex-wrap items-baseline gap-x-2.5 text-2xl font-semibold tracking-tight">
            <span className="font-mono text-cyan">{patient.id}</span>
            <span>{patient.fullName}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {ageFromDob(patient.dateOfBirth) ?? '—'} y · {patient.gender} · {patient.bloodGroup} · {patient.currentVisitStatus}
            {room && ` · Room ${room.roomNumber}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyntheticTag />
          <button type="button" onClick={() => nav.navigate({ view: 'patients', patientId: patient.id, patientTab: 'overview' })} className="pill">
            Open record <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>

      {severe.length > 0 && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft">
          <AlertOctagon className="size-4 shrink-0" />
          <span>
            <span className="font-semibold">Severe allergy:</span> {severe.map((a) => `${a.substance} (${a.reaction})`).join('; ')}
          </span>
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {vitals.map(([k, val, unit]) => (
          <div key={k} className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <p className="text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">{k}</p>
            <p className="text-xl font-semibold tabular-nums">
              {val ?? <span className="text-sm font-normal italic text-ink-faint">Not documented</span>}
              {val !== null && <span className="ml-1 text-xs font-normal text-ink-faint">{unit}</span>}
            </p>
          </div>
        ))}
      </div>
      {v && <p className="mt-1.5 text-[11px] text-ink-faint">Vitals recorded {fmtDateTime(v.recordedAt)}</p>}

      <p className="label mt-5">Reports</p>
      <ReportLaunchers patientId={patient.id} className="mt-2" />
    </section>
  )
}

function PatientPicker({ patients }: { patients: Patient[] }) {
  const nav = useNav()
  const snap = useSnap()
  return (
    <section className="card p-5" aria-label="Choose a patient">
      <p className="label">Patient in focus</p>
      <h2 className="mt-1 text-lg font-semibold">Select a patient</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Or say “Open patient 104”.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {patients.map((p) => {
          const adm = activeAdmissionFor(p.id, snap.admissions)
          const room = adm && snap.rooms.find((r) => r.id === adm.roomId)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => nav.navigate({ patientId: p.id })}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-left transition-colors hover:border-cyan/40 hover:bg-surface-2"
              >
                <span className="font-mono text-sm text-cyan">{p.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{p.fullName}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {p.currentVisitStatus}
                    {room ? ` · Room ${room.roomNumber}` : ''}
                  </span>
                </span>
                {severeAllergies(p).length > 0 && <AlertOctagon className="size-4 text-danger" aria-label="Severe allergy documented" />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function StatusRow({ icon, label, value, tone, onClick }: { icon: React.ReactNode; label: string; value: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' | 'cyan'; onClick?: () => void }) {
  const dot = { ok: 'bg-ok', warn: 'bg-warn', neutral: 'bg-ink-faint', danger: 'bg-danger', cyan: 'bg-cyan' }[tone]
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
      <span className="text-ink-faint">{icon}</span>
      <span className="flex-1 text-sm text-ink-muted">{label}</span>
      <span className="flex items-center gap-1.5 text-sm text-ink">
        <span className={clsx('dot', dot)} />
        {value}
      </span>
    </button>
  )
}

export function OverviewView() {
  const snap = useSnap()
  const nav = useNav()
  const prov = useProviders()
  const voice = useVoice()
  const gestures = useGestures()

  const occ = useMemo(() => snap.rooms.map((r) => roomOccupancy(r, snap.admissions)), [snap.rooms, snap.admissions])
  const active = snap.admissions.filter(isActive)
  const available = occ.filter((o) => o.bookable)
  const pending = snap.visits.filter((v) => v.reviewStatus === 'Pending review')
  const focus = nav.patientId ? snap.patients.find((p) => p.id === nav.patientId) : null
  const enrolled = snap.doctors.filter((d) => !d.revokedAt).length

  const alerts = useMemo(() => {
    const out: { key: string; patientId: string; text: string }[] = []
    for (const m of snap.medications) for (const f of m.safetyFlags) out.push({ key: `${m.id}-${f}`, patientId: m.patientId, text: `${m.name}: ${f}` })
    for (const e of snap.effects) if (e.relatedAlert && e.reviewStatus !== 'Reviewed by clinician') out.push({ key: e.id, patientId: e.patientId, text: e.relatedAlert })
    for (const v of snap.visits) for (const f of v.safetyFindings.filter((x) => x.severity === 'critical' || x.severity === 'high')) out.push({ key: `${v.id}-${f.title}`, patientId: v.patientId, text: f.title })
    return out.slice(0, 5)
  }, [snap])

  const vs = VOICE_STATUS[voice.status]
  const local = prov.apiReachable === false || prov.fallbackActive || snap.settings.providerMode === 'local'

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clinical overview</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Synthetic demonstration ward</p>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2">{focus ? <FocusCard patient={focus} /> : <PatientPicker patients={snap.patients} />}</div>

        <div className="space-y-4">
          <section className="card p-3" aria-label="Assistant status">
            <p className="label px-2 pb-1 pt-1">Assistant</p>
            <StatusRow icon={<Mic className="size-4" />} label="Voice" value={enrolled ? vs.label : 'Not enrolled'} tone={voice.status === 'verified' ? 'ok' : enrolled ? 'cyan' : 'neutral'} onClick={() => nav.navigate({ view: enrolled ? 'voice' : 'doctors' })} />
            <StatusRow
              icon={<Hand className="size-4" />}
              label="Hands"
              value={gestures.status === 'off' ? 'Off' : gestures.status === 'tracking' ? 'Tracking' : gestures.status === 'error' ? 'Unavailable' : gestures.status === 'starting' ? 'Starting' : 'No hand'}
              tone={gestures.status === 'tracking' ? 'ok' : gestures.status === 'error' ? 'danger' : gestures.status === 'off' ? 'neutral' : 'cyan'}
              onClick={() => (gestures.status === 'off' || gestures.status === 'error' ? void gestures.enable() : undefined)}
            />
            <StatusRow icon={<BrainCircuit className="size-4" />} label="AI drafting" value={local ? 'Local rules' : 'Live providers'} tone={local ? 'warn' : 'ok'} onClick={() => nav.navigate({ view: 'ai' })} />
          </section>

          <section className="card p-3" aria-label="Safety flags">
            <p className="label flex items-center justify-between px-2 pb-1 pt-1">
              Safety flags <Badge tone={alerts.length ? 'warn' : 'ok'}>{alerts.length}</Badge>
            </p>
            {alerts.length === 0 ? (
              <p className="px-2 py-2 text-sm text-ink-muted">No open flags.</p>
            ) : (
              <ul>
                {alerts.map((a) => (
                  <li key={a.key}>
                    <button type="button" onClick={() => nav.navigate({ patientId: a.patientId })} className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                      <span className="min-w-0 text-[13px] leading-snug text-ink">
                        {a.text}
                        <span className="block text-[11px] text-ink-faint">Patient {a.patientId} · clinician review required</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Synthetic patients" value={snap.patients.length} icon={<Users className="size-4" />} onClick={() => nav.navigate({ view: 'patients', patientId: null })} />
        <StatTile label="Admissions" value={active.length} icon={<BedDouble className="size-4" />} context={`${active.filter((a) => a.emergency).length} emergency`} onClick={() => nav.navigate({ view: 'rooms', roomsTab: 'admissions' })} />
        <StatTile label="Available rooms" value={available.length} icon={<DoorOpen className="size-4" />} context={`${available.reduce((n, o) => n + o.freeBeds.length, 0)} free beds`} onClick={() => nav.navigate({ view: 'rooms', roomsTab: 'rooms', roomsFilter: 'available' })} />
        <StatTile label="Notes to review" value={pending.length} icon={<ClipboardList className="size-4" />} onClick={() => nav.navigate({ view: 'notes' })} />
      </div>
    </>
  )
}
