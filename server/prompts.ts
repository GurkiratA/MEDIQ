/**
 * Prompts and response schemas for the two independent AI roles.
 * Both prompts forbid inventing facts, diagnosing, prescribing or
 * recommending alternative medications/doses. All outputs are re-validated
 * with Zod (shared/aiSchemas.ts) before they reach the browser.
 */
import type { AuditRequest, DocumentRequest, TranslateRequest } from '../shared/aiSchemas'

const BOUNDARIES = `
CONTEXT: You are part of MEDIQ, a HACKATHON PROTOTYPE. All patient data is SYNTHETIC (fictional).
HARD RULES:
- Use ONLY information explicitly present in the note or the synthetic record. Never invent symptoms, medications, allergies, labs, history or vital signs.
- Undocumented information is "not documented", never a negative finding.
- Do not diagnose, prescribe, change treatment, or recommend any alternative medication or dose.
- Preserve uncertainty and conflicting statements; do not resolve them.
- Every safety concern is a POTENTIAL concern that requires qualified clinician review.
- Output a single JSON object only. No prose, no markdown.`

const ALERT_SHAPE = `{"severity":"critical|high|moderate|low|info","category":"allergy-conflict|contraindication|interaction|discrepancy|missing-information|medication-detail|other","title":string,"detail":string,"evidence":[string],"requiresClinicianReview":true}`

export function documentationPrompt(req: DocumentRequest) {
  const system = `You are the primary clinical DOCUMENTATION assistant (Model A). Your job is to organise a clinician's dictated or typed visit note into a structured SOAP draft.
${BOUNDARIES}
Return exactly this JSON shape:
{"summary":string,"chiefComplaint":string,"soap":{"subjective":string,"objective":string,"assessment":string,"plan":string},
"reportedSymptoms":[string],"relevantHistory":[string],
"medicationsMentioned":[{"name":string,"dose":string|null,"route":string|null,"frequency":string|null,"duration":string|null,"status":"proposed-in-draft|current|historical|unclear"}],
"allergiesMentioned":[string],"documentedFindings":[string],"followUpItems":[string],"missingInformation":[string],"discrepancies":[string],
"safetyAlerts":[${ALERT_SHAPE}],"reviewRequired":true}
For "assessment", restate only what the clinician wrote (e.g. "Clinician documents: ..."); if nothing is stated, write "Not documented".
List in "discrepancies" any explicit claim that conflicts with the synthetic record (e.g. allergy or medication differences).`
  const user = `SYNTHETIC PATIENT RECORD (JSON):\n${JSON.stringify(req.patient)}\n\nVISIT NOTE (verbatim):\n"""${req.noteText}"""`
  return { system, user }
}

export function auditPrompt(req: AuditRequest) {
  const system = `You are an INDEPENDENT medication-safety AUDITOR (Model B). Compare the visit note and the draft structured note against the synthetic patient record.
${BOUNDARIES}
Check, citing evidence from the record and note:
1. Medication–allergy conflicts, INCLUDING drug-class membership (e.g. a penicillin-class antibiotic such as amoxicillin versus a documented penicillin allergy).
2. Contradictions between the note, the draft and the record.
3. Missing information needed for a complete note (e.g. undocumented dose, route, frequency, duration, vitals).
4. Potentially inconsistent medication details.
Never recommend an alternative drug or dose. State that each finding requires qualified clinician review.
Return exactly this JSON shape:
{"overallRisk":"critical|high|moderate|low|none-identified","findings":[${ALERT_SHAPE}],"missingInformation":[string],"contradictions":[string],"reviewRequired":true}`
  const user = `SYNTHETIC PATIENT RECORD (JSON):\n${JSON.stringify(req.patient)}\n\nVISIT NOTE (verbatim):\n"""${req.noteText}"""\n\nDRAFT STRUCTURED NOTE (from a different model, may contain errors):\n${req.draft ? JSON.stringify(req.draft) : 'null (not available)'}`
  return { system, user }
}

export function translationPrompt(req: TranslateRequest) {
  const system = `You translate short clinical-communication texts for a HACKATHON PROTOTYPE that uses synthetic data.
Translate faithfully into the requested language. Do not add, remove or soften medical content. Do not add advice.
If a term is ambiguous, keep the original term in parentheses and mention it in "notes".
Return JSON only: {"translatedText":string,"targetLanguage":string,"notes":string}`
  const user = `Target language: ${req.targetLanguage}\nText:\n"""${req.text}"""`
  return { system, user }
}

/* JSON Schemas for Gemini structured output (subset of JSON Schema). */
const str = { type: 'string' }
const strList = { type: 'array', items: str }
const alert = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['critical', 'high', 'moderate', 'low', 'info'] },
    category: { type: 'string', enum: ['allergy-conflict', 'contraindication', 'interaction', 'discrepancy', 'missing-information', 'medication-detail', 'other'] },
    title: str,
    detail: str,
    evidence: strList,
    requiresClinicianReview: { type: 'boolean' },
  },
  required: ['severity', 'category', 'title', 'detail', 'evidence', 'requiresClinicianReview'],
}

export const structuredNoteJsonSchema = {
  type: 'object',
  properties: {
    summary: str,
    chiefComplaint: str,
    soap: { type: 'object', properties: { subjective: str, objective: str, assessment: str, plan: str }, required: ['subjective', 'objective', 'assessment', 'plan'] },
    reportedSymptoms: strList,
    relevantHistory: strList,
    medicationsMentioned: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: str,
          dose: { type: ['string', 'null'] },
          route: { type: ['string', 'null'] },
          frequency: { type: ['string', 'null'] },
          duration: { type: ['string', 'null'] },
          status: { type: 'string', enum: ['proposed-in-draft', 'current', 'historical', 'unclear'] },
        },
        required: ['name', 'dose', 'route', 'frequency', 'duration', 'status'],
      },
    },
    allergiesMentioned: strList,
    documentedFindings: strList,
    followUpItems: strList,
    missingInformation: strList,
    discrepancies: strList,
    safetyAlerts: { type: 'array', items: alert },
    reviewRequired: { type: 'boolean' },
  },
  required: ['summary', 'chiefComplaint', 'soap', 'reportedSymptoms', 'relevantHistory', 'medicationsMentioned', 'allergiesMentioned', 'documentedFindings', 'followUpItems', 'missingInformation', 'discrepancies', 'safetyAlerts', 'reviewRequired'],
}

export const safetyAuditJsonSchema = {
  type: 'object',
  properties: {
    overallRisk: { type: 'string', enum: ['critical', 'high', 'moderate', 'low', 'none-identified'] },
    findings: { type: 'array', items: alert },
    missingInformation: strList,
    contradictions: strList,
    reviewRequired: { type: 'boolean' },
  },
  required: ['overallRisk', 'findings', 'missingInformation', 'contradictions', 'reviewRequired'],
}

export const translationJsonSchema = {
  type: 'object',
  properties: { translatedText: str, targetLanguage: str, notes: str },
  required: ['translatedText', 'targetLanguage', 'notes'],
}
