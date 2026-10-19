/**
 * MEDIQ domain model. Every persisted entity has a Zod schema (validated on
 * write) and a derived TypeScript type. All patient data is synthetic.
 */
import { z } from 'zod'
import { SafetyAlertSchema, StructuredNoteSchema, SafetyAuditSchema } from '../../shared/aiSchemas'

const id = z.string().min(1).max(64)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Expected ISO date-time')

/* ------------------------------------------------------------ enumerations */

export const Gender = z.enum(['Male', 'Female', 'Non-binary', 'Undisclosed'])
export const BloodGroup = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'])
export const AllergySeverity = z.enum(['Mild', 'Moderate', 'Severe', 'Not documented'])
export const AllergyStatus = z.enum(['Active', 'Inactive', 'Unverified'])
export const VisitStatus = z.enum(['Not checked in', 'Waiting', 'In consultation', 'Admitted', 'Discharged', 'Follow-up scheduled'])
export const DocumentationStatus = z.enum(['Complete', 'Incomplete', 'Pending review'])
export const ReviewStatus = z.enum(['Not reviewed', 'Pending review', 'Reviewed by clinician'])
export const ImagingStatus = z.enum(['Not requested', 'Requested', 'Scheduled', 'Completed', 'Not documented'])
export const LabFlag = z.enum(['Normal', 'High', 'Low', 'Critical', 'Pending'])
export const LabStatus = z.enum(['Final', 'Preliminary', 'Pending'])

export const RoomType = z.enum(['General', 'Semi-private', 'Private', 'Isolation', 'Observation', 'ICU'])
export const RoomAvailability = z.enum(['In service', 'Cleaning', 'Out of service'])
export const AdmissionStatus = z.enum(['Active', 'Pending discharge', 'Discharged'])
export const RiskCategory = z.enum(['Low', 'Moderate', 'High', 'Critical'])

export const MedicationStatus = z.enum(['Active', 'Completed', 'Discontinued', 'On hold', 'Historical'])
export const MedicationSource = z.enum(['Synthetic seed record', 'Clinician entry (synthetic)', 'Confirmed visit note'])
export const EffectCategory = z.enum([
  'Beneficial (documented)',
  'Adverse (documented)',
  'Patient-reported',
  'Potential interaction / contraindication (flagged for review)',
  'Not yet assessed',
])
export const EffectSeverity = z.enum(['Mild', 'Moderate', 'Severe', 'Not documented'])
export const FollowUpStatus = z.enum(['None required', 'Follow-up pending', 'Follow-up scheduled', 'Not documented'])

export const VisitType = z.enum(['Outpatient', 'Emergency', 'Inpatient round', 'Follow-up', 'Discharge'])
export const NoteReviewStatus = z.enum(['Draft', 'Pending review', 'Saved (clinician-confirmed)'])
export const NoteProvenance = z.enum(['hermes', 'gemini', 'local', 'manual', 'seed'])

export const ProfileRole = z.enum(['Owner', 'Clinician'])
export const EnrollmentStatus = z.enum(['Enrolled', 'Re-enrollment required'])
export const Permission = z.enum(['voice-navigation', 'voice-dictation', 'manage-profiles'])

export const ActivityCategory = z.enum(['security', 'clinical', 'allocation', 'ai', 'system'])
export const ActivityMode = z.enum(['live', 'simulation'])
export const ActivityKind = z.enum([
  'verification-success',
  'verification-failed',
  'unknown-speaker-rejected',
  'revoked-profile-rejected',
  'ambiguous-match-rejected',
  'poor-sample-rejected',
  'command-executed',
  'profile-enrolled',
  'profile-authorized',
  'profile-revoked',
  'profile-removed',
  'profile-renamed',
  'profile-reenrolled',
  'note-generated',
  'note-reviewed',
  'note-saved',
  'note-cancelled',
  'admission-created',
  'room-transfer',
  'discharge',
  'ai-provider-failure',
  'fallback-activated',
  'demo-reset',
  'data-exported',
  'data-imported',
  'system',
])

/* ------------------------------------------------------------- patient sub-entities */

export const AddressSchema = z.object({
  line1: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
})

export const AllergySchema = z.object({
  id,
  patientId: id,
  substance: z.string().min(1),
  /** Documented drug class, e.g. "Penicillins (beta-lactam antibiotics)". */
  substanceClass: z.string().nullable(),
  reaction: z.string().min(1),
  severity: AllergySeverity,
  status: AllergyStatus,
  recordedAt: isoDate,
  source: z.string().min(1),
})
export type Allergy = z.infer<typeof AllergySchema>

