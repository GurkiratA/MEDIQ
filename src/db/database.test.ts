import { afterEach, describe, expect, it } from 'vitest'
import { MediqDatabase, ValidationError } from './database'
import { checkConsistency } from './allocation'
import { PatientSchema } from './schema'
import type { Visit } from './schema'

let n = 0
const opened: MediqDatabase[] = []
async function freshDb() {
  const db = await MediqDatabase.open(`mediq-test-${++n}-${Date.now()}`)
  opened.push(db)
  return db
}
afterEach(() => {
  while (opened.length) opened.pop()!.close()
})

describe('MediqDatabase', () => {
  it('seeds five synthetic patients 104–108 with structured fields', async () => {
    const db = await freshDb()
    const s = await db.snapshot()
    expect(s.patients.map((p) => p.id)).toEqual(['104', '105', '106', '107', '108'])
    for (const p of s.patients) {
      expect(PatientSchema.safeParse(p).success).toBe(true)
      expect(p.synthetic).toBe(true)
    }
    const marcus = s.patients.find((p) => p.id === '104')!
    expect(marcus.fullName).toBe('Marcus Vance')
    expect(marcus.allergies[0]).toMatchObject({ substance: 'Penicillin', severity: 'Severe', reaction: 'Anaphylaxis' })
    const latest = marcus.vitals.at(-1)!
    expect([latest.systolic, latest.diastolic, latest.heartRate, latest.temperatureC]).toEqual([138, 88, 78, 37.1])
    const meds = s.medications.filter((m) => m.patientId === '104' && m.status === 'Active').map((m) => `${m.name} ${m.dose}`)
    expect(meds).toEqual(['Lisinopril 10 mg', 'Metformin 500 mg'])
  })

  it('links every medication and effect to an existing patient', async () => {
    const s = await (await freshDb()).snapshot()
    const pids = new Set(s.patients.map((p) => p.id))
    const meds = new Map(s.medications.map((m) => [m.id, m]))
    for (const m of s.medications) expect(pids.has(m.patientId)).toBe(true)
    for (const e of s.effects) {
      expect(meds.get(e.medicationId)?.patientId).toBe(e.patientId)
    }
    expect(checkConsistency(s)).toEqual([])
  })

  it('does not reseed (overwrite user data) on reopen', async () => {
    const name = `mediq-reopen-${Date.now()}`
    const db = await MediqDatabase.open(name)
    await db.admit({ patientId: '104', roomId: 'R303', bedId: 'R303-A', riskCategory: 'Low', emergency: false, notes: '', responsibleClinician: null }, 'tester')
    db.close()
    const again = await MediqDatabase.open(name)
    opened.push(again)
    const s = await again.snapshot()
    expect(s.admissions.some((a) => a.patientId === '104' && a.status === 'Active')).toBe(true)
  })

  it('admits, transfers and discharges atomically while staying consistent', async () => {
    const db = await freshDb()
    const adm = await db.admit({ patientId: '104', roomId: 'R303', bedId: 'R303-A', riskCategory: 'Moderate', emergency: false, notes: 'test', responsibleClinician: null }, 'tester')
    let s = await db.snapshot()
    expect(s.patients.find((p) => p.id === '104')!.currentVisitStatus).toBe('Admitted')
    await db.transfer(adm.id, 'R301', 'R301-B', 'test transfer', 'tester')
    await db.discharge(adm.id, 'tester')
    s = await db.snapshot()
    expect(checkConsistency(s)).toEqual([])
    expect(s.activity.map((e) => e.kind)).toEqual(expect.arrayContaining(['admission-created', 'room-transfer', 'discharge']))
  })

  it('rejects double-booking at the storage layer', async () => {
    const db = await freshDb()
    await expect(
      db.admit({ patientId: '104', roomId: 'R302', bedId: 'R302-A', riskCategory: 'Low', emergency: false, notes: '', responsibleClinician: null }, 'tester'),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses to save a note without explicit confirmation', async () => {
    const db = await freshDb()
    const draft: Visit = {
      id: 'VIS-T',
      patientId: '104',
      visitAt: new Date().toISOString(),
      type: 'Outpatient',
      clinicianId: null,
      clinicianName: null,
      originalText: 'x',
      structuredNote: null,
      safetyAudit: null,
      finalNote: 'Final',
      missingInformation: [],
      safetyFindings: [],
      discrepancies: [],
      reviewStatus: 'Pending review',
      provenance: { documentation: 'local', audit: 'local' },
      saveConfirmedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await expect(db.saveConfirmedVisit(draft)).rejects.toBeInstanceOf(ValidationError)
    const confirmed = { ...draft, reviewStatus: 'Saved (clinician-confirmed)' as const, saveConfirmedAt: new Date().toISOString() }
    await db.saveConfirmedVisit(confirmed)
    expect((await db.snapshot()).visits.some((v) => v.id === 'VIS-T')).toBe(true)
  })

  it('reset restores the seed and keeps voice profiles unless asked', async () => {
    const db = await freshDb()
    await db.admit({ patientId: '104', roomId: 'R303', bedId: 'R303-A', riskCategory: 'Low', emergency: false, notes: '', responsibleClinician: null }, 'tester')
    await db.resetDemoData({ includeVoiceProfiles: false })
    const s = await db.snapshot()
    expect(s.admissions.some((a) => a.patientId === '104')).toBe(false)
    expect(checkConsistency(s)).toEqual([])
    expect(s.activity[0].kind).toBe('demo-reset')
  })

  it('round-trips export/import and rejects inconsistent imports', async () => {
    const db = await freshDb()
    const json = await db.exportClinical()
    expect(json).not.toMatch(/embedding/)
    await db.importClinical(json)
    const bad = JSON.parse(json)
    bad.medications[0].patientId = '999'
    await expect(db.importClinical(JSON.stringify(bad))).rejects.toBeInstanceOf(ValidationError)
  })
})
