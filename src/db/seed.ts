/**
 * Deterministic SYNTHETIC seed data. Every person, address, phone number
 * (NANP 555-01xx fictional range), e-mail (example.com, reserved) and
 * clinical detail below is fictional and exists only to demonstrate MEDIQ.
 *
 * Room occupancy is NOT stored on rooms: it is derived from active
 * admissions, so the two databases cannot drift apart.
 */
import type {
  Admission,
  ActivityEvent,
  MedicationEffect,
  Medication,
  Patient,
  Room,
  Visit,
} from './schema'

export const SEED_VERSION = 3
const T = '2026-10-19T08:00:00.000Z'

const addr = (line1: string) => ({ line1, city: 'Guelph', region: 'ON', postalCode: 'N0N 0N0', country: 'Canada (fictional address)' })

export const seedPatients: Patient[] = [
  {
    id: '104',
    synthetic: true,
    fullName: 'Marcus Vance',
    dateOfBirth: '1984-03-14',
    gender: 'Male',
    bloodGroup: 'O+',
    phone: '+1 (519) 555-0104',
    email: 'marcus.vance@example.com',
    address: addr('104 Synthetic Lane'),
    noKnownDrugAllergies: false,
    allergies: [
      {
        id: 'ALG-104-1',
        patientId: '104',
        substance: 'Penicillin',
        substanceClass: 'Penicillins (beta-lactam antibiotics)',
        reaction: 'Anaphylaxis',
        severity: 'Severe',
        status: 'Active',
        recordedAt: '2019-06-02',
        source: 'Synthetic record — documented ED visit (fictional)',
      },
    ],
    vitals: [
      { id: 'VS-104-1', patientId: '104', recordedAt: '2026-07-14T14:10:00.000Z', systolic: 146, diastolic: 92, heartRate: 81, temperatureC: 36.9, respiratoryRate: 15, spo2: 98, source: 'Clinic triage (synthetic)' },
      { id: 'VS-104-2', patientId: '104', recordedAt: '2026-10-19T09:05:00.000Z', systolic: 138, diastolic: 88, heartRate: 78, temperatureC: 37.1, respiratoryRate: 16, spo2: 98, source: 'Clinic triage (synthetic)' },
    ],
    labResults: [
      { id: 'LAB-104-1', patientId: '104', name: 'HbA1c', value: 7.2, unit: '%', referenceRange: '4.0 – 5.6', flag: 'High', status: 'Final', collectedAt: '2026-10-12T08:30:00.000Z' },
      { id: 'LAB-104-2', patientId: '104', name: 'Fasting glucose', value: 7.4, unit: 'mmol/L', referenceRange: '3.9 – 5.5', flag: 'High', status: 'Final', collectedAt: '2026-10-12T08:30:00.000Z' },
      { id: 'LAB-104-3', patientId: '104', name: 'Creatinine', value: 88, unit: 'µmol/L', referenceRange: '60 – 110', flag: 'Normal', status: 'Final', collectedAt: '2026-10-12T08:30:00.000Z' },
      { id: 'LAB-104-4', patientId: '104', name: 'Potassium', value: 4.4, unit: 'mmol/L', referenceRange: '3.5 – 5.0', flag: 'Normal', status: 'Final', collectedAt: '2026-10-12T08:30:00.000Z' },
      { id: 'LAB-104-5', patientId: '104', name: 'eGFR', value: 92, unit: 'mL/min/1.73m²', referenceRange: '> 60', flag: 'Normal', status: 'Final', collectedAt: '2026-10-12T08:30:00.000Z' },
    ],
    injuries: [],
    imaging: [],
    history: [
      { condition: 'Hypertension', since: '2018', notes: 'Managed in primary care (synthetic)' },
      { condition: 'Type 2 diabetes mellitus', since: '2021', notes: null },
    ],
    currentVisitStatus: 'In consultation',
    documentationStatus: 'Incomplete',
    missingInformationFlags: ['Metformin frequency not documented'],
    createdAt: T,
    updatedAt: T,
  },
  {
    id: '105',
    synthetic: true,
    fullName: 'Aisha Rahman',
    dateOfBirth: '1959-05-02',
    gender: 'Female',
    bloodGroup: 'A+',
    phone: '+1 (519) 555-0105',
    email: 'aisha.rahman@example.com',
    address: addr('22 Placeholder Crescent'),
    noKnownDrugAllergies: false,
    allergies: [
      {
        id: 'ALG-105-1',
        patientId: '105',
        substance: 'Sulfamethoxazole',
        substanceClass: 'Sulfonamide antibiotics',
        reaction: 'Urticaria (hives)',
        severity: 'Moderate',
        status: 'Active',
        recordedAt: '2014-09-20',
        source: 'Synthetic record — patient-reported, confirmed by clinician (fictional)',
      },
    ],
    vitals: [
      { id: 'VS-105-1', patientId: '105', recordedAt: '2026-10-17T22:40:00.000Z', systolic: 104, diastolic: 62, heartRate: 108, temperatureC: 38.6, respiratoryRate: 24, spo2: 91, source: 'Emergency triage (synthetic)' },
      { id: 'VS-105-2', patientId: '105', recordedAt: '2026-10-19T06:00:00.000Z', systolic: 118, diastolic: 70, heartRate: 92, temperatureC: 37.8, respiratoryRate: 20, spo2: 95, source: 'Ward round (synthetic)' },
    ],
    labResults: [
      { id: 'LAB-105-1', patientId: '105', name: 'White cell count', value: 14.2, unit: '×10⁹/L', referenceRange: '4.0 – 11.0', flag: 'High', status: 'Final', collectedAt: '2026-10-17T23:10:00.000Z' },
      { id: 'LAB-105-2', patientId: '105', name: 'C-reactive protein', value: 86, unit: 'mg/L', referenceRange: '< 5', flag: 'High', status: 'Final', collectedAt: '2026-10-17T23:10:00.000Z' },
      { id: 'LAB-105-3', patientId: '105', name: 'Haemoglobin', value: 128, unit: 'g/L', referenceRange: '120 – 160', flag: 'Normal', status: 'Final', collectedAt: '2026-10-17T23:10:00.000Z' },
      { id: 'LAB-105-4', patientId: '105', name: 'Sodium', value: 136, unit: 'mmol/L', referenceRange: '135 – 145', flag: 'Normal', status: 'Final', collectedAt: '2026-10-17T23:10:00.000Z' },
      { id: 'LAB-105-5', patientId: '105', name: 'Blood culture', value: null, unit: '', referenceRange: 'No growth', flag: 'Pending', status: 'Pending', collectedAt: '2026-10-17T23:15:00.000Z' },
    ],
    injuries: [],
    imaging: [
      {
        id: 'IMG-105-1',
        patientId: '105',
        modality: 'X-ray',
        bodyArea: 'Chest',
        requestSource: 'Clinician-entered request (synthetic scenario)',
        status: 'Completed',
        requestedAt: '2026-10-17T22:55:00.000Z',
        reportedAt: '2026-10-18T01:20:00.000Z',
        report: 'FICTIONAL REPORT: Right lower zone opacity described by the synthetic reporting radiologist. Clinical correlation by the treating team is required.',
        reviewStatus: 'Pending review',
        linkedInjuryId: null,
      },
    ],
    history: [
      { condition: 'Atrial fibrillation', since: '2020', notes: 'Anticoagulated (synthetic)' },
      { condition: 'Hyperlipidaemia', since: '2016', notes: null },
    ],
    currentVisitStatus: 'Admitted',
    documentationStatus: 'Complete',
    missingInformationFlags: [],
    createdAt: T,
    updatedAt: T,
  },
  {
    id: '106',
    synthetic: true,
    fullName: 'Daniel Okafor',
    dateOfBirth: '1997-01-23',
    gender: 'Male',
    bloodGroup: 'B+',
    phone: '+1 (519) 555-0106',
    email: 'daniel.okafor@example.com',
    address: addr('7 Example Street'),
    noKnownDrugAllergies: true,
    allergies: [],
    vitals: [
      { id: 'VS-106-1', patientId: '106', recordedAt: '2026-10-19T07:20:00.000Z', systolic: 124, diastolic: 76, heartRate: 88, temperatureC: 36.8, respiratoryRate: 16, spo2: 99, source: 'Emergency triage (synthetic)' },
    ],
    labResults: [],
    injuries: [
      {
        id: 'INJ-106-1',
        patientId: '106',
        anatomicalArea: 'Right wrist',
        description: 'Pain and swelling after a fall during recreational soccer (fictional).',
        dateReported: '2026-10-19',
        severity: 'Moderate',
        xrayStatus: 'Completed',
        reviewStatus: 'Pending review',
      },
    ],
    imaging: [
      {
        id: 'IMG-106-1',
        patientId: '106',
        modality: 'X-ray',
        bodyArea: 'Right wrist',
        requestSource: 'Clinician-entered request (synthetic scenario)',
        status: 'Completed',
        requestedAt: '2026-10-19T07:35:00.000Z',
        reportedAt: '2026-10-19T08:40:00.000Z',
        report: 'FICTIONAL REPORT: No displaced fracture described in the synthetic report. Final interpretation rests with the treating clinician.',
        reviewStatus: 'Pending review',
        linkedInjuryId: 'INJ-106-1',
      },
    ],
    history: [{ condition: 'Asthma (mild, intermittent)', since: 'Childhood', notes: 'Uses reliever inhaler (synthetic)' }],
    currentVisitStatus: 'Admitted',
    documentationStatus: 'Pending review',
    missingInformationFlags: ['Pain score not documented', 'Neurovascular examination not documented'],
    createdAt: T,
    updatedAt: T,
  },
  {
    id: '107',
    synthetic: true,
    fullName: 'Elena Petrova',
    dateOfBirth: '1972-09-30',
    gender: 'Female',
    bloodGroup: 'AB-',
    phone: '+1 (519) 555-0107',
    email: 'elena.petrova@example.com',
    address: addr('58 Fictional Avenue'),
    noKnownDrugAllergies: false,
    allergies: [
      { id: 'ALG-107-1', patientId: '107', substance: 'Latex', substanceClass: null, reaction: 'Contact dermatitis', severity: 'Moderate', status: 'Active', recordedAt: '2011-03-15', source: 'Synthetic record (fictional)' },
      { id: 'ALG-107-2', patientId: '107', substance: 'Codeine', substanceClass: 'Opioid analgesics', reaction: 'Nausea and vomiting (intolerance)', severity: 'Mild', status: 'Active', recordedAt: '2018-11-02', source: 'Synthetic record (fictional)' },
    ],
    vitals: [
      { id: 'VS-107-1', patientId: '107', recordedAt: '2026-10-19T06:30:00.000Z', systolic: 128, diastolic: 78, heartRate: 84, temperatureC: 37.4, respiratoryRate: 16, spo2: 97, source: 'Ward round (synthetic)' },
    ],
    labResults: [
      { id: 'LAB-107-1', patientId: '107', name: 'Haemoglobin', value: 104, unit: 'g/L', referenceRange: '120 – 160', flag: 'Low', status: 'Final', collectedAt: '2026-10-19T05:45:00.000Z' },
      { id: 'LAB-107-2', patientId: '107', name: 'Platelets', value: 210, unit: '×10⁹/L', referenceRange: '150 – 400', flag: 'Normal', status: 'Final', collectedAt: '2026-10-19T05:45:00.000Z' },
      { id: 'LAB-107-3', patientId: '107', name: 'INR', value: 1.0, unit: '', referenceRange: '0.8 – 1.2', flag: 'Normal', status: 'Final', collectedAt: '2026-10-19T05:45:00.000Z' },
    ],
    injuries: [
      {
        id: 'INJ-107-1',
        patientId: '107',
        anatomicalArea: 'Left knee',
        description: 'Post-operative site following elective left knee arthroplasty (fictional).',
        dateReported: '2026-10-18',
        severity: 'Not documented',
        xrayStatus: 'Completed',
        reviewStatus: 'Reviewed by clinician',
      },
    ],
    imaging: [
      {
        id: 'IMG-107-1',
        patientId: '107',
        modality: 'X-ray',
        bodyArea: 'Left knee',
        requestSource: 'Post-operative protocol entry (synthetic scenario)',
        status: 'Completed',
        requestedAt: '2026-10-18T15:00:00.000Z',
        reportedAt: '2026-10-18T17:10:00.000Z',
        report: 'FICTIONAL REPORT: Post-operative appearances as described by the synthetic reporter.',
        reviewStatus: 'Reviewed by clinician',
        linkedInjuryId: 'INJ-107-1',
      },
    ],
    history: [{ condition: 'Osteoarthritis, left knee', since: '2019', notes: null }],
    currentVisitStatus: 'Admitted',
    documentationStatus: 'Complete',
    missingInformationFlags: [],
    createdAt: T,
    updatedAt: T,
  },
  {
    id: '108',
    synthetic: true,
    fullName: 'Theo Martin',
    dateOfBirth: '1951-11-11',
    gender: 'Male',
    bloodGroup: 'O-',
    phone: '+1 (519) 555-0108',
    email: 'theo.martin@example.com',
    address: addr('3 Sample Road'),
    noKnownDrugAllergies: false,
    allergies: [
      { id: 'ALG-108-1', patientId: '108', substance: 'Iodinated contrast media', substanceClass: 'Radiocontrast agents', reaction: 'Urticaria', severity: 'Moderate', status: 'Active', recordedAt: '2017-04-08', source: 'Synthetic record (fictional)' },
    ],
    vitals: [
      { id: 'VS-108-1', patientId: '108', recordedAt: '2026-10-12T10:15:00.000Z', systolic: 132, diastolic: 74, heartRate: 70, temperatureC: 36.7, respiratoryRate: 18, spo2: 95, source: 'Discharge observations (synthetic)' },
    ],
    labResults: [
      { id: 'LAB-108-1', patientId: '108', name: 'INR', value: 3.6, unit: '', referenceRange: '2.0 – 3.0 (target documented in synthetic record)', flag: 'High', status: 'Final', collectedAt: '2026-10-12T07:00:00.000Z' },
      { id: 'LAB-108-2', patientId: '108', name: 'Potassium', value: 3.3, unit: 'mmol/L', referenceRange: '3.5 – 5.0', flag: 'Low', status: 'Final', collectedAt: '2026-10-12T07:00:00.000Z' },
      { id: 'LAB-108-3', patientId: '108', name: 'NT-proBNP', value: 1840, unit: 'ng/L', referenceRange: '< 450', flag: 'High', status: 'Final', collectedAt: '2026-10-10T07:00:00.000Z' },
    ],
    injuries: [],
    imaging: [],
    history: [
      { condition: 'Heart failure with reduced ejection fraction', since: '2022', notes: null },
      { condition: 'Atrial fibrillation', since: '2019', notes: null },
    ],
    currentVisitStatus: 'Follow-up scheduled',
    documentationStatus: 'Pending review',
    missingInformationFlags: ['Post-discharge INR recheck date not documented'],
    createdAt: T,
    updatedAt: T,
  },
]