export const VitalsSchema = z.object({
  id,
  patientId: id,
  recordedAt: isoDateTime,
  systolic: z.number().int().min(40).max(260).nullable(),
  diastolic: z.number().int().min(20).max(180).nullable(),
  heartRate: z.number().int().min(20).max(250).nullable(),
  temperatureC: z.number().min(30).max(45).nullable(),
  respiratoryRate: z.number().int().min(4).max(60).nullable(),
  spo2: z.number().int().min(50).max(100).nullable(),
  source: z.string().min(1),
})
export type Vitals = z.infer<typeof VitalsSchema>

export const LabResultSchema = z.object({
  id,
  patientId: id,
  name: z.string().min(1),
  value: z.union([z.number(), z.string()]).nullable(),
  unit: z.string(),
  referenceRange: z.string(),
  flag: LabFlag,
  status: LabStatus,
  collectedAt: isoDateTime,
})
export type LabResult = z.infer<typeof LabResultSchema>

export const ImagingSchema = z.object({
  id,
  patientId: id,
  modality: z.enum(['X-ray', 'CT', 'Ultrasound', 'MRI']),
  bodyArea: z.string().min(1),
  /** Who documented the request: never an AI decision. */
  requestSource: z.string().min(1),
  status: ImagingStatus,
  requestedAt: isoDateTime.nullable(),
  reportedAt: isoDateTime.nullable(),
  /** Fictional report text (synthetic). */
  report: z.string().nullable(),
  reviewStatus: ReviewStatus,
  linkedInjuryId: id.nullable(),
})
export type Imaging = z.infer<typeof ImagingSchema>

export const InjurySchema = z.object({
  id,
  patientId: id,
  anatomicalArea: z.string().min(1),
  description: z.string().min(1),
  dateReported: isoDate,
  severity: z.enum(['Minor', 'Moderate', 'Severe', 'Not documented']),
  /** Documented / clinician-entered X-ray status in the synthetic scenario. */
  xrayStatus: ImagingStatus,
  reviewStatus: ReviewStatus,
})
export type Injury = z.infer<typeof InjurySchema>

export const HistoryEntrySchema = z.object({
  condition: z.string().min(1),
  since: z.string().nullable(),
  notes: z.string().nullable(),
})

