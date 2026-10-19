/**
 * Local deterministic documentation + safety rules. Used when no AI
 * provider is configured or a provider fails, and ALWAYS run as an
 * independent baseline safety net. Pure functions — no network, no model.
 *
 * It only reorganises text that is explicitly present. It does not
 * diagnose, prescribe or recommend alternatives.
 */
import type { MedicationMention, PatientContext, SafetyAlert, SafetyAudit, StructuredNote } from '../../shared/aiSchemas'
import { allergyClassKey, CLASSES, DRUGS, findDrugs } from './drugKnowledge'

const SYMPTOMS = [
  'fever', 'chills', 'cough', 'productive cough', 'dry cough', 'headache', 'facial pain', 'facial pressure', 'sinus pressure', 'nasal congestion',
  'congestion', 'runny nose', 'nasal discharge', 'sore throat', 'shortness of breath', 'breathlessness', 'wheeze', 'chest pain', 'palpitations',
  'nausea', 'vomiting', 'diarrhoea', 'diarrhea', 'abdominal pain', 'rash', 'itching', 'dizziness', 'fatigue', 'swelling', 'pain', 'earache',
  'toothache', 'loss of smell', 'urinary frequency', 'dysuria', 'back pain', 'joint pain',
]

const sentences = (t: string) =>
  t
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]

function isNegated(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 40), idx).toLowerCase()
  return /\b(no|denies|denied|without|negative for|not)\b[^.;,]*$/.test(before)
}

const DOSE = /(\d+(?:\.\d+)?\s?(?:mg|g|mcg|µg|micrograms?|units?|ml|mL|puffs?))\b/i
const FREQ =
  /\b(once daily|twice daily|three times (?:a |per )?daily|three times a day|four times daily|once a day|twice a day|daily|nightly|at night|every \d+ ?hours?|q\d+h|tid|bid|qid|qds|tds|od|prn|as needed)\b/i
const ROUTE = /\b(oral(?:ly)?|po|by mouth|iv|intravenous(?:ly)?|im|intramuscular(?:ly)?|subcutaneous(?:ly)?|sc|inhaled|topical(?:ly)?|sublingual)\b/i
const DURATION = /\b(?:for|x)\s?(\d+\s?(?:days?|weeks?|months?))\b/i

export function extractMedications(note: string, ctx: PatientContext): MedicationMention[] {
  const out: MedicationMention[] = []
  const current = new Set(ctx.medications.filter((m) => m.status === 'Active').map((m) => m.name.toLowerCase()))
  for (const s of sentences(note)) {
    for (const { name, index } of findDrugs(s)) {
      if (isNegated(s, index)) continue
      const after = s.slice(index, index + 120)
      const proposed = /\b(propos|plan|start|prescrib|draft|recommend|will give|consider|commence|begin|initiat)/i.test(s)
      const display = cap(name)
      if (out.some((m) => m.name.toLowerCase() === display.toLowerCase())) continue
      out.push({
        name: display,
        dose: after.match(DOSE)?.[1] ?? null,
        route: after.match(ROUTE)?.[1] ?? null,
        frequency: after.match(FREQ)?.[1] ?? null,
        duration: after.match(DURATION)?.[1] ?? null,
        status: proposed ? 'proposed-in-draft' : current.has(name) ? 'current' : 'unclear',
      })
    }
  }
  return out
}

function pick(ss: string[], re: RegExp) {
  return ss.filter((s) => re.test(s))
}