const room = (r: Omit<Room, 'capacity' | 'updatedAt'>): Room => ({ ...r, capacity: r.beds.length, updatedAt: T })
const beds = (roomId: string, labels: string[]) => labels.map((l) => ({ id: `${roomId}-${l}`, label: l }))

export const seedRooms: Room[] = [
  room({ id: 'R301', roomNumber: '301', building: 'North Tower', ward: 'Ward 3A · General Medicine', floor: 3, type: 'Semi-private', beds: beds('R301', ['A', 'B']), availability: 'In service', features: ['Oxygen outlet', 'Accessible bathroom'] }),
  room({ id: 'R302', roomNumber: '302', building: 'North Tower', ward: 'Ward 3A · General Medicine', floor: 3, type: 'Semi-private', beds: beds('R302', ['A', 'B']), availability: 'In service', features: ['Oxygen outlet', 'Telemetry-ready'] }),
  room({ id: 'R303', roomNumber: '303', building: 'North Tower', ward: 'Ward 3A · General Medicine', floor: 3, type: 'Private', beds: beds('R303', ['A']), availability: 'In service', features: ['Oxygen outlet'] }),
  room({ id: 'R304', roomNumber: '304', building: 'North Tower', ward: 'Ward 3A · General Medicine', floor: 3, type: 'Isolation', beds: beds('R304', ['A']), availability: 'Cleaning', features: ['Negative pressure', 'Anteroom'] }),
  room({ id: 'R401', roomNumber: '401', building: 'North Tower', ward: 'Ward 4B · Surgical', floor: 4, type: 'Private', beds: beds('R401', ['A']), availability: 'In service', features: ['Ceiling hoist', 'Accessible bathroom'] }),
  room({ id: 'R402', roomNumber: '402', building: 'North Tower', ward: 'Ward 4B · Surgical', floor: 4, type: 'Semi-private', beds: beds('R402', ['A', 'B']), availability: 'In service', features: ['Oxygen outlet'] }),
  room({ id: 'OBS1', roomNumber: 'OBS-1', building: 'South Wing', ward: 'Emergency · Observation Unit', floor: 1, type: 'Observation', beds: beds('OBS1', ['A', 'B']), availability: 'In service', features: ['Monitored bays', 'Near imaging'] }),
  room({ id: 'OBS2', roomNumber: 'OBS-2', building: 'South Wing', ward: 'Emergency · Observation Unit', floor: 1, type: 'Observation', beds: beds('OBS2', ['A']), availability: 'In service', features: ['Monitored bay'] }),
  room({ id: 'ICU1', roomNumber: 'ICU-1', building: 'South Wing', ward: 'Intensive Care Unit', floor: 2, type: 'ICU', beds: beds('ICU1', ['A']), availability: 'In service', features: ['Ventilator-ready', 'Continuous monitoring'] }),
  room({ id: 'ICU2', roomNumber: 'ICU-2', building: 'South Wing', ward: 'Intensive Care Unit', floor: 2, type: 'ICU', beds: beds('ICU2', ['A']), availability: 'Out of service', features: ['Ventilator-ready', 'Under maintenance (synthetic)'] }),
]