export const PatientSchema = z.object({
  id,
  synthetic: z.literal(true),
  fullName: z.string().min(1),
  dateOfBirth: isoDate,
  gender: Gender,
  bloodGroup: BloodGroup,
  phone: z.string().min(1),
  email: z.string().email(),
  address: AddressSchema,
  noKnownDrugAllergies: z.boolean(),
  allergies: z.array(AllergySchema),
  vitals: z.array(VitalsSchema),
  labResults: z.array(LabResultSchema),
  injuries: z.array(InjurySchema),
  imaging: z.array(ImagingSchema),
  history: z.array(HistoryEntrySchema),
  currentVisitStatus: VisitStatus,
  documentationStatus: DocumentationStatus,
  missingInformationFlags: z.array(z.string()),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type Patient = z.infer<typeof PatientSchema>

/* ---------------------------------------------------------------- rooms & admissions */

export const BedSchema = z.object({ id, label: z.string().min(1) })

export const RoomSchema = z.object({
  id,
  roomNumber: z.string().min(1),
  building: z.string().min(1),
  ward: z.string().min(1),
  floor: z.number().int(),
  type: RoomType,
  beds: z.array(BedSchema).min(1),
  capacity: z.number().int().min(1),
  availability: RoomAvailability,
  features: z.array(z.string()),
  updatedAt: isoDateTime,
})
export type Room = z.infer<typeof RoomSchema>

export const AssignmentHistoryEntrySchema = z.object({
  at: isoDateTime,
  action: z.enum(['assigned', 'transferred', 'released']),
  fromRoomId: id.nullable(),
  fromBedId: id.nullable(),
  toRoomId: id.nullable(),
  toBedId: id.nullable(),
  by: z.string().min(1),
  reason: z.string(),
})

export const AdmissionSchema = z.object({
  id,
  patientId: id,
  roomId: id,
  bedId: id,
  admittedAt: isoDateTime,
  dischargedAt: isoDateTime.nullable(),
  status: AdmissionStatus,
  riskCategory: RiskCategory,
  /** Documented emergency status — never inferred from AI output. */
  emergency: z.boolean(),
  notes: z.string(),
  responsibleClinician: z.string().nullable(),
  assignmentHistory: z.array(AssignmentHistoryEntrySchema),
  updatedAt: isoDateTime,
})
export type Admission = z.infer<typeof AdmissionSchema>

/* ---------------------------------------------------------------- medications */

export const MedicationSchema = z.object({
  id,
  patientId: id,
  visitId: id.nullable(),
  name: z.string().min(1),
  genericName: z.string().nullable(),
  medicationClass: z.string().nullable(),
  /** Documented values only. `null` renders as "Not documented" — never inferred. */
  dose: z.string().nullable(),
  route: z.string().nullable(),
  frequency: z.string().nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  status: MedicationStatus,
  indication: z.string().nullable(),
  safetyFlags: z.array(z.string()),
  prescriber: z.string().nullable(),
  source: MedicationSource,
  updatedAt: isoDateTime,
})
export type Medication = z.infer<typeof MedicationSchema>

export const MedicationEffectSchema = z.object({
  id,
  medicationId: id,
  patientId: id,
  category: EffectCategory,
  effect: z.string().min(1),
  reportedSymptoms: z.array(z.string()),
  severity: EffectSeverity,
  recordedAt: isoDate,
  source: z.string().min(1),
  reviewStatus: ReviewStatus,
  relatedAlert: z.string().nullable(),
  followUpStatus: FollowUpStatus,
})
export type MedicationEffect = z.infer<typeof MedicationEffectSchema>

/* ---------------------------------------------------------------- visits */

export const VisitSchema = z.object({
  id,
  patientId: id,
  visitAt: isoDateTime,
  type: VisitType,
  clinicianId: z.string().nullable(),
  clinicianName: z.string().nullable(),
  /** Original dictated or typed text, unmodified. */
  originalText: z.string(),
  structuredNote: StructuredNoteSchema.nullable(),
  safetyAudit: SafetyAuditSchema.nullable(),
  /** The exact final text the clinician reviewed and confirmed. */
  finalNote: z.string(),
  missingInformation: z.array(z.string()),
  safetyFindings: z.array(SafetyAlertSchema),
  discrepancies: z.array(z.string()),
  reviewStatus: NoteReviewStatus,
  provenance: z.object({ documentation: NoteProvenance, audit: NoteProvenance.nullable() }),
  saveConfirmedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type Visit = z.infer<typeof VisitSchema>

/* ---------------------------------------------------------------- doctors, authorization */

export const VoiceModelInfoSchema = z.object({
  type: z.literal('wespeaker-resnet34-voxceleb'),
  version: z.string(),
  dimensions: z.number().int(),
  threshold: z.number(),
})

export const DoctorProfileSchema = z.object({
  id,
  displayName: z.string().trim().min(1).max(60),
  clinicianId: z.string().regex(/^SYN-CLN-\d{4}$/),
  role: ProfileRole,
  enrollmentStatus: EnrollmentStatus,
  enrolledAt: isoDateTime,
  lastVerifiedAt: isoDateTime.nullable(),
  voiceModel: VoiceModelInfoSchema,
  /** Derived, L2-normalised speaker embedding (centroid). Never raw audio. */
  embedding: z.array(z.number()).min(16),
  sampleCount: z.number().int().min(3),
  enrollmentConsistency: z.number(),
  revokedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type DoctorProfile = z.infer<typeof DoctorProfileSchema>

export const AuthorizationSchema = z.object({
  id,
  profileId: id,
  permissions: z.array(Permission),
  /** Profile id of the owner who granted it, or 'initial-owner-setup'. */
  grantedBy: z.string().min(1),
  grantedAt: isoDateTime,
  revokedAt: isoDateTime.nullable(),
  revokedBy: z.string().nullable(),
  active: z.boolean(),
})
export type Authorization = z.infer<typeof AuthorizationSchema>

/* ---------------------------------------------------------------- activity */

export const ActivityEventSchema = z.object({
  id,
  at: isoDateTime,
  kind: ActivityKind,
  category: ActivityCategory,
  mode: ActivityMode,
  message: z.string().min(1).max(400),
  patientId: id.nullable(),
  profileId: id.nullable(),
  /** Small scalar details only — never raw audio, transcripts or secrets. */
  details: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).default({}),
})
export type ActivityEvent = z.infer<typeof ActivityEventSchema>

/* ---------------------------------------------------------------- settings */

export const SettingsSchema = z.object({
  verificationThreshold: z.number().min(0.4).max(0.85),
  ambiguityMargin: z.number().min(0).max(0.3),
  providerMode: z.enum(['hybrid', 'hermes', 'gemini', 'local']),
  ttsVoiceURI: z.string().nullable(),
  ttsRate: z.number().min(0.5).max(1.6),
  speechLang: z.string(),
  onboardingDismissed: z.boolean(),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  verificationThreshold: 0.5,
  ambiguityMargin: 0.08,
  providerMode: 'hybrid',
  ttsVoiceURI: null,
  ttsRate: 1,
  speechLang: 'en-US',
  onboardingDismissed: false,
}

export type Gender = z.infer<typeof Gender>
export type AdmissionStatus = z.infer<typeof AdmissionStatus>
export type RiskCategory = z.infer<typeof RiskCategory>
export type RoomAvailability = z.infer<typeof RoomAvailability>
export type ActivityKind = z.infer<typeof ActivityKind>
export type ActivityCategory = z.infer<typeof ActivityCategory>
export type Permission = z.infer<typeof Permission>
export type VisitType = z.infer<typeof VisitType>