export function localDocument(noteText: string, ctx: PatientContext): StructuredNote {
  const ss = sentences(noteText)

  const cc = noteText.match(/\b(?:presents? with|presenting with|complains? of|c\/o|here for|reports?)\s+([^.;]+)/i)?.[1]?.trim()
  const symptoms: string[] = []
  const negatives: string[] = []
  for (const sym of [...SYMPTOMS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${sym}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(noteText))) {
      if (symptoms.some((x) => x.includes(sym)) || negatives.some((x) => x.includes(sym))) break
      if (isNegated(noteText, m.index)) negatives.push(sym)
      else symptoms.push(sym)
      break
    }
  }

  const meds = extractMedications(noteText, ctx)
  const allergiesMentioned = uniq([
    ...[...noteText.matchAll(/\ballerg(?:y|ic) to ([a-z\- ]+?)(?=[.,;]|\s+(?:and|with)\b|$)/gi)].map((m) => `Allergy to ${m[1]}`),
    ...(/\b(nkda|no known (?:drug )?allergies)\b/i.test(noteText) ? ['No known drug allergies (stated in note)'] : []),
  ])

  const vitals: string[] = []
  const bp = noteText.match(/\b(?:bp|blood pressure)\s*(?:of|is|:)?\s*(\d{2,3}\/\d{2,3})/i)
  if (bp) vitals.push(`Blood pressure ${bp[1]} mmHg (stated in note)`)
  const hr = noteText.match(/\b(?:hr|heart rate|pulse)\s*(?:of|is|:)?\s*(\d{2,3})/i)
  if (hr) vitals.push(`Heart rate ${hr[1]} bpm (stated in note)`)
  const temp = noteText.match(/\b(?:temp(?:erature)?|t)\s*(?:of|is|:)?\s*(\d{2}(?:\.\d)?)\s*°?\s*c\b/i)
  if (temp) vitals.push(`Temperature ${temp[1]} °C (stated in note)`)
  const spo2 = noteText.match(/\b(?:spo2|sats?|oxygen saturation)\s*(?:of|is|:)?\s*(\d{2,3})\s*%/i)
  if (spo2) vitals.push(`SpO₂ ${spo2[1]}% (stated in note)`)

  const exam = pick(ss, /\b(on examination|o\/e|exam(?:ination)? (?:shows|reveals)|tender(?:ness)?|erythema|swollen|auscultation|clear chest)\b/i)
  const history = uniq([...noteText.matchAll(/\b(?:history of|hx of|pmh:?|known)\s+([^.;,]+)/gi)].map((m) => cap(m[1].trim())))
  const followUp = pick(ss, /\b(follow[- ]?up|review in|recheck|re-check|return if|refer|safety[- ]net)\b/i)
  const assessment = pick(ss, /\b(assessment|impression|diagnos|consistent with|likely|suspect|presents with)\b/i)
  const plan = pick(ss, /\b(plan|propos|start|prescrib|recommend|will give|follow[- ]?up|refer|review in)\b/i)
  const subjective = pick(ss, /\b(presents?|complains?|reports?|states?|history|denies|c\/o|symptoms?)\b/i)
  const objective = [...vitals, ...exam]

  const missing: string[] = []
  for (const m of meds.filter((m) => m.status === 'proposed-in-draft' || m.status === 'unclear')) {
    if (!m.dose) missing.push(`Dose not documented for ${m.name}`)
    if (!m.route) missing.push(`Route not documented for ${m.name}`)
    if (!m.frequency) missing.push(`Frequency not documented for ${m.name}`)
    const cls = DRUGS[m.name.toLowerCase()]?.cls
    if (!m.duration && cls && ['penicillin', 'cephalosporin', 'sulfonamide', 'macrolide', 'tetracycline'].includes(cls)) missing.push(`Duration not documented for ${m.name}`)
  }
  if (!vitals.length) missing.push('Vital signs not documented in this note')
  if (!allergiesMentioned.length) missing.push('Allergy status not confirmed in this note')
  if (!exam.length) missing.push('Examination findings not documented')
  if (!followUp.length) missing.push('Follow-up plan not documented')

  const discrepancies: string[] = []
  const recordAllergies = ctx.allergies.filter((a) => a.status === 'Active')
  if (/\b(nkda|no known (?:drug )?allergies)\b/i.test(noteText) && recordAllergies.length)
    discrepancies.push(`Note states no known drug allergies, but the record documents: ${recordAllergies.map((a) => `${a.substance} (${a.severity})`).join(', ')}.`)
  for (const m of meds) {
    const rec = ctx.medications.find((r) => r.name.toLowerCase() === m.name.toLowerCase() && r.status === 'Active')
    if (rec && m.dose && rec.dose && m.dose.replace(/\s/g, '').toLowerCase() !== rec.dose.replace(/\s/g, '').toLowerCase())
      discrepancies.push(`${m.name} dose in note (${m.dose}) differs from the record (${rec.dose}).`)
  }
  for (const a of allergiesMentioned) {
    const sub = a.replace(/^Allergy to /, '').toLowerCase()
    if (a.startsWith('Allergy to') && !recordAllergies.some((r) => r.substance.toLowerCase().includes(sub) || sub.includes(r.substance.toLowerCase())))
      discrepancies.push(`Note mentions ${a.toLowerCase()}, which is not in the synthetic record.`)
  }

  const safetyAlerts = allergyConflicts(noteText, meds, ctx)
  const cleanCc = cc ? cap(cc.replace(/\.$/, '')) : ss[0]?.slice(0, 160) ?? 'Not documented'
  const lines = (xs: string[]) => (xs.length ? xs.join(' ') : 'Not documented')

  return {
    summary: `${cleanCc}.${meds.length ? ` Medications mentioned: ${meds.map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(' ')).join('; ')}.` : ''}${safetyAlerts.length ? ' Potential safety concern flagged for clinician review.' : ''}`,
    chiefComplaint: cleanCc,
    soap: {
      subjective: lines(subjective),
      objective: objective.length ? objective.join('; ') : 'Not documented',
      assessment: assessment.length ? `Clinician documents: ${assessment.join(' ')}` : 'Not documented',
      plan: lines(plan),
    },
    reportedSymptoms: symptoms.map(cap),
    relevantHistory: history,
    medicationsMentioned: meds,
    allergiesMentioned,
    documentedFindings: uniq([...vitals, ...exam, ...negatives.map((n) => `Negative (documented): ${n}`)]),
    followUpItems: followUp,
    missingInformation: uniq(missing),
    discrepancies: uniq(discrepancies),
    safetyAlerts,
    reviewRequired: true,
  }
}

