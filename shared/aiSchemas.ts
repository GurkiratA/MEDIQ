/**
 * Schemas for AI provider input/output. Shared by the browser and the Node
 * backend: every model response is treated as untrusted input and must pass
 * these validators before it is shown to a clinician.
 */
import { z } from 'zod'

export const ProviderIdSchema = z.enum(['hermes', 'gemini', 'local'])
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const ProviderModeSchema = z.enum(['hybrid', 'hermes', 'gemini', 'local'])
export type ProviderMode = z.infer<typeof ProviderModeSchema>

const shortText = z.string().trim().max(2000)
const textList = z.array(z.string().trim().min(1).max(500)).max(40)

export const MedicationMentionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dose: z.string().trim().max(80).nullable().default(null),
  route: z.string().trim().max(80).nullable().default(null),
  frequency: z.string().trim().max(120).nullable().default(null),
  duration: z.string().trim().max(80).nullable().default(null),
  status: z.enum(['proposed-in-draft', 'current', 'historical', 'unclear']).default('unclear'),
})
export type MedicationMention = z.infer<typeof MedicationMentionSchema>

export const SafetySeveritySchema = z.enum(['critical', 'high', 'moderate', 'low', 'info'])
export type SafetySeverity = z.infer<typeof SafetySeveritySchema>

export const SafetyAlertSchema = z.object({
  severity: SafetySeveritySchema,
  category: z.enum([
    'allergy-conflict',
    'contraindication',
    'interaction',
    'discrepancy',
    'missing-information',
    'medication-detail',
    'other',
  ]),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(1500),
  evidence: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  /** Always true: no alert is ever a verified clinical conclusion. */
  requiresClinicianReview: z.literal(true).default(true),
})
export type SafetyAlert = z.infer<typeof SafetyAlertSchema>

export const SoapSchema = z.object({
  subjective: shortText,
  objective: shortText,
  assessment: shortText,
  plan: shortText,
})

/** Model A (documentation) output. */
export const StructuredNoteSchema = z.object({
  summary: shortText,
  chiefComplaint: z.string().trim().max(300),
  soap: SoapSchema,
  reportedSymptoms: textList,
  relevantHistory: textList,
  medicationsMentioned: z.array(MedicationMentionSchema).max(30),
  allergiesMentioned: textList,
  documentedFindings: textList,
  followUpItems: textList,
  missingInformation: textList,
  discrepancies: textList,
  safetyAlerts: z.array(SafetyAlertSchema).max(20),
  reviewRequired: z.literal(true).default(true),
})
export type StructuredNote = z.infer<typeof StructuredNoteSchema>

/** Model B (independent safety audit) output. */
export const SafetyAuditSchema = z.object({
  overallRisk: z.enum(['critical', 'high', 'moderate', 'low', 'none-identified']),
  findings: z.array(SafetyAlertSchema).max(25),
  missingInformation: textList,
  contradictions: textList,
  reviewRequired: z.literal(true).default(true),
})
export type SafetyAudit = z.infer<typeof SafetyAuditSchema>

export const TranslationSchema = z.object({
  translatedText: z.string().trim().min(1).max(6000),
  targetLanguage: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(600).default(''),
})
export type Translation = z.infer<typeof TranslationSchema>

/**
 * The minimal, synthetic patient context sent to providers. Contact details
 * are deliberately excluded: providers never need them.
 */
export const PatientContextSchema = z.object({
  patientId: z.string().min(1).max(20),
  synthetic: z.literal(true),
  age: z.number().int().min(0).max(130).nullable(),
  gender: z.string().max(40),
  allergies: z.array(
    z.object({
      substance: z.string().max(120),
      substanceClass: z.string().max(120).nullable(),
      reaction: z.string().max(200),
      severity: z.string().max(40),
      status: z.string().max(40),
    }),
  ),
  medications: z.array(
    z.object({
      name: z.string().max(120),
      genericName: z.string().max(120).nullable(),
      medicationClass: z.string().max(120).nullable(),
      dose: z.string().max(80).nullable(),
      route: z.string().max(80).nullable(),
      frequency: z.string().max(120).nullable(),
      status: z.string().max(40),
    }),
  ),
  history: z.array(z.string().max(300)),
  latestVitals: z
    .object({
      recordedAt: z.string(),
      bloodPressure: z.string().nullable(),
      heartRate: z.number().nullable(),
      temperatureC: z.number().nullable(),
    })
    .nullable(),
})
export type PatientContext = z.infer<typeof PatientContextSchema>

export const DocumentRequestSchema = z.object({
  noteText: z.string().trim().min(1).max(8000),
  patient: PatientContextSchema,
})
export type DocumentRequest = z.infer<typeof DocumentRequestSchema>

export const AuditRequestSchema = z.object({
  noteText: z.string().trim().min(1).max(8000),
  draft: StructuredNoteSchema.nullable(),
  patient: PatientContextSchema,
})
export type AuditRequest = z.infer<typeof AuditRequestSchema>

export const TranslateRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  targetLanguage: z.string().trim().min(2).max(60),
})
export type TranslateRequest = z.infer<typeof TranslateRequestSchema>

/** Envelope every AI route returns. `provider` names who actually produced the result. */
export interface ProviderResult<T> {
  ok: boolean
  provider: ProviderId
  model: string | null
  latencyMs: number
  data: T | null
  error: string | null
}

export interface ProviderStatus {
  id: Exclude<ProviderId, 'local'>
  label: string
  configured: boolean
  model: string | null
  baseUrlHost: string | null
  /** Human-readable note, e.g. "model id does not look like Hermes". */
  note: string | null
  keySource: 'env' | 'session' | null
}

export interface ProvidersResponse {
  providers: ProviderStatus[]
  serverTime: string
}

/**
 * Extracts and validates the first JSON object in a model's text response.
 * Models sometimes wrap JSON in prose or code fences; anything that does not
 * validate is rejected rather than repaired.
 */
export function parseModelJson<T>(raw: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  const text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return { ok: false, error: 'Response did not contain a JSON object.' }
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return { ok: false, error: 'Response JSON could not be parsed.' }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { ok: false, error: `Response failed schema validation at "${issue?.path.join('.') || '(root)'}": ${issue?.message ?? 'invalid'}` }
  }
  return { ok: true, data: result.data }
}
