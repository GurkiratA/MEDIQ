import { describe, expect, it } from 'vitest'
import { checkConsistency, planAdmission, planDischarge, planTransfer, roomOccupancy, validatePlacement } from './allocation'
import { seedAdmissions, seedPatients, seedRooms } from './seed'

const ctx = () => ({ patients: structuredClone(seedPatients), rooms: structuredClone(seedRooms), admissions: structuredClone(seedAdmissions) })
const NOW = '2026-10-19T12:00:00.000Z'

describe('seed consistency', () => {
  it('has no allocation integrity problems', () => {
    expect(checkConsistency(ctx())).toEqual([])
  })

  it('derives occupancy from active admissions only', () => {
    const c = ctx()
    const r302 = roomOccupancy(c.rooms.find((r) => r.id === 'R302')!, c.admissions)
    expect(r302.occupied).toBe(1)
    expect(r302.occupancyStatus).toBe('Partially occupied')
    const r401 = roomOccupancy(c.rooms.find((r) => r.id === 'R401')!, c.admissions)
    expect(r401.occupancyStatus).toBe('Full')
    expect(r401.bookable).toBe(false)
    // Patient 108 was discharged from R303, so the bed is free again.
    const r303 = roomOccupancy(c.rooms.find((r) => r.id === 'R303')!, c.admissions)
    expect(r303.occupancyStatus).toBe('Vacant')
    expect(r303.bookable).toBe(true)
  })
})

describe('placement rules', () => {
  it('rejects a bed that already holds an active admission', () => {
    const errors = validatePlacement({ patientId: '104', roomId: 'R302', bedId: 'R302-A' }, ctx())
    expect(errors.join(' ')).toMatch(/already assigned/)
  })

  it('rejects allocation beyond room capacity', () => {
    const c = ctx()
    // Corrupt a room so capacity is the only failing rule: one bed free by id, but capacity already used.
    const room = c.rooms.find((r) => r.id === 'R401')!
    room.beds.push({ id: 'R401-B', label: 'B' })
    const errors = validatePlacement({ patientId: '104', roomId: 'R401', bedId: 'R401-B' }, c)
    expect(errors.join(' ')).toMatch(/at capacity/)
  })

  it('rejects rooms that are not in service', () => {
    expect(validatePlacement({ patientId: '104', roomId: 'ICU2', bedId: 'ICU2-A' }, ctx()).join(' ')).toMatch(/not available/)
    expect(validatePlacement({ patientId: '104', roomId: 'R304', bedId: 'R304-A' }, ctx()).join(' ')).toMatch(/Cleaning/)
  })

  it('rejects a second active admission for the same patient', () => {
    expect(validatePlacement({ patientId: '105', roomId: 'R303', bedId: 'R303-A' }, ctx()).join(' ')).toMatch(/already has an active admission/)
  })

  it('rejects nonexistent patients, rooms and beds', () => {
    expect(validatePlacement({ patientId: '999', roomId: 'R303', bedId: 'R303-A' }, ctx()).join(' ')).toMatch(/does not exist/)
    expect(validatePlacement({ patientId: '104', roomId: 'NOPE', bedId: 'X' }, ctx()).join(' ')).toMatch(/does not exist/)
    expect(validatePlacement({ patientId: '104', roomId: 'R303', bedId: 'R302-B' }, ctx()).join(' ')).toMatch(/not part of room/)
  })
})

describe('plans', () => {
  it('plans an admission with a reviewable proposal', () => {
    const plan = planAdmission(
      { patientId: '104', roomId: 'R303', bedId: 'R303-A', riskCategory: 'Moderate', emergency: false, notes: '', responsibleClinician: null },
      ctx(),
      NOW,
      'tester',
      'ADM-NEW',
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.value.status).toBe('Active')
    expect(plan.proposal.changes.map((c) => c.label)).toContain('Bed')
    const c = ctx()
    c.admissions.push(plan.value)
    c.patients.find((p) => p.id === '104')!.currentVisitStatus = 'Admitted'
    expect(checkConsistency(c)).toEqual([])
  })

  it('transfers without conflicting with its own current bed and records history', () => {
    const plan = planTransfer('ADM-106', 'OBS1', 'OBS1-B', 'Bay swap', ctx(), NOW, 'tester')
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.value.bedId).toBe('OBS1-B')
    expect(plan.value.assignmentHistory.at(-1)?.action).toBe('transferred')
  })

  it('refuses to transfer into an occupied bed', () => {
    const plan = planTransfer('ADM-106', 'R302', 'R302-A', '', ctx(), NOW, 'tester')
    expect(plan.ok).toBe(false)
  })

  it('discharge releases the bed', () => {
    const c = ctx()
    const plan = planDischarge('ADM-107', c, NOW, 'tester')
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    c.admissions = c.admissions.map((a) => (a.id === 'ADM-107' ? plan.value : a))
    expect(roomOccupancy(c.rooms.find((r) => r.id === 'R401')!, c.admissions).bookable).toBe(true)
  })

  it('cannot discharge twice', () => {
    expect(planDischarge('ADM-108', ctx(), NOW, 'tester').ok).toBe(false)
  })
})