/** Canonical critical warning text for a medication–allergy class conflict. */
export function criticalAllergyWarning(drug: string, patientId: string, allergy: PatientContext['allergies'][number]) {
  const anaphylaxis = /anaphyla/i.test(allergy.reaction)
  return (
    `CRITICAL SAFETY WARNING: The proposed ${drug.toLowerCase()} entry conflicts with Patient ${patientId}'s documented ` +
    `${allergy.severity.toLowerCase()} ${allergy.substance.toLowerCase()} allergy${anaphylaxis ? ' and history of anaphylaxis' : ` (${allergy.reaction.toLowerCase()})`}. ` +
    'Do not treat this draft as an approved prescription. Qualified clinician review is required before any medication decision.'
  )
}

function allergyConflicts(noteText: string, meds: MedicationMention[], ctx: PatientContext): SafetyAlert[] {
  const alerts: SafetyAlert[] = []
  for (const m of meds) {
    const drug = DRUGS[m.name.toLowerCase()]
    if (!drug) continue
    for (const a of ctx.allergies.filter((x) => x.status === 'Active')) {
      const aKey = allergyClassKey(a.substance, a.substanceClass)
      const quote = sentences(noteText).find((s) => s.toLowerCase().includes(m.name.toLowerCase())) ?? m.name
      const evidence = [
        `Record: ${a.substance} allergy — severity ${a.severity}, reaction ${a.reaction} (${a.status}).`,
        `Note: “${quote}”`,
        `Reference: ${m.name.toLowerCase()} is classified under ATC ${drug.atc} (${CLASSES[drug.cls]?.label ?? drug.cls}) — WHO ATC/DDD index.`,
      ]
      if (aKey && aKey === drug.cls) {
        const critical = a.severity === 'Severe' || /anaphyla/i.test(a.reaction)
        alerts.push({
          severity: critical ? 'critical' : 'high',
          category: 'allergy-conflict',
          title: `${m.name} conflicts with documented ${a.substance.toLowerCase()} allergy`,
          detail: critical
            ? criticalAllergyWarning(m.name, ctx.patientId, a)
            : `The ${m.name.toLowerCase()} entry belongs to the same drug class as the documented ${a.substance.toLowerCase()} allergy (${a.reaction}). Qualified clinician review is required before any medication decision.`,
          evidence,
          requiresClinicianReview: true,
        })
      } else if (aKey === 'penicillin' && drug.cls === 'cephalosporin') {
        alerts.push({
          severity: 'moderate',
          category: 'contraindication',
          title: `Possible beta-lactam cross-reactivity: ${m.name}`,
          detail: `A cephalosporin entry appears with a documented penicillin allergy. Cross-reactivity is possible; qualified clinician review is required.`,
          evidence,
          requiresClinicianReview: true,
        })
      }
    }
  }
  return alerts
}

