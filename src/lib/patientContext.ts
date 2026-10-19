import type { PatientContext } from '../../shared/aiSchemas'
import type { Medication, Patient } from '../db/schema'
import { ageFromDob, bp, latestVitals } from './format'

/**
 * Minimal synthetic context sent to AI providers. Contact details (phone,
 * e-mail, address) are deliberately excluded — no provider needs them.
 */
export function buildPatientContext(patient: Patient, medications: Medication[]): PatientContext {
  const v = latestVitals(patient)
  return {
    patientId: patient.id,
    synthetic: true,
    age: ageFromDob(patient.dateOfBirth),
    gender: patient.gender,
    allergies: patient.allergies.map((a) => ({
      substance: a.substance,
      substanceClass: a.substanceClass,
      reaction: a.reaction,
      severity: a.severity,
      status: a.status,
    })),
    medications: medications
      .filter((m) => m.patientId === patient.id)
      .map((m) => ({
        name: m.name,
        genericName: m.genericName,
        medicationClass: m.medicationClass,
        dose: m.dose,
        route: m.route,
        frequency: m.frequency,
        status: m.status,
      })),
    history: patient.history.map((h) => `${h.condition}${h.since ? ` (since ${h.since})` : ''}`),
    latestVitals: v
      ? { recordedAt: v.recordedAt, bloodPressure: bp(v), heartRate: v.heartRate, temperatureC: v.temperatureC }
      : null,
  }
}
