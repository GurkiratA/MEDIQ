/**
 * Report bodies for floating panels. Everything shown comes straight from the
 * synthetic record; missing values render as "Not documented" and nothing is
 * inferred. Safety warnings and review status come first, never last.
 */
import { clsx } from 'clsx'
import { AlertOctagon, AlertTriangle, ShieldCheck } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { Badge, NotDocumented, type Tone } from '../components/ui'
import type { Patient, Visit } from '../db/schema'
import type { Snapshot } from '../db/database'
import { bp, fmtDate, fmtDateTime, latestVitals } from '../lib/format'
import { latestVisit, soapSections } from './reportData'
import type { ReportKind } from './reportKinds'

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rp-block">
      <header className="rp-block-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  )
}

function Empty({ children = 'Not documented' }: { children?: ReactNode }) {
  return <p className="text-sm italic text-ink-faint">{children}</p>
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  return (
    <div className="rp-table-wrap">
      <table className="rp-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={clsx(numeric.includes(i) && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={clsx(numeric.includes(j) && 'text-right tabular-nums')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FLAG_TONE: Record<string, Tone> = { Normal: 'ok', High: 'warn', Low: 'warn', Critical: 'danger', Pending: 'neutral' }

function SafetyBanner({ patient, snap }: { patient: Patient; snap: Snapshot }) {
  const severe = patient.allergies.filter((a) => a.severity === 'Severe' && a.status === 'Active')
  const medFlags = snap.medications.filter((m) => m.patientId === patient.id).flatMap((m) => m.safetyFlags.map((f) => `${m.name}: ${f}`))
  const effectAlerts = snap.effects.filter((e) => e.patientId === patient.id && e.relatedAlert && e.reviewStatus !== 'Reviewed by clinician').map((e) => e.relatedAlert!)
  if (!severe.length && !medFlags.length && !effectAlerts.length) return null
  return (
    <div className="space-y-2">
      {severe.length > 0 && (
        <div role="alert" className="rp-alert rp-alert-danger">
          <AlertOctagon className="size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Documented severe allergy</p>
            <p>{severe.map((a) => `${a.substance} — ${a.reaction}`).join('; ')}</p>
          </div>
        </div>
      )}
      {[...medFlags, ...effectAlerts].length > 0 && (
        <div className="rp-alert rp-alert-warn">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Flagged for clinician review</p>
            <ul className="mt-0.5 space-y-0.5">
              {[...new Set([...medFlags, ...effectAlerts])].map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Allergies({ patient }: { patient: Patient }) {
  if (patient.noKnownDrugAllergies) return <p className="text-sm">No known drug allergies <span className="text-ink-faint">(documented)</span></p>
  if (!patient.allergies.length) return <Empty>Allergy status not documented</Empty>
  return (
    <Table
      head={['Substance', 'Reaction', 'Severity', 'Status']}
      rows={patient.allergies.map((a) => [
        <span className="font-medium text-ink">{a.substance}</span>,
        a.reaction,
        <Badge tone={a.severity === 'Severe' ? 'danger' : a.severity === 'Moderate' ? 'warn' : 'neutral'}>{a.severity}</Badge>,
        a.status,
      ])}
    />
  )
}

function Vitals({ patient, all }: { patient: Patient; all?: boolean }) {
  if (all) {
    const rows = [...patient.vitals].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    if (!rows.length) return <Empty>No vitals documented</Empty>
    return (
      <Table
        head={['Recorded', 'BP', 'HR', 'Temp °C', 'RR', 'SpO₂ %']}
        numeric={[1, 2, 3, 4, 5]}
        rows={rows.map((v) => [fmtDateTime(v.recordedAt), <NotDocumented value={bp(v)} />, <NotDocumented value={v.heartRate} />, <NotDocumented value={v.temperatureC?.toFixed(1)} />, <NotDocumented value={v.respiratoryRate} />, <NotDocumented value={v.spo2} />])}
      />
    )
  }
  const v = latestVitals(patient)
  if (!v) return <Empty>No vitals documented</Empty>
  const tiles: [string, ReactNode, string][] = [
    ['BP', bp(v), 'mmHg'],
    ['HR', v.heartRate, 'bpm'],
    ['Temp', v.temperatureC?.toFixed(1) ?? null, '°C'],
    ['RR', v.respiratoryRate, '/min'],
    ['SpO₂', v.spo2, '%'],
  ]
  return (
    <>
      <div className="rp-vitals">
        {tiles.map(([k, val, unit]) => (
          <div key={k} className="rp-vital">
            <span className="rp-vital-k">{k}</span>
            <span className="rp-vital-v">{val ?? <span className="text-sm italic text-ink-faint">—</span>}</span>
            {val !== null && val !== undefined && <span className="rp-vital-u">{unit}</span>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Recorded {fmtDateTime(v.recordedAt)} · {v.source}
      </p>
    </>
  )
}

function MedTable({ patient, snap, which }: { patient: Patient; snap: Snapshot; which: 'current' | 'history' }) {
  const meds = snap.medications.filter((m) => m.patientId === patient.id && ((m.status === 'Active' || m.status === 'On hold') === (which === 'current')))
  if (!meds.length) return <Empty>{which === 'current' ? 'No current medications documented' : 'No historical medications documented'}</Empty>
  return (
    <Table
      head={['Medication', 'Dose', 'Route', 'Frequency', 'Status']}
      rows={meds.map((m) => [
        <span>
          <span className="font-medium text-ink">{m.name}</span>
          <span className="block text-xs text-ink-faint">{m.medicationClass ?? 'Class not documented'}</span>
        </span>,
        <NotDocumented value={m.dose} />,
        <NotDocumented value={m.route} />,
        <NotDocumented value={m.frequency} />,
        <Badge tone={m.status === 'Active' ? 'teal' : 'neutral'}>{m.status}</Badge>,
      ])}
    />
  )
}

function Labs({ patient, abnormalOnly }: { patient: Patient; abnormalOnly?: boolean }) {
  const rows = patient.labResults.filter((l) => !abnormalOnly || l.flag !== 'Normal')
  if (!rows.length) return <Empty>{abnormalOnly ? 'No abnormal or pending results documented' : 'No laboratory results documented'}</Empty>
  return (
    <Table
      head={['Test', 'Result', 'Reference', 'Flag', 'Collected']}
      numeric={[1]}
      rows={rows.map((l) => [
        <span className="font-medium text-ink">{l.name}</span>,
        l.value === null ? <span className="italic text-ink-faint">Pending</span> : `${l.value}${l.unit ? ` ${l.unit}` : ''}`,
        <span className="text-ink-muted">{l.referenceRange}</span>,
        <Badge tone={FLAG_TONE[l.flag]}>{l.flag}</Badge>,
        <span className="text-xs text-ink-faint">{fmtDate(l.collectedAt)}</span>,
      ])}
    />
  )
}

function VisitBody({ visit }: { visit: Visit }) {
  const confirmed = visit.reviewStatus === 'Saved (clinician-confirmed)'
  const soap = soapSections(visit.finalNote)
  return (
    <>
      <div className="rp-meta">
        <span>{visit.type}</span>
        <span>{fmtDateTime(visit.visitAt)}</span>
        <span>{visit.clinicianName ?? 'Clinician not documented'}</span>
        {confirmed ? (
          <Badge tone="ok" icon={<ShieldCheck className="size-3" />}>
            Clinician-confirmed
          </Badge>
        ) : (
          <Badge tone="warn">{visit.reviewStatus}</Badge>
        )}
      </div>
      {!confirmed && (
        <div className="rp-alert rp-alert-warn">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <p>Not yet confirmed by a clinician. Do not rely on this note until it is reviewed.</p>
        </div>
      )}
      <Block title="Note">
        {soap ? (
          <dl className="rp-soap">
            {soap.map((s, i) => (
              <div key={i}>
                <dt>{s.label}</dt>
                <dd>{s.body}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{visit.finalNote}</p>
        )}
      </Block>
      {visit.safetyFindings.length > 0 && (
        <Block title="Safety findings acknowledged at save">
          <ul className="space-y-1.5">
            {visit.safetyFindings.map((f) => (
              <li key={f.title} className="rp-alert rp-alert-danger">
                <AlertOctagon className="size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p>{f.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}
      {visit.missingInformation.length > 0 && (
        <Block title="Missing information">
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-warn">
            {visit.missingInformation.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Block>
      )}
      <p className="text-xs text-ink-faint">
        Provenance: {visit.provenance.documentation === 'seed' ? 'synthetic seed record' : `draft by ${visit.provenance.documentation}${visit.provenance.audit ? `, audit by ${visit.provenance.audit}` : ''}`}
        {visit.saveConfirmedAt && ` · confirmed ${fmtDateTime(visit.saveConfirmedAt)}`}
      </p>
    </>
  )
}

export const ReportBody = memo(function ReportBody({ kind, patient, snap }: { kind: ReportKind; patient: Patient; snap: Snapshot }) {
  switch (kind) {
    case 'summary': {
      const pending = snap.visits.filter((v) => v.patientId === patient.id && v.reviewStatus === 'Pending review').length
      return (
        <>
          <SafetyBanner patient={patient} snap={snap} />
          <Block title="Allergies">
            <Allergies patient={patient} />
          </Block>
          <Block title="Latest vitals">
            <Vitals patient={patient} />
          </Block>
          <Block title="Active medications">
            <MedTable patient={patient} snap={snap} which="current" />
          </Block>
          <Block title="History">
            {patient.history.length ? (
              <ul className="rp-list">
                {patient.history.map((h) => (
                  <li key={h.condition}>
                    <span className="text-ink">{h.condition}</span>
                    {h.since && <span className="text-ink-faint"> · since {h.since}</span>}
                    {h.notes && <span className="block text-xs text-ink-muted">{h.notes}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </Block>
          <Block title="Abnormal / pending labs">
            <Labs patient={patient} abnormalOnly />
          </Block>
          <Block title="Documentation" aside={<Badge tone={patient.documentationStatus === 'Complete' ? 'ok' : 'warn'}>{patient.documentationStatus}</Badge>}>
            {patient.missingInformationFlags.length ? (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-warn">
                {patient.missingInformationFlags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No missing-information flags.</p>
            )}
            {pending > 0 && <p className="mt-1 text-xs text-warn">{pending} visit note(s) pending review.</p>}
          </Block>
        </>
      )
    }
    case 'visit': {
      const v = latestVisit(snap, patient.id)
      return v ? <VisitBody visit={v} /> : <Empty>No visit notes recorded for this patient.</Empty>
    }
    case 'medications': {
      const effects = snap.effects.filter((e) => e.patientId === patient.id)
      return (
        <>
          <SafetyBanner patient={patient} snap={snap} />
          <Block title="Current">
            <MedTable patient={patient} snap={snap} which="current" />
          </Block>
          <Block title="History">
            <MedTable patient={patient} snap={snap} which="history" />
          </Block>
          <Block title="Documented effects">
            {effects.length ? (
              <Table
                head={['Medication', 'Effect', 'Severity', 'Review']}
                rows={effects.map((e) => [
                  <span className="font-medium text-ink">{snap.medications.find((m) => m.id === e.medicationId)?.name ?? '—'}</span>,
                  <span>
                    {e.effect}
                    <span className="block text-xs text-ink-faint">{e.category}</span>
                  </span>,
                  e.severity,
                  <Badge tone={e.reviewStatus === 'Reviewed by clinician' ? 'ok' : 'warn'}>{e.reviewStatus}</Badge>,
                ])}
              />
            ) : (
              <Empty>No medication effects documented</Empty>
            )}
          </Block>
        </>
      )
    }
    case 'labs':
      return (
        <Block title="All results">
          <Labs patient={patient} />
        </Block>
      )
    case 'vitals':
      return (
        <>
          <Block title="Latest">
            <Vitals patient={patient} />
          </Block>
          <Block title="All observations">
            <Vitals patient={patient} all />
          </Block>
        </>
      )
  }
})