export function localAudit(noteText: string, draft: StructuredNote | null, ctx: PatientContext): SafetyAudit {
  const base = localDocument(noteText, ctx)
  const meds = draft ? mergeMeds(base.medicationsMentioned, draft.medicationsMentioned) : base.medicationsMentioned
  const findings: SafetyAlert[] = [...allergyConflicts(noteText, meds, ctx)]

  // NSAID with documented asthma history.
  const asthma = ctx.history.some((h) => /asthma/i.test(h))
  for (const m of meds) {
    if (DRUGS[m.name.toLowerCase()]?.cls === 'nsaid' && asthma)
      findings.push({
        severity: 'moderate',
        category: 'contraindication',
        title: `NSAID entry with documented asthma: ${m.name}`,
        detail: 'An NSAID appears in the note for a patient with a documented asthma history. Flagged for qualified clinician review.',
        evidence: [`Record history: ${ctx.history.find((h) => /asthma/i.test(h))}`, `Note mentions ${m.name}.`],
        requiresClinicianReview: true,
      })
  }
  // Two anticoagulants (note + record).
  const anticoag = uniq([
    ...meds.filter((m) => DRUGS[m.name.toLowerCase()]?.cls === 'anticoagulant').map((m) => m.name.toLowerCase()),
    ...ctx.medications.filter((m) => m.status === 'Active' && DRUGS[m.name.toLowerCase()]?.cls === 'anticoagulant').map((m) => m.name.toLowerCase()),
  ])
  if (anticoag.length > 1)
    findings.push({
      severity: 'high',
      category: 'interaction',
      title: 'More than one anticoagulant across note and record',
      detail: `Entries for ${anticoag.join(' and ')} appear together. Potential duplicate anticoagulation — flagged for qualified clinician review.`,
      evidence: anticoag.map((a) => `Anticoagulant entry: ${a}`),
      requiresClinicianReview: true,
    })
  for (const d of base.discrepancies)
    findings.push({ severity: /allerg/i.test(d) ? 'high' : 'moderate', category: 'discrepancy', title: 'Note conflicts with the record', detail: d, evidence: [d], requiresClinicianReview: true })

  const order = ['critical', 'high', 'moderate', 'low', 'info'] as const
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
  const top = findings[0]?.severity
  return {
    overallRisk: top === 'critical' ? 'critical' : top === 'high' ? 'high' : top === 'moderate' ? 'moderate' : findings.length ? 'low' : 'none-identified',
    findings,
    missingInformation: base.missingInformation,
    contradictions: base.discrepancies,
    reviewRequired: true,
  }
}

function mergeMeds(a: MedicationMention[], b: MedicationMention[]): MedicationMention[] {
  const out = [...a]
  for (const m of b) if (!out.some((x) => x.name.toLowerCase() === m.name.toLowerCase())) out.push(m)
  return out
}

/** Formats a structured draft as editable plain text for the final note. */
export function draftToText(n: StructuredNote): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- Not documented')
  const meds = n.medicationsMentioned.length
    ? n.medicationsMentioned.map((m) => `- ${m.name}: dose ${m.dose ?? 'not documented'}, route ${m.route ?? 'not documented'}, frequency ${m.frequency ?? 'not documented'}, duration ${m.duration ?? 'not documented'} [${m.status}]`).join('\n')
    : '- None mentioned'
  return [
    `Chief complaint: ${n.chiefComplaint || 'Not documented'}`,
    '',
    `S: ${n.soap.subjective}`,
    `O: ${n.soap.objective}`,
    `A: ${n.soap.assessment}`,
    `P: ${n.soap.plan}`,
    '',
    'Medications mentioned (draft entries — not approved prescriptions):',
    meds,
    '',
    'Missing information:',
    list(n.missingInformation),
    '',
    'Follow-up:',
    list(n.followUpItems),
  ].join('\n')
}