const hist = (at: string, toRoomId: string, toBedId: string, reason: string) => [
  { at, action: 'assigned' as const, fromRoomId: null, fromBedId: null, toRoomId, toBedId, by: 'Synthetic seed', reason },
]

export const seedAdmissions: Admission[] = [
  {
    id: 'ADM-105',
    patientId: '105',
    roomId: 'R302',
    bedId: 'R302-A',
    admittedAt: '2026-10-18T00:30:00.000Z',
    dischargedAt: null,
    status: 'Active',
    riskCategory: 'High',
    emergency: true,
    notes: 'Admitted via emergency department (synthetic). Documented risk category recorded by admitting clinician.',
    responsibleClinician: 'Dr. R. Synthetic (fictional)',
    assignmentHistory: hist('2026-10-18T00:30:00.000Z', 'R302', 'R302-A', 'Admission from ED (synthetic)'),
    updatedAt: T,
  },
  {
    id: 'ADM-106',
    patientId: '106',
    roomId: 'OBS1',
    bedId: 'OBS1-A',
    admittedAt: '2026-10-19T07:50:00.000Z',
    dischargedAt: null,
    status: 'Active',
    riskCategory: 'Low',
    emergency: true,
    notes: 'Short-stay observation pending clinician review of imaging (synthetic).',
    responsibleClinician: 'Dr. K. Example (fictional)',
    assignmentHistory: hist('2026-10-19T07:50:00.000Z', 'OBS1', 'OBS1-A', 'ED observation (synthetic)'),
    updatedAt: T,
  },
  {
    id: 'ADM-107',
    patientId: '107',
    roomId: 'R401',
    bedId: 'R401-A',
    admittedAt: '2026-10-18T07:00:00.000Z',
    dischargedAt: null,
    status: 'Active',
    riskCategory: 'Moderate',
    emergency: false,
    notes: 'Elective surgical admission (synthetic).',
    responsibleClinician: 'Dr. L. Placeholder (fictional)',
    assignmentHistory: hist('2026-10-18T07:00:00.000Z', 'R401', 'R401-A', 'Elective admission (synthetic)'),
    updatedAt: T,
  },
  {
    id: 'ADM-108',
    patientId: '108',
    roomId: 'R303',
    bedId: 'R303-A',
    admittedAt: '2026-10-08T13:00:00.000Z',
    dischargedAt: '2026-10-12T11:00:00.000Z',
    status: 'Discharged',
    riskCategory: 'Moderate',
    emergency: true,
    notes: 'Discharged home (synthetic). Bed released on discharge.',
    responsibleClinician: 'Dr. R. Synthetic (fictional)',
    assignmentHistory: [
      ...hist('2026-10-08T13:00:00.000Z', 'R303', 'R303-A', 'Admission from ED (synthetic)'),
      { at: '2026-10-12T11:00:00.000Z', action: 'released', fromRoomId: 'R303', fromBedId: 'R303-A', toRoomId: null, toBedId: null, by: 'Synthetic seed', reason: 'Discharged' },
    ],
    updatedAt: T,
  },
]

