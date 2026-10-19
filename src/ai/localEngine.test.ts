import { describe, expect, it } from 'vitest'
import { StructuredNoteSchema, SafetyAuditSchema } from '../../shared/aiSchemas'
import { seedMedications, seedPatients } from '../db/seed'
import { buildPatientContext } from '../lib/patientContext'
import { localAudit, localDocument } from './localEngine'
import { DEMO_SINUSITIS_NOTE } from './demoScenarios'

const ctx = (id: string) => buildPatientContext(seedPatients.find((p) => p.id === id)!, seedMedications)

const REQUIRED_WARNING =
  "CRITICAL SAFETY WARNING: The proposed amoxicillin entry conflicts with Patient 104's documented severe penicillin allergy and history of anaphylaxis. Do not treat this draft as an approved prescription. Qualified clinician review is required before any medication decision."

describe('local deterministic engine', () => {
  it('produces schema-valid structured notes', () => {
    const note = localDocument(DEMO_SINUSITIS_NOTE, ctx('104'))
    expect(StructuredNoteSchema.safeParse(note).success).toBe(true)
    expect(note.chiefComplaint).toMatch(/acute bacterial sinusitis/i)
    expect(note.medicationsMentioned[0]).toMatchObject({ name: 'Amoxicillin', dose: '500 mg', frequency: 'three times daily', duration: '10 days', status: 'proposed-in-draft' })
  })

  it('flags the seeded penicillin–amoxicillin conflict with the exact critical warning', () => {
    const audit = localAudit(DEMO_SINUSITIS_NOTE, null, ctx('104'))
    expect(SafetyAuditSchema.safeParse(audit).success).toBe(true)
    expect(audit.overallRisk).toBe('critical')
    const crit = audit.findings.find((f) => f.category === 'allergy-conflict')!
    expect(crit.severity).toBe('critical')
    expect(crit.detail).toBe(REQUIRED_WARNING)
    expect(crit.evidence.join(' ')).toMatch(/Penicillin allergy — severity Severe, reaction Anaphylaxis/)
  })

  it('never recommends an alternative medication or dose', () => {
    const audit = localAudit(DEMO_SINUSITIS_NOTE, null, ctx('104'))
    const text = JSON.stringify(audit).toLowerCase()
    for (const alt of ['azithromycin', 'doxycycline', 'clarithromycin', 'instead', 'switch to', 'alternative'])
      expect(text).not.toContain(alt)
  })

  it('reports missing route rather than inferring it', () => {
    const note = localDocument(DEMO_SINUSITIS_NOTE, ctx('104'))
    expect(note.medicationsMentioned[0].route).toBeNull()
    expect(note.missingInformation).toContain('Route not documented for Amoxicillin')
  })

  it('does not flag a conflict for a patient without a matching allergy', () => {
    const audit = localAudit(DEMO_SINUSITIS_NOTE.replace('104', '106'), null, ctx('106'))
    expect(audit.findings.some((f) => f.category === 'allergy-conflict')).toBe(false)
  })

  it('does not invent symptoms or medications from an empty-ish note', () => {
    const note = localDocument('Routine review.', ctx('104'))
    expect(note.reportedSymptoms).toEqual([])
    expect(note.medicationsMentioned).toEqual([])
    expect(note.soap.assessment).toBe('Not documented')
  })

  it('treats explicit negatives as documented negatives only', () => {
    const note = localDocument('Patient presents with cough. Denies fever.', ctx('104'))
    expect(note.reportedSymptoms).toEqual(['Cough'])
    expect(note.documentedFindings).toContain('Negative (documented): fever')
  })

  it('flags NKDA statements that contradict the record', () => {
    const audit = localAudit('Patient presents with rash. NKDA.', null, ctx('104'))
    expect(audit.contradictions[0]).toMatch(/no known drug allergies/)
  })
})
