/**
 * Room & admission allocation rules. Pure functions over in-memory snapshots,
 * so the same checks run in the UI (to explain a proposed change), in the
 * repository (immediately before committing) and in unit tests.
 *
 * Occupancy is always DERIVED from active admissions — the rooms store never
 * records who is in a bed — so rooms and admissions cannot drift apart.
 */
import type { Admission, Patient, Room, RiskCategory } from './schema'

export interface AllocationContext {
  patients: Patient[]
  rooms: Room[]
  admissions: Admission[]
}

export type OccupancyStatus = 'Vacant' | 'Partially occupied' | 'Full'

export interface RoomOccupancy {
  room: Room
  occupants: Admission[]
  occupied: number
  free: number
  occupancyStatus: OccupancyStatus
  freeBeds: Room['beds']
  /** In service and has at least one free bed. */
  bookable: boolean
}

export interface ProposalChange {
  label: string
  before: string
  after: string
}

export interface Proposal {
  title: string
  target: string
  changes: ProposalChange[]
  warnings: string[]
}

export type PlanResult<T> = { ok: true; value: T; proposal: Proposal } | { ok: false; errors: string[] }

export const isActive = (a: Admission) => a.status !== 'Discharged'

export function activeAdmissionFor(patientId: string, admissions: Admission[]): Admission | undefined {
  return admissions.find((a) => a.patientId === patientId && isActive(a))
}

export function roomOccupancy(room: Room, admissions: Admission[]): RoomOccupancy {
  const occupants = admissions.filter((a) => a.roomId === room.id && isActive(a))
  const takenBeds = new Set(occupants.map((a) => a.bedId))
  const freeBeds = room.beds.filter((b) => !takenBeds.has(b.id))
  const occupied = occupants.length
  return {
    room,
    occupants,
    occupied,
    free: Math.max(0, room.capacity - occupied),
    occupancyStatus: occupied === 0 ? 'Vacant' : occupied >= room.capacity ? 'Full' : 'Partially occupied',
    freeBeds,
    bookable: room.availability === 'In service' && freeBeds.length > 0 && occupied < room.capacity,
  }
}

const roomLabel = (r: Room | undefined) => (r ? `Room ${r.roomNumber} (${r.ward})` : 'Unknown room')
const bedLabel = (r: Room | undefined, bedId: string) => {
  const bed = r?.beds.find((b) => b.id === bedId)
  return bed ? `${roomLabel(r)}, bed ${bed.label}` : 'Unknown bed'
}

/**
 * Validates placing a patient in a bed. `movingAdmissionId` is the admission
 * being transferred (it may already hold a bed, which is not a conflict).
 */
export function validatePlacement(
  input: { patientId: string; roomId: string; bedId: string; movingAdmissionId?: string },
  ctx: AllocationContext,
): string[] {
  const errors: string[] = []
  const patient = ctx.patients.find((p) => p.id === input.patientId)
  if (!patient) errors.push(`Patient ${input.patientId} does not exist.`)
  const room = ctx.rooms.find((r) => r.id === input.roomId)
  if (!room) {
    errors.push(`Room ${input.roomId} does not exist.`)
    return errors
  }
  if (!room.beds.some((b) => b.id === input.bedId)) errors.push(`Bed ${input.bedId} is not part of room ${room.roomNumber}.`)
  if (room.availability !== 'In service') errors.push(`Room ${room.roomNumber} is not available (${room.availability}).`)

  const others = ctx.admissions.filter((a) => isActive(a) && a.id !== input.movingAdmissionId)
  const bedHolder = others.find((a) => a.bedId === input.bedId)
  if (bedHolder) errors.push(`Bed ${input.bedId} is already assigned to an active admission (${bedHolder.id}).`)
  const inRoom = others.filter((a) => a.roomId === room.id).length
  if (inRoom + 1 > room.capacity) errors.push(`Room ${room.roomNumber} is at capacity (${room.capacity}).`)
  if (!input.movingAdmissionId) {
    const existing = others.find((a) => a.patientId === input.patientId)
    if (existing) errors.push(`Patient ${input.patientId} already has an active admission (${existing.id}).`)
  }
  return errors
}

export interface AdmissionInput {
  patientId: string
  roomId: string
  bedId: string
  riskCategory: RiskCategory
  emergency: boolean
  notes: string
  responsibleClinician: string | null
}

export function planAdmission(input: AdmissionInput, ctx: AllocationContext, now: string, by: string, newId: string): PlanResult<Admission> {
  const errors = validatePlacement(input, ctx)
  if (errors.length) return { ok: false, errors }
  const room = ctx.rooms.find((r) => r.id === input.roomId)
  const patient = ctx.patients.find((p) => p.id === input.patientId)!
  const admission: Admission = {
    id: newId,
    patientId: input.patientId,
    roomId: input.roomId,
    bedId: input.bedId,
    admittedAt: now,
    dischargedAt: null,
    status: 'Active',
    riskCategory: input.riskCategory,
    emergency: input.emergency,
    notes: input.notes,
    responsibleClinician: input.responsibleClinician,
    assignmentHistory: [{ at: now, action: 'assigned', fromRoomId: null, fromBedId: null, toRoomId: input.roomId, toBedId: input.bedId, by, reason: 'New admission' }],
    updatedAt: now,
  }
  return {
    ok: true,
    value: admission,
    proposal: {
      title: 'Admit patient and assign bed',
      target: `Patient ${patient.id} · ${patient.fullName} (synthetic)`,
      changes: [
        { label: 'Bed', before: 'None', after: bedLabel(room, input.bedId) },
        { label: 'Admission status', before: 'No active admission', after: 'Active' },
        { label: 'Documented risk category', before: '—', after: input.riskCategory },
        { label: 'Emergency (documented)', before: '—', after: input.emergency ? 'Yes' : 'No' },
        { label: 'Visit status', before: patient.currentVisitStatus, after: 'Admitted' },
      ],
      warnings: [],
    },
  }
}