const med = (m: Omit<Medication, 'updatedAt' | 'visitId' | 'source'> & Partial<Pick<Medication, 'visitId' | 'source'>>): Medication => ({
  visitId: null,
  source: 'Synthetic seed record',
  ...m,
  updatedAt: T,
})

export const seedMedications: Medication[] = [
  med({ id: 'MED-104-1', patientId: '104', name: 'Lisinopril', genericName: 'lisinopril', medicationClass: 'ACE inhibitor', dose: '10 mg', route: 'Oral', frequency: 'Once daily', startDate: '2018-05-10', endDate: null, status: 'Active', indication: 'Hypertension (documented)', safetyFlags: [], prescriber: 'Dr. A. Fictional (synthetic)' }),
  med({ id: 'MED-104-2', patientId: '104', name: 'Metformin', genericName: 'metformin', medicationClass: 'Biguanide', dose: '500 mg', route: 'Oral', frequency: null, startDate: '2021-02-01', endDate: null, status: 'Active', indication: 'Type 2 diabetes (documented)', safetyFlags: ['Frequency not documented'], prescriber: 'Dr. A. Fictional (synthetic)' }),
  med({ id: 'MED-104-3', patientId: '104', name: 'Penicillin V', genericName: 'phenoxymethylpenicillin', medicationClass: 'Penicillins (beta-lactam antibiotics)', dose: null, route: 'Oral', frequency: null, startDate: '2019-06-01', endDate: '2019-06-02', status: 'Historical', indication: 'Not documented', safetyFlags: ['Associated with documented anaphylaxis'], prescriber: null }),
  med({ id: 'MED-105-1', patientId: '105', name: 'Ceftriaxone', genericName: 'ceftriaxone', medicationClass: 'Cephalosporin antibiotics', dose: '1 g', route: 'IV', frequency: 'Every 24 hours', startDate: '2026-10-18', endDate: null, status: 'Active', indication: 'Documented by admitting team (synthetic)', safetyFlags: [], prescriber: 'Dr. R. Synthetic (fictional)' }),
  med({ id: 'MED-105-2', patientId: '105', name: 'Apixaban', genericName: 'apixaban', medicationClass: 'Direct oral anticoagulant', dose: '5 mg', route: 'Oral', frequency: 'Twice daily', startDate: '2020-08-12', endDate: null, status: 'Active', indication: 'Atrial fibrillation (documented)', safetyFlags: [], prescriber: 'Dr. A. Fictional (synthetic)' }),
  med({ id: 'MED-105-3', patientId: '105', name: 'Atorvastatin', genericName: 'atorvastatin', medicationClass: 'HMG-CoA reductase inhibitor', dose: '20 mg', route: 'Oral', frequency: 'Nightly', startDate: '2016-03-01', endDate: null, status: 'Active', indication: 'Hyperlipidaemia (documented)', safetyFlags: [], prescriber: 'Dr. A. Fictional (synthetic)' }),
  med({ id: 'MED-106-1', patientId: '106', name: 'Ibuprofen', genericName: 'ibuprofen', medicationClass: 'NSAID', dose: '400 mg', route: 'Oral', frequency: 'As needed (documented)', startDate: '2026-10-19', endDate: null, status: 'Active', indication: 'Wrist pain (documented)', safetyFlags: ['Documented asthma history — flagged for clinician review'], prescriber: 'Dr. K. Example (fictional)', source: 'Clinician entry (synthetic)' }),
  med({ id: 'MED-106-2', patientId: '106', name: 'Salbutamol inhaler', genericName: 'salbutamol', medicationClass: 'Short-acting beta-2 agonist', dose: '100 mcg per puff', route: 'Inhaled', frequency: 'As needed (documented)', startDate: '2012-01-01', endDate: null, status: 'Active', indication: 'Asthma (documented)', safetyFlags: [], prescriber: null }),
  med({ id: 'MED-107-1', patientId: '107', name: 'Enoxaparin', genericName: 'enoxaparin', medicationClass: 'Low-molecular-weight heparin', dose: '40 mg', route: 'Subcutaneous', frequency: 'Once daily', startDate: '2026-10-18', endDate: null, status: 'Active', indication: 'Post-operative VTE prophylaxis (documented)', safetyFlags: [], prescriber: 'Dr. L. Placeholder (fictional)' }),
  med({ id: 'MED-107-2', patientId: '107', name: 'Acetaminophen', genericName: 'acetaminophen', medicationClass: 'Analgesic', dose: '1 g', route: 'Oral', frequency: 'Every 6 hours', startDate: '2026-10-18', endDate: null, status: 'Active', indication: 'Post-operative pain (documented)', safetyFlags: [], prescriber: 'Dr. L. Placeholder (fictional)' }),
  med({ id: 'MED-107-3', patientId: '107', name: 'Ondansetron', genericName: 'ondansetron', medicationClass: '5-HT3 antagonist antiemetic', dose: '4 mg', route: 'IV', frequency: 'As needed (documented)', startDate: '2026-10-18', endDate: null, status: 'Active', indication: 'Nausea (documented)', safetyFlags: [], prescriber: 'Dr. L. Placeholder (fictional)' }),
  med({ id: 'MED-108-1', patientId: '108', name: 'Warfarin', genericName: 'warfarin', medicationClass: 'Vitamin K antagonist', dose: '5 mg', route: 'Oral', frequency: 'Once daily', startDate: '2019-07-01', endDate: null, status: 'Active', indication: 'Atrial fibrillation (documented)', safetyFlags: ['Latest INR above documented target range — flagged for review'], prescriber: 'Dr. A. Fictional (synthetic)' }),
  med({ id: 'MED-108-2', patientId: '108', name: 'Furosemide', genericName: 'furosemide', medicationClass: 'Loop diuretic', dose: '40 mg', route: 'Oral', frequency: 'Once daily', startDate: '2022-02-14', endDate: null, status: 'Active', indication: 'Heart failure (documented)', safetyFlags: [], prescriber: 'Dr. A. Fictional (synthetic)' }),
]

