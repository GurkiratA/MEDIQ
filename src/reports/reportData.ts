import { activeAdmissionFor } from '../db/allocation'
import type { Snapshot } from '../db/database'
import type { Patient, Visit } from '../db/schema'
import { ageFromDob } from '../lib/format'

/** Splits an "S: … / O: … / A: … / P: …" note into labelled sections; any other text is shown verbatim. */
export function soapSections(text: string): { label: string; body: string }[] | null {
  const labels: Record<string, string> = { S: 'Subjective', O: 'Objective', A: 'Assessment', P: 'Plan' }
  const lines = text.split('\n')
  if (!lines.every((l) => !l.trim() || /^[SOAP]:\s/.test(l))) return null
  const out = lines.filter((l) => l.trim()).map((l) => ({ label: labels[l[0]], body: l.slice(2).trim() }))
  return out.length ? out : null
}

export function latestVisit(snap: Snapshot, patientId: string): Visit | null {
  return [...snap.visits].filter((v) => v.patientId === patientId).sort((a, b) => b.visitAt.localeCompare(a.visitAt))[0] ?? null
}

export function patientLine(snap: Snapshot, patient: Patient): string {
  const adm = activeAdmissionFor(patient.id, snap.admissions)
  const room = adm && snap.rooms.find((r) => r.id === adm.roomId)
  return [`${ageFromDob(patient.dateOfBirth) ?? '—'} y`, patient.gender, patient.bloodGroup, patient.currentVisitStatus, room ? `Room ${room.roomNumber}` : null].filter(Boolean).join(' · ')
}