export function planTransfer(
  admissionId: string,
  toRoomId: string,
  toBedId: string,
  reason: string,
  ctx: AllocationContext,
  now: string,
  by: string,
): PlanResult<Admission> {
  const adm = ctx.admissions.find((a) => a.id === admissionId)
  if (!adm) return { ok: false, errors: [`Admission ${admissionId} does not exist.`] }
  if (!isActive(adm)) return { ok: false, errors: ['Only active admissions can be transferred.'] }
  if (adm.bedId === toBedId) return { ok: false, errors: ['The patient is already in that bed.'] }
  const errors = validatePlacement({ patientId: adm.patientId, roomId: toRoomId, bedId: toBedId, movingAdmissionId: adm.id }, ctx)
  if (errors.length) return { ok: false, errors }
  const from = ctx.rooms.find((r) => r.id === adm.roomId)
  const to = ctx.rooms.find((r) => r.id === toRoomId)
  const patient = ctx.patients.find((p) => p.id === adm.patientId)
  const updated: Admission = {
    ...adm,
    roomId: toRoomId,
    bedId: toBedId,
    assignmentHistory: [
      ...adm.assignmentHistory,
      { at: now, action: 'transferred', fromRoomId: adm.roomId, fromBedId: adm.bedId, toRoomId, toBedId, by, reason: reason || 'Not documented' },
    ],
    updatedAt: now,
  }
  return {
    ok: true,
    value: updated,
    proposal: {
      title: 'Transfer patient to another bed',
      target: `Patient ${adm.patientId} · ${patient?.fullName ?? 'Unknown'} (synthetic) — admission ${adm.id}`,
      changes: [
        { label: 'Bed', before: bedLabel(from, adm.bedId), after: bedLabel(to, toBedId) },
        { label: 'Reason', before: '—', after: reason || 'Not documented' },
      ],
      warnings: to && from && to.type !== from.type ? [`Room type changes from ${from.type} to ${to.type}.`] : [],
    },
  }
}

export function planDischarge(admissionId: string, ctx: AllocationContext, now: string, by: string): PlanResult<Admission> {
  const adm = ctx.admissions.find((a) => a.id === admissionId)
  if (!adm) return { ok: false, errors: [`Admission ${admissionId} does not exist.`] }
  if (!isActive(adm)) return { ok: false, errors: ['This admission is already discharged.'] }
  const room = ctx.rooms.find((r) => r.id === adm.roomId)
  const patient = ctx.patients.find((p) => p.id === adm.patientId)
  const updated: Admission = {
    ...adm,
    status: 'Discharged',
    dischargedAt: now,
    assignmentHistory: [
      ...adm.assignmentHistory,
      { at: now, action: 'released', fromRoomId: adm.roomId, fromBedId: adm.bedId, toRoomId: null, toBedId: null, by, reason: 'Discharged' },
    ],
    updatedAt: now,
  }
  return {
    ok: true,
    value: updated,
    proposal: {
      title: 'Mark admission discharged and release bed',
      target: `Patient ${adm.patientId} · ${patient?.fullName ?? 'Unknown'} (synthetic) — admission ${adm.id}`,
      changes: [
        { label: 'Admission status', before: adm.status, after: 'Discharged' },
        { label: 'Bed', before: bedLabel(room, adm.bedId), after: 'Released (available)' },
        { label: 'Visit status', before: patient?.currentVisitStatus ?? '—', after: 'Discharged' },
      ],
      warnings: ['This records an administrative status change in the synthetic demo only.'],
    },
  }
}

/** Integrity checks across patients, rooms and admissions. Returns human-readable problems. */
export function checkConsistency(ctx: AllocationContext): string[] {
  const problems: string[] = []
  const active = ctx.admissions.filter(isActive)
  const bedSeen = new Map<string, string>()
  const patientSeen = new Map<string, string>()
  for (const a of active) {
    if (!ctx.patients.some((p) => p.id === a.patientId)) problems.push(`${a.id}: patient ${a.patientId} missing`)
    const room = ctx.rooms.find((r) => r.id === a.roomId)
    if (!room) problems.push(`${a.id}: room ${a.roomId} missing`)
    else if (!room.beds.some((b) => b.id === a.bedId)) problems.push(`${a.id}: bed ${a.bedId} not in room ${room.id}`)
    if (bedSeen.has(a.bedId)) problems.push(`Bed ${a.bedId} double-assigned (${bedSeen.get(a.bedId)}, ${a.id})`)
    bedSeen.set(a.bedId, a.id)
    if (patientSeen.has(a.patientId)) problems.push(`Patient ${a.patientId} has multiple active admissions`)
    patientSeen.set(a.patientId, a.id)
  }
  for (const room of ctx.rooms) {
    const n = active.filter((a) => a.roomId === room.id).length
    if (n > room.capacity) problems.push(`Room ${room.id} over capacity (${n}/${room.capacity})`)
    if (room.capacity !== room.beds.length) problems.push(`Room ${room.id} capacity does not match bed count`)
  }
  for (const p of ctx.patients) {
    const hasActive = active.some((a) => a.patientId === p.id)
    if (p.currentVisitStatus === 'Admitted' && !hasActive) problems.push(`Patient ${p.id} marked Admitted without an active admission`)
    if (hasActive && p.currentVisitStatus !== 'Admitted') problems.push(`Patient ${p.id} has an active admission but status is ${p.currentVisitStatus}`)
  }
  return problems
}