const eff = (e: MedicationEffect): MedicationEffect => e

export const seedEffects: MedicationEffect[] = [
  eff({ id: 'EFF-104-1', medicationId: 'MED-104-1', patientId: '104', category: 'Beneficial (documented)', effect: 'Clinic blood pressure readings lower than pre-treatment readings in the synthetic record.', reportedSymptoms: [], severity: 'Not documented', recordedAt: '2026-07-14', source: 'Synthetic clinic record', reviewStatus: 'Reviewed by clinician', relatedAlert: null, followUpStatus: 'Follow-up scheduled' }),
  eff({ id: 'EFF-104-2', medicationId: 'MED-104-1', patientId: '104', category: 'Patient-reported', effect: 'Patient reports an occasional dry cough (fictional report).', reportedSymptoms: ['Dry cough'], severity: 'Mild', recordedAt: '2026-07-14', source: 'Patient report recorded at visit (synthetic)', reviewStatus: 'Pending review', relatedAlert: null, followUpStatus: 'Follow-up pending' }),
  eff({ id: 'EFF-104-3', medicationId: 'MED-104-2', patientId: '104', category: 'Adverse (documented)', effect: 'Mild gastrointestinal upset in the first weeks of therapy, documented as resolved (synthetic).', reportedSymptoms: ['Nausea', 'Loose stools'], severity: 'Mild', recordedAt: '2021-03-01', source: 'Synthetic clinic record', reviewStatus: 'Reviewed by clinician', relatedAlert: null, followUpStatus: 'None required' }),
  eff({ id: 'EFF-104-4', medicationId: 'MED-104-3', patientId: '104', category: 'Adverse (documented)', effect: 'Anaphylaxis documented after administration (synthetic ED record). Recorded as severe penicillin allergy.', reportedSymptoms: ['Throat swelling', 'Hypotension', 'Urticaria'], severity: 'Severe', recordedAt: '2019-06-02', source: 'Synthetic ED record', reviewStatus: 'Reviewed by clinician', relatedAlert: 'Severe penicillin allergy (ALG-104-1)', followUpStatus: 'None required' }),
  eff({ id: 'EFF-105-1', medicationId: 'MED-105-1', patientId: '105', category: 'Not yet assessed', effect: 'Response to therapy not yet assessed in the synthetic record.', reportedSymptoms: [], severity: 'Not documented', recordedAt: '2026-10-19', source: 'Synthetic ward record', reviewStatus: 'Not reviewed', relatedAlert: null, followUpStatus: 'Follow-up pending' }),
  eff({ id: 'EFF-106-1', medicationId: 'MED-106-1', patientId: '106', category: 'Potential interaction / contraindication (flagged for review)', effect: 'NSAID entry recorded for a patient with a documented asthma history. Flagged for qualified clinician review; not a conclusion.', reportedSymptoms: [], severity: 'Not documented', recordedAt: '2026-10-19', source: 'Local deterministic rule (synthetic demo)', reviewStatus: 'Pending review', relatedAlert: 'NSAID + documented asthma', followUpStatus: 'Follow-up pending' }),
  eff({ id: 'EFF-107-1', medicationId: 'MED-107-3', patientId: '107', category: 'Beneficial (documented)', effect: 'Nausea documented as improved after dose (synthetic nursing note).', reportedSymptoms: [], severity: 'Not documented', recordedAt: '2026-10-18', source: 'Synthetic nursing note', reviewStatus: 'Reviewed by clinician', relatedAlert: null, followUpStatus: 'None required' }),
  eff({ id: 'EFF-107-2', medicationId: 'MED-107-1', patientId: '107', category: 'Not yet assessed', effect: 'No effects documented yet.', reportedSymptoms: [], severity: 'Not documented', recordedAt: '2026-10-19', source: 'Synthetic ward record', reviewStatus: 'Not reviewed', relatedAlert: null, followUpStatus: 'Not documented' }),
  eff({ id: 'EFF-108-1', medicationId: 'MED-108-1', patientId: '108', category: 'Adverse (documented)', effect: 'INR above the documented target range on the latest synthetic result. Flagged for clinician review.', reportedSymptoms: [], severity: 'Not documented', recordedAt: '2026-10-12', source: 'Synthetic laboratory record', reviewStatus: 'Pending review', relatedAlert: 'INR 3.6 vs documented target 2.0 – 3.0', followUpStatus: 'Follow-up pending' }),
  eff({ id: 'EFF-108-2', medicationId: 'MED-108-2', patientId: '108', category: 'Patient-reported', effect: 'Patient reports increased urination frequency (fictional report).', reportedSymptoms: ['Urinary frequency'], severity: 'Mild', recordedAt: '2026-10-12', source: 'Patient report (synthetic)', reviewStatus: 'Reviewed by clinician', relatedAlert: null, followUpStatus: 'None required' }),
]

