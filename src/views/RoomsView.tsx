import { clsx } from 'clsx'
import { BedDouble, ClipboardList, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Meter } from '../components/display'
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from '../components/ui'
import { isActive, roomOccupancy } from '../db/allocation'
import { fmtDateTime } from '../lib/format'
import { useSnap } from '../state/DataContext'
import { useNav, type RoomsFilter, type RoomsTab } from '../state/NavContext'
import { AllocationDialogs, type AllocationIntent } from './AllocationDialogs'

export function RoomsView() {
  const snap = useSnap()
  const nav = useNav()
  const [intent, setIntent] = useState<AllocationIntent | null>(null)
  const occ = useMemo(() => snap.rooms.map((r) => roomOccupancy(r, snap.admissions)), [snap.rooms, snap.admissions])
  const filtered = occ.filter((o) => (nav.roomsFilter === 'available' ? o.bookable : nav.roomsFilter === 'occupied' ? o.occupied > 0 : true))
  const patient = (id: string) => snap.patients.find((p) => p.id === id)

  return (
    <>
      <PageHeader
        title="Rooms & Admissions"
        icon={<BedDouble className="size-5" />}
        subtitle="Separate room and admission databases. Occupancy is derived from active admissions; every change needs confirmation."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setIntent({ kind: 'admit' })}>
            Assign patient
          </Button>
        }
      />
      <Tabs<RoomsTab>
        label="Rooms and admissions"
        tabs={[
          { id: 'rooms', label: 'Rooms', count: snap.rooms.length },
          { id: 'admissions', label: 'Admissions', count: snap.admissions.filter(isActive).length },
        ]}
        value={nav.roomsTab}
        onChange={(t) => nav.navigate({ roomsTab: t })}
      />

      {nav.roomsTab === 'rooms' ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Room filter">
            {(['all', 'available', 'occupied'] as RoomsFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={nav.roomsFilter === f}
                onClick={() => nav.navigate({ roomsFilter: f })}
                className={clsx('rounded-full border px-3 py-1 text-xs font-medium capitalize', nav.roomsFilter === f ? 'border-cyan bg-cyan/10 text-cyan-soft' : 'border-line-strong text-ink-muted hover:text-ink')}
              >
                {f === 'all' ? 'All rooms' : f}
              </button>
            ))}
            <span className="text-xs text-ink-faint">
              {filtered.length} shown · {occ.filter((o) => o.bookable).length} available · {occ.filter((o) => o.occupied > 0).length} occupied
            </span>
          </div>
          {filtered.length === 0 ? (
            <Card className="mt-4">
              <EmptyState title="No rooms match this filter" />
            </Card>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((o) => (
                <Card key={o.room.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                    <div>
                      <p className="text-base font-semibold text-ink">Room {o.room.roomNumber}</p>
                      <p className="text-xs text-ink-muted">
                        {o.room.ward} · {o.room.building}, floor {o.room.floor}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={o.room.availability === 'In service' ? (o.occupancyStatus === 'Full' ? 'danger' : o.occupancyStatus === 'Vacant' ? 'ok' : 'warn') : 'neutral'}>
                        {o.room.availability === 'In service' ? o.occupancyStatus : o.room.availability}
                      </Badge>
                      <Badge tone="neutral">{o.room.type}</Badge>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 px-4 py-3">
                    <Meter value={o.occupied} max={o.room.capacity} label={`Room ${o.room.roomNumber} occupancy`} />
                    <ul className="space-y-1.5">
                      {o.room.beds.map((b) => {
                        const a = o.occupants.find((x) => x.bedId === b.id)
                        const p = a && patient(a.patientId)
                        return (
                          <li key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm">
                            <span className="text-ink-muted">Bed {b.label}</span>
                            {a && p ? (
                              <span className="flex min-w-0 items-center gap-1.5">
                                <button type="button" className="truncate text-ink hover:underline" onClick={() => nav.navigate({ view: 'patients', patientId: p.id, patientTab: 'admission' })}>
                                  {p.id} · {p.fullName}
                                </button>
                                {a.emergency && <Badge tone="danger">Emergency</Badge>}
                                <Badge tone={a.riskCategory === 'High' || a.riskCategory === 'Critical' ? 'warn' : 'neutral'}>{a.riskCategory} risk</Badge>
                              </span>
                            ) : (
                              <span className="text-xs text-ok">{o.room.availability === 'In service' ? 'Free' : 'Unavailable'}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {o.room.features.length > 0 && <p className="text-xs text-ink-faint">{o.room.features.join(' · ')}</p>}
                    {o.occupants.length > 0 && (
                      <p className="text-xs text-ink-faint">Assigned since {o.occupants.map((a) => fmtDateTime(a.assignmentHistory.at(-1)?.at ?? a.admittedAt)).join(', ')}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
                    {o.bookable && (
                      <Button size="sm" variant="primary" onClick={() => setIntent({ kind: 'admit', roomId: o.room.id })}>
                        Assign patient here
                      </Button>
                    )}
                    {o.occupants.map((a) => (
                      <span key={a.id} className="flex gap-2">
                        <Button size="sm" onClick={() => setIntent({ kind: 'transfer', admissionId: a.id })}>
                          Transfer {a.patientId}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setIntent({ kind: 'discharge', admissionId: a.id })}>
                          Discharge {a.patientId}
                        </Button>
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <Card className="mt-4">
          {snap.admissions.length === 0 ? (
            <EmptyState icon={<ClipboardList className="size-6" />} title="No admissions" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="text-xs text-ink-muted">
                  <tr className="border-b border-line">
                    {['Admission', 'Patient', 'Room · bed', 'Status', 'Risk (documented)', 'Emergency', 'Admitted', 'Discharged', 'Assignment history'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...snap.admissions]
                    .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.admittedAt.localeCompare(a.admittedAt))
                    .map((a) => {
                      const p = patient(a.patientId)
                      const r = snap.rooms.find((x) => x.id === a.roomId)
                      return (
                        <tr key={a.id} className="border-b border-line align-top last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-ink-muted">{a.id}</td>
                          <td className="px-3 py-2">
                            <button type="button" className="text-ink hover:underline" onClick={() => nav.navigate({ view: 'patients', patientId: a.patientId, patientTab: 'admission' })}>
                              {a.patientId} · {p?.fullName}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{r?.roomNumber} · {a.bedId.split('-').pop()}</td>
                          <td className="px-3 py-2"><Badge tone={isActive(a) ? 'teal' : 'neutral'}>{a.status}</Badge></td>
                          <td className="px-3 py-2">{a.riskCategory}</td>
                          <td className="px-3 py-2">{a.emergency ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2 text-xs text-ink-muted">{fmtDateTime(a.admittedAt)}</td>
                          <td className="px-3 py-2 text-xs text-ink-muted">{fmtDateTime(a.dischargedAt)}</td>
                          <td className="px-3 py-2 text-xs text-ink-faint">
                            {a.assignmentHistory.map((h, i) => (
                              <div key={i}>
                                {h.action}: {h.fromBedId ?? '—'} → {h.toBedId ?? 'released'}
                              </div>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <AllocationDialogs intent={intent} onClose={() => setIntent(null)} />
    </>
  )
}
