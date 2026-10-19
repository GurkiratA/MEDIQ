import { Activity, AlertTriangle, BedDouble, BrainCircuit, ClipboardList, DoorOpen, FileText, ShieldCheck, Users } from 'lucide-react'
import { useMemo } from 'react'
import { providerLabel } from '../ai/client'
import { Meter, StatTile } from '../components/display'
import { Badge, Card, CardHeader, EmptyState, PageHeader, SyntheticTag } from '../components/ui'
import { isActive, roomOccupancy } from '../db/allocation'
import { fmtDateTime, relativeTime } from '../lib/format'
import { useSnap } from '../state/DataContext'
import { useNav } from '../state/NavContext'
import { useProviders } from '../state/ProvidersContext'

export function OverviewView() {
  const snap = useSnap()
  const nav = useNav()
  const prov = useProviders()

  const occ = useMemo(() => snap.rooms.map((r) => roomOccupancy(r, snap.admissions)), [snap.rooms, snap.admissions])
  const active = snap.admissions.filter(isActive)
  const available = occ.filter((o) => o.bookable)
  const occupied = occ.filter((o) => o.occupied > 0)
  const pending = snap.visits.filter((v) => v.reviewStatus === 'Pending review')
  const patientName = (id: string) => snap.patients.find((p) => p.id === id)?.fullName ?? id

  const alerts = useMemo(() => {
    const out: { key: string; patientId: string; text: string; source: string }[] = []
    for (const m of snap.medications) for (const f of m.safetyFlags) out.push({ key: `${m.id}-${f}`, patientId: m.patientId, text: `${m.name}: ${f}`, source: 'Medication record' })
    for (const e of snap.effects)
      if (e.relatedAlert && e.reviewStatus !== 'Reviewed by clinician') out.push({ key: e.id, patientId: e.patientId, text: e.relatedAlert, source: e.category })
    for (const v of snap.visits) for (const f of v.safetyFindings.filter((x) => x.severity === 'critical' || x.severity === 'high')) out.push({ key: `${v.id}-${f.title}`, patientId: v.patientId, text: f.title, source: `Saved visit ${v.id}` })
    return out.slice(0, 6)
  }, [snap])

  const security = snap.activity.filter((a) => a.category === 'security').slice(0, 6)
  const allocation = snap.activity.filter((a) => a.category === 'allocation').slice(0, 5)
  const recentPatients = [...snap.patients].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <>
      <PageHeader
        title="Clinical overview"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Synthetic demonstration ward · <SyntheticTag />
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Synthetic patients" value={snap.patients.length} icon={<Users className="size-4" />} context="IDs 104–108" onClick={() => nav.navigate({ view: 'patients', patientId: null })} />
        <StatTile label="Current admissions" value={active.length} icon={<ClipboardList className="size-4" />} context={`${active.filter((a) => a.emergency).length} documented emergency`} onClick={() => nav.navigate({ view: 'rooms', roomsTab: 'admissions' })} />
        <StatTile label="Available rooms" value={available.length} icon={<DoorOpen className="size-4" />} context={`${available.reduce((n, o) => n + o.freeBeds.length, 0)} free beds in service`} onClick={() => nav.navigate({ view: 'rooms', roomsTab: 'rooms', roomsFilter: 'available' })} />
        <StatTile label="Occupied rooms" value={occupied.length} icon={<BedDouble className="size-4" />} context={`of ${snap.rooms.length} rooms`} onClick={() => nav.navigate({ view: 'rooms', roomsTab: 'rooms', roomsFilter: 'occupied' })} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader title="AI provider status" icon={<BrainCircuit className="size-4" />} subtitle="What will run for the next generated note" actions={
            <button type="button" className="text-xs text-cyan hover:underline" onClick={() => nav.navigate({ view: 'ai' })}>
              Settings
            </button>
          } />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <p className="label">Mode</p>
              <p className="mt-1 text-sm text-ink">{{ hybrid: 'Hybrid Consensus', hermes: 'Hermes 3 / DigitalOcean', gemini: 'Gemini', local: 'Local Demo Fallback' }[snap.settings.providerMode]}</p>
            </div>
            <div>
              <p className="label">Model A · documentation</p>
              <p className="mt-1 text-sm text-ink">{providerLabel(prov.effective.documentation)}</p>
            </div>
            <div>
              <p className="label">Model B · safety audit</p>
              <p className="mt-1 text-sm text-ink">{prov.effective.audit === 'gemini' ? 'Google Gemini' : 'Local deterministic rules only'}</p>
            </div>
            <div className="sm:col-span-3">
              {prov.apiReachable === false ? (
                <Badge tone="warn" className="whitespace-normal" icon={<AlertTriangle className="size-3" />}>Local API unreachable — all AI features use labelled local fallbacks</Badge>
              ) : prov.fallbackActive || snap.settings.providerMode === 'local' ? (
                <Badge tone="warn" className="whitespace-normal" icon={<AlertTriangle className="size-3" />}>Local fallback active — results will be labelled “Local deterministic”</Badge>
              ) : (
                <Badge tone="ok" className="whitespace-normal" icon={<ShieldCheck className="size-3" />}>Configured providers available</Badge>
              )}
              <span className="ml-2 text-xs text-ink-faint">Local safety rules always run in addition, as an independent baseline.</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Room occupancy" icon={<BedDouble className="size-4" />} subtitle="Derived from active admissions" />
          <ul className="space-y-2.5 p-4">
            {occ.map((o) => (
              <li key={o.room.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
                <span className="font-mono text-ink-muted">{o.room.roomNumber}</span>
                {o.room.availability === 'In service' ? <Meter value={o.occupied} max={o.room.capacity} label={`Room ${o.room.roomNumber} occupancy`} /> : <Badge tone="warn" className="justify-self-start">{o.room.availability}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Recent patient records" icon={<Users className="size-4" />} />
          <ul className="divide-y divide-line">
            {recentPatients.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => nav.navigate({ view: 'patients', patientId: p.id, patientTab: 'overview' })} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-cyan">{p.id}</span> <span className="text-sm text-ink">{p.fullName}</span>
                    <span className="block text-xs text-ink-faint">{p.currentVisitStatus} · updated {relativeTime(p.updatedAt)}</span>
                  </span>
                  <Badge tone={p.documentationStatus === 'Complete' ? 'ok' : 'warn'}>{p.documentationStatus}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Recent visits" icon={<FileText className="size-4" />} subtitle={`${pending.length} pending review`} />
          <ul className="divide-y divide-line">
            {snap.visits.slice(0, 5).map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => nav.navigate({ view: 'patients', patientId: v.patientId, patientTab: 'notes' })} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="text-sm text-ink">{patientName(v.patientId)}</span>
                    <span className="block text-xs text-ink-faint">
                      {v.type} · {fmtDateTime(v.visitAt)}
                    </span>
                  </span>
                  <Badge tone={v.reviewStatus === 'Saved (clinician-confirmed)' ? 'ok' : 'warn'}>{v.reviewStatus === 'Saved (clinician-confirmed)' ? 'Confirmed' : v.reviewStatus}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Medication safety alerts" icon={<AlertTriangle className="size-4" />} subtitle="Flags for qualified clinician review" />
          {alerts.length === 0 ? (
            <EmptyState title="No open medication flags" />
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => nav.navigate({ view: 'medications', medsTab: 'alerts' })} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-surface-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                    <span className="min-w-0 text-sm text-ink">
                      {a.text}
                      <span className="block text-xs text-ink-faint">
                        Patient {a.patientId} · {a.source}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Pending note reviews" icon={<ClipboardList className="size-4" />} />
          {pending.length === 0 ? (
            <EmptyState title="No notes awaiting review" />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((v) => (
                <li key={v.id} className="px-4 py-2.5 text-sm">
                  <button type="button" className="text-left hover:underline" onClick={() => nav.navigate({ view: 'patients', patientId: v.patientId, patientTab: 'notes' })}>
                    {patientName(v.patientId)} — {v.type}
                  </button>
                  <span className="block text-xs text-ink-faint">{v.missingInformation.join(' · ') || 'Awaiting clinician review'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Voice verification activity" icon={<ShieldCheck className="size-4" />} actions={
            <button type="button" className="text-xs text-cyan hover:underline" onClick={() => nav.navigate({ view: 'activity' })}>
              All activity
            </button>
          } />
          {security.length === 0 ? (
            <EmptyState title="No verification attempts yet" body="Enroll the owner, then use push-to-talk — or try Demo Quick-Sim." />
          ) : (
            <ul className="divide-y divide-line">
              {security.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 px-4 py-2.5 text-xs">
                  <span className="text-ink">{e.message}</span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={e.mode === 'simulation' ? 'sim' : 'neutral'}>{e.mode === 'simulation' ? 'Simulation' : 'Live'}</Badge>
                    <span className="text-ink-faint">{relativeTime(e.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Room allocation activity" icon={<Activity className="size-4" />} />
          {allocation.length === 0 ? (
            <EmptyState title="No allocation changes yet" body="Assignments, transfers and discharges appear here after confirmation." />
          ) : (
            <ul className="divide-y divide-line">
              {allocation.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-xs text-ink">
                  {e.message}
                  <span className="block text-ink-faint">{fmtDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