const visit = (v: Omit<Visit, 'structuredNote' | 'safetyAudit' | 'safetyFindings' | 'createdAt' | 'updatedAt' | 'provenance'> & Partial<Pick<Visit, 'provenance'>>): Visit => ({
  structuredNote: null,
  safetyAudit: null,
  safetyFindings: [],
  provenance: { documentation: 'seed', audit: null },
  createdAt: v.visitAt,
  updatedAt: v.visitAt,
  ...v,
})

export const seedVisits: Visit[] = [
  visit({
    id: 'VIS-104-1', patientId: '104', visitAt: '2026-07-14T14:30:00.000Z', type: 'Follow-up', clinicianId: null, clinicianName: 'Dr. A. Fictional (synthetic)',
    originalText: 'Hypertension and diabetes follow-up. BP 146/92. Patient reports occasional dry cough. Continue current medications. Recheck labs in 3 months.',
    finalNote: 'S: Follow-up for hypertension and type 2 diabetes. Reports occasional dry cough.\nO: BP 146/92 mmHg, HR 81 bpm.\nA: Documented hypertension and type 2 diabetes (synthetic).\nP: Continue current documented medications. Repeat labs in 3 months. Review cough at next visit.',
    missingInformation: [], discrepancies: [], reviewStatus: 'Saved (clinician-confirmed)', saveConfirmedAt: '2026-07-14T14:45:00.000Z',
  }),
  visit({
    id: 'VIS-105-1', patientId: '105', visitAt: '2026-10-17T23:30:00.000Z', type: 'Emergency', clinicianId: null, clinicianName: 'Dr. R. Synthetic (fictional)',
    originalText: 'Fever, productive cough and shortness of breath for 3 days. Febrile, tachycardic, SpO2 91% on room air. Chest X-ray requested. Admit to medicine.',
    finalNote: 'S: 3 days of fever, productive cough and breathlessness (synthetic).\nO: T 38.6 °C, HR 108, RR 24, SpO2 91% RA. WCC 14.2, CRP 86.\nA: Documented by admitting clinician (synthetic).\nP: Admitted to Ward 3A. Chest X-ray requested. Documented sulfonamide allergy noted.',
    missingInformation: [], discrepancies: [], reviewStatus: 'Saved (clinician-confirmed)', saveConfirmedAt: '2026-10-17T23:50:00.000Z',
  }),
  visit({
    id: 'VIS-106-1', patientId: '106', visitAt: '2026-10-19T07:30:00.000Z', type: 'Emergency', clinicianId: null, clinicianName: 'Dr. K. Example (fictional)',
    originalText: 'Fell on outstretched right hand during soccer. Swelling over the wrist. X-ray requested.',
    finalNote: 'Draft — awaiting clinician review. Fall onto outstretched right hand; wrist swelling; X-ray requested (synthetic).',
    missingInformation: ['Pain score not documented', 'Neurovascular examination not documented'], discrepancies: [], reviewStatus: 'Pending review', saveConfirmedAt: null,
  }),
  visit({
    id: 'VIS-107-1', patientId: '107', visitAt: '2026-10-19T06:45:00.000Z', type: 'Inpatient round', clinicianId: null, clinicianName: 'Dr. L. Placeholder (fictional)',
    originalText: 'Post-op day 1. Pain controlled. Mobilising with physiotherapy. Hb 104.',
    finalNote: 'S: Post-operative day 1; pain documented as controlled.\nO: Hb 104 g/L (low). Vitals stable per synthetic record.\nA: Post-operative course as documented (synthetic).\nP: Continue physiotherapy; continue documented VTE prophylaxis.',
    missingInformation: [], discrepancies: [], reviewStatus: 'Saved (clinician-confirmed)', saveConfirmedAt: '2026-10-19T07:00:00.000Z',
  }),
  visit({
    id: 'VIS-108-1', patientId: '108', visitAt: '2026-10-12T10:30:00.000Z', type: 'Discharge', clinicianId: null, clinicianName: 'Dr. R. Synthetic (fictional)',
    originalText: 'Discharge after heart failure admission. INR 3.6. K 3.3. Follow up with primary care.',
    finalNote: 'S: Ready for discharge per treating team (synthetic).\nO: INR 3.6 (above documented target), K 3.3 (low).\nA: As documented by treating team (synthetic).\nP: Discharge home; primary care follow-up. INR recheck date not documented.',
    missingInformation: ['Post-discharge INR recheck date not documented'], discrepancies: [], reviewStatus: 'Saved (clinician-confirmed)', saveConfirmedAt: '2026-10-12T10:50:00.000Z',
  }),
]

export const seedActivity: ActivityEvent[] = [
  { id: 'ACT-SEED-1', at: T, kind: 'system', category: 'system', mode: 'live', message: 'Synthetic demo database initialised (seed v' + SEED_VERSION + ').', patientId: null, profileId: null, details: {} },
]
