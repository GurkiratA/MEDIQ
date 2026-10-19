import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } from 'node:fs'
import { SEED_PATIENTS, SEED_ROOMS, SEED_MEDICATIONS, SEED_USERS } from './mediq-seed.mjs'

/**
 * MEDIQ — the clinical layer.
 *
 * Four registers live in one JSON file: patients (the main schema), rooms
 * (Database A), medications (Database B) and the users allowed to sign
 * changes. Alongside them, a queue of pending changes and an audit log.
 *
 * The one rule that shapes everything here: the model can READ freely and can
 * PROPOSE, but it cannot write. Every change it drafts — a SOAP note, a new
 * prescription, a room move — lands in the pending queue and is only applied
 * when a clinician presses Confirm on the dashboard. That decision arrives
 * over the WebSocket from the page (see `handle` below), never through a tool,
 * so there is no sequence of tool calls by which the model commits its own
 * draft. Role checks run again at that moment, against whoever is signed in,
 * which makes the confirm click the authoritative gate rather than the
 * proposal.
 *
 * Stored outside the repo (~/.mediq/db.json, or MEDIQ_DB) so patient data
 * never ends up in a commit. Seeded from mediq-seed.mjs on first run; delete
 * the file to reseed.
 */

const DB_PATH = process.env.MEDIQ_DB ?? join(homedir(), '.mediq', 'db.json')
const VOICE_DIR = join(homedir(), '.mediq-voice')

const ok = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }],
})
const refuse = (text) => ({ isError: true, content: [{ type: 'text', text }] })

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let db = null

function seed() {
  const rooms = SEED_ROOMS.map((r) => ({ ...r, patientId: null }))
  for (const p of SEED_PATIENTS) {
    if (!p.admitted) continue
    const room = rooms.find((r) => r.number === p.admission.room)
    if (room) {
      room.patientId = p.id
      room.status = 'occupied'
    }
  }
  return {
    version: 1,
    patients: SEED_PATIENTS.map((p) => ({ ...p, notes: [] })),
    rooms,
    medications: SEED_MEDICATIONS,
    users: SEED_USERS,
    pending: [],
    audit: [{ at: new Date().toISOString(), by: 'system', action: 'Database seeded with demonstration records' }],
  }
}

function load() {
  if (db) return db
  try {
    if (existsSync(DB_PATH)) {
      db = JSON.parse(readFileSync(DB_PATH, 'utf8'))
      return db
    }
  } catch (err) {
    console.error(`[mediq] could not read ${DB_PATH}, reseeding:`, err?.message ?? err)
  }
  db = seed()
  save()
  console.log(`[mediq] seeded clinical database at ${DB_PATH}`)
  return db
}

/** Written to a temp file and renamed over, so a crash mid-write never leaves
 *  half a database behind. Owner-only permissions: this is patient data. */
function save() {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const tmp = `${DB_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 })
  renameSync(tmp, DB_PATH)
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10)

function ageOf(dob) {
  const b = new Date(dob)
  const n = new Date()
  let age = n.getFullYear() - b.getFullYear()
  const m = n.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--
  return age
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function medRef(name) {
  const meds = load().medications
  const q = norm(name)
  if (!q) return null
  return (
    meds.find((m) => norm(m.name) === q) ??
    meds.find((m) => norm(m.name).startsWith(q) || q.startsWith(norm(m.name))) ??
    meds.find((m) => norm(m.name).includes(q) || q.includes(norm(m.name).split(' ')[0])) ??
    null
  )
}

/**
 * Pairwise interaction alerts across a list of drug names. Read off both sides
 * of each pair and deduplicated, so an interaction recorded on only one entry
 * still fires.
 */
function interactionsAmong(names) {
  const refs = names.map((n) => medRef(n)).filter(Boolean)
  const seen = new Set()
  const out = []
  for (const a of refs) {
    for (const hit of a.interacts ?? []) {
      const b = refs.find((r) => r.name === hit.with)
      if (!b || b === a) continue
      const key = [a.name, b.name].sort().join(' + ')
      if (seen.has(key)) continue
      seen.add(key)
      const back = b.interacts?.find((x) => x.with === a.name)
      const level = hit.level === 'major' || back?.level === 'major' ? 'major' : 'moderate'
      out.push({ type: 'interaction', level, drugs: key, note: hit.note })
    }
  }
  return out
}

/**
 * Allergy cross-checks. Exact class matches are contraindications; the one
 * clinically important cross-reactivity — penicillin allergy against a
 * cephalosporin — is raised as a caution, because the real risk is low
 * (around 1–2%) but depends on what the reaction was.
 */
function allergyConflicts(patient, names) {
  const out = []
  for (const name of names) {
    const ref = medRef(name)
    if (!ref) continue
    for (const allergy of patient.allergies ?? []) {
      const cls = allergy.class
      if (!cls) continue
      if (ref.allergyClass?.includes(cls)) {
        out.push({
          type: 'allergy',
          severity: 'contraindicated',
          drug: ref.name,
          note: `${patient.name} has a recorded ${allergy.substance} allergy (${allergy.reaction}); ${ref.name} is ${ref.class}.`,
        })
      } else if (cls === 'penicillin' && ref.allergyClass?.includes('cephalosporin')) {
        out.push({
          type: 'allergy',
          severity: 'caution',
          drug: ref.name,
          note: `Penicillin allergy (${allergy.reaction}) — low cross-reactivity with ${ref.name}; avoid if the reaction was anaphylaxis.`,
        })
      }
    }
  }
  return out
}

function labAlerts(patient) {
  return (patient.labs ?? [])
    .filter((l) => l.flag === 'critical')
    .map((l) => ({ type: 'lab', note: `Critical ${l.test}: ${l.value}` }))
}

function alertsFor(patient) {
  const names = (patient.medications ?? []).map((m) => m.name)
  return [...allergyConflicts(patient, names), ...interactionsAmong(names), ...labAlerts(patient)]
}

function publicPatient(p) {
  const d = load()
  const room = p.admitted ? d.rooms.find((r) => r.patientId === p.id) : null
  return {
    ...p,
    age: ageOf(p.dob),
    admission: p.admitted && p.admission ? { ...p.admission, room: room?.number ?? p.admission.room } : null,
    alerts: alertsFor(p),
  }
}

function findPatient(ref) {
  const d = load()
  const q = norm(ref)
  if (!q) return { error: 'No patient named.' }
  const byId = d.patients.find((p) => norm(p.id) === q || norm(p.id).replace(' ', '') === q.replace(' ', ''))
  if (byId) return { patient: byId }
  const matches = d.patients.filter((p) => norm(p.name).includes(q) || q.split(' ').every((w) => norm(p.name).includes(w)))
  if (matches.length === 1) return { patient: matches[0] }
  if (matches.length > 1) {
    return { error: `Ambiguous — ${matches.map((m) => `${m.name} (${m.id})`).join(', ')}. Ask which one.` }
  }
  return { error: `No patient matching "${ref}".` }
}

function dashboard() {
  const d = load()
  const patients = d.patients.map(publicPatient)
  const admitted = patients.filter((p) => p.admitted)
  const beds = d.rooms.filter((r) => r.status !== 'maintenance')
  const urgent = []
  for (const p of patients) {
    if (p.admitted && p.admission?.riskLevel === 'High') {
      urgent.push({ patient: p.name, id: p.id, room: p.admission.room, note: `High risk — ${p.severity}` })
    }
    for (const a of p.alerts) {
      // Only what needs acting on: contraindications, critical labs and major
      // interactions. Expected combinations stay on the chart.
      if (a.type === 'allergy' && a.severity !== 'contraindicated') continue
      if (a.type === 'interaction' && a.level !== 'major') continue
      urgent.push({ patient: p.name, id: p.id, note: a.type === 'interaction' ? `${a.drugs} — ${a.note}` : a.note })
    }
  }
  return {
    totalPatients: patients.length,
    admitted: admitted.length,
    outpatients: patients.length - admitted.length,
    bySeverity: ['Critical', 'Severe', 'Moderate', 'Mild'].map((s) => ({
      severity: s,
      count: patients.filter((p) => p.severity === s).length,
    })),
    occupancy: {
      occupied: d.rooms.filter((r) => r.status === 'occupied').length,
      available: d.rooms.filter((r) => r.status === 'available').length,
      cleaning: d.rooms.filter((r) => r.status === 'cleaning').length,
      maintenance: d.rooms.filter((r) => r.status === 'maintenance').length,
      usableBeds: beds.length,
    },
    urgentAlerts: urgent,
    pendingConfirmations: d.pending.length,
  }
}

function voiceProfiles() {
  try {
    return readdirSync(VOICE_DIR).filter((f) => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Changes — proposal, permission, application
// ---------------------------------------------------------------------------

/**
 * Role-based access. Checked twice: at proposal so the model can tell the
 * user straight away, and at confirmation against whoever actually signs —
 * the second check is the one that counts.
 */
const PERMISSIONS = {
  doctor: new Set([
    'soap_note', 'visit_summary', 'prescription_add', 'prescription_stop', 'prescription_change',
    'lab_result', 'clinical_update', 'allergy_add', 'contact_update', 'admit', 'discharge',
    'room_assign', 'register_patient',
  ]),
  nurse: new Set(['soap_note', 'visit_summary', 'lab_result', 'room_assign']),
  admin: new Set(['contact_update', 'room_assign', 'admit', 'discharge', 'register_patient']),
}

const CHANGE_KINDS = [
  'soap_note', 'visit_summary', 'prescription_add', 'prescription_stop', 'prescription_change',
  'lab_result', 'clinical_update', 'allergy_add', 'contact_update', 'admit', 'discharge',
  'room_assign', 'register_patient',
]

const CLINICAL_FIELDS = {
  severity: ['Critical', 'Severe', 'Moderate', 'Mild'],
  injuries: null,
  xrayNeeded: null,
  xrayDetail: null,
  riskLevel: ['High', 'Moderate', 'Low'],
  emergencyProtocol: null,
}

const CONTACT_FIELDS = ['phone', 'email', 'address']

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/**
 * Validates a proposal and renders it for a human. Returns either an error
 * message for the model or { summary, warnings } for the confirmation card.
 * Nothing is mutated here.
 */
function describeChange(kind, patient, payload) {
  const d = load()
  const p = payload ?? {}
  switch (kind) {
    case 'soap_note': {
      const parts = ['subjective', 'objective', 'assessment', 'plan']
      const missing = parts.filter((k) => !str(p[k]))
      if (missing.length) return { error: `SOAP note needs ${missing.join(', ')}.` }
      return { summary: `Add SOAP note to ${patient.name}'s record and set it as the latest clinician note.` }
    }
    case 'visit_summary':
      if (!str(p.summary)) return { error: 'Visit summary needs `summary`.' }
      return { summary: `Add visit summary to ${patient.name}'s record.` }
    case 'prescription_add': {
      if (!str(p.name) || !str(p.dose)) return { error: 'prescription_add needs `name` and `dose`.' }
      const ref = medRef(p.name)
      const current = patient.medications.map((m) => m.name)
      const name = ref?.name ?? str(p.name)
      if (current.some((m) => norm(m) === norm(name))) {
        return { error: `${name} is already prescribed — use prescription_change.` }
      }
      const warnings = [
        ...allergyConflicts(patient, [name]),
        ...interactionsAmong([...current, name]).filter((w) => w.drugs.includes(name)),
      ]
      if (!ref) warnings.push({ type: 'reference', note: `${name} is not in the medication reference; no interaction screening possible.` })
      return { summary: `Prescribe ${name} ${str(p.dose)} for ${patient.name}.`, warnings }
    }
    case 'prescription_stop': {
      const hit = patient.medications.find((m) => norm(m.name).includes(norm(p.name)))
      if (!hit) return { error: `${patient.name} is not on "${p.name}".` }
      return { summary: `Discontinue ${hit.name} (${hit.dose}) for ${patient.name}.` }
    }
    case 'prescription_change': {
      const hit = patient.medications.find((m) => norm(m.name).includes(norm(p.name)))
      if (!hit) return { error: `${patient.name} is not on "${p.name}".` }
      if (!str(p.dose)) return { error: 'prescription_change needs the new `dose`.' }
      return { summary: `Change ${hit.name} for ${patient.name}: ${hit.dose} → ${str(p.dose)}.` }
    }
    case 'lab_result': {
      if (!str(p.test) || !str(p.value)) return { error: 'lab_result needs `test` and `value` (and optionally `flag`).' }
      const flag = ['normal', 'high', 'low', 'critical', 'pending'].includes(p.flag) ? p.flag : 'normal'
      return { summary: `Record ${str(p.test)} = ${str(p.value)} [${flag}] for ${patient.name}.` }
    }
    case 'clinical_update': {
      const field = str(p.field)
      if (!(field in CLINICAL_FIELDS)) {
        return { error: `clinical_update field must be one of ${Object.keys(CLINICAL_FIELDS).join(', ')}.` }
      }
      const allowed = CLINICAL_FIELDS[field]
      if (allowed && !allowed.includes(str(p.value))) return { error: `${field} must be one of ${allowed.join(', ')}.` }
      if ((field === 'riskLevel' || field === 'emergencyProtocol') && !patient.admitted) {
        return { error: `${field} only applies to admitted patients.` }
      }
      return { summary: `Update ${patient.name}'s ${field} to "${str(p.value)}".` }
    }
    case 'allergy_add':
      if (!str(p.substance)) return { error: 'allergy_add needs `substance` (and `reaction`, optional `class`).' }
      return { summary: `Add allergy to ${patient.name}: ${str(p.substance)} — ${str(p.reaction) || 'reaction not recorded'}.` }
    case 'contact_update':
      if (!CONTACT_FIELDS.includes(str(p.field)) || !str(p.value)) {
        return { error: `contact_update needs \`field\` (${CONTACT_FIELDS.join(', ')}) and \`value\`.` }
      }
      return { summary: `Change ${patient.name}'s ${str(p.field)} to "${str(p.value)}".` }
    case 'admit': {
      if (patient.admitted) return { error: `${patient.name} is already admitted.` }
      const room = d.rooms.find((r) => norm(r.number) === norm(p.room))
      if (!room) return { error: `No room "${p.room}". Available: ${d.rooms.filter((r) => r.status === 'available').map((r) => r.number).join(', ')}.` }
      if (room.status !== 'available') return { error: `${room.number} is ${room.status}.` }
      if (!['High', 'Moderate', 'Low'].includes(str(p.riskLevel))) return { error: 'admit needs `riskLevel` (High, Moderate, Low).' }
      if (!str(p.emergencyProtocol)) return { error: 'admit needs `emergencyProtocol`.' }
      return { summary: `Admit ${patient.name} to ${room.number} (${room.unit}), ${p.riskLevel} risk.` }
    }
    case 'discharge':
      if (!patient.admitted) return { error: `${patient.name} is not admitted.` }
      return { summary: `Discharge ${patient.name} and release ${patient.admission?.room}.` }
    case 'room_assign': {
      if (!patient.admitted) return { error: `${patient.name} is not admitted — use admit.` }
      const room = d.rooms.find((r) => norm(r.number) === norm(p.room))
      if (!room) return { error: `No room "${p.room}".` }
      if (room.status !== 'available') return { error: `${room.number} is ${room.status}.` }
      return { summary: `Move ${patient.name} from ${patient.admission.room} to ${room.number} (${room.unit}).` }
    }
    default:
      return { error: `Unknown change kind "${kind}".` }
  }
}

const REGISTER_FIELDS = ['name', 'dob', 'gender', 'bloodGroup']

function describeRegistration(p) {
  const missing = REGISTER_FIELDS.filter((k) => !str(p?.[k]))
  if (missing.length) return { error: `register_patient needs ${missing.join(', ')} (plus optional phone, email, address, injuries, severity).` }
  if (Number.isNaN(Date.parse(p.dob))) return { error: 'dob must be YYYY-MM-DD.' }
  return { summary: `Register new patient ${str(p.name)}, born ${str(p.dob)}, ${str(p.gender)}, blood group ${str(p.bloodGroup)}.` }
}

function nextPatientId() {
  const n = Math.max(1000, ...load().patients.map((p) => Number(p.id.split('-')[1]) || 0))
  return `P-${n + 1}`
}

function applyChange(change, signer) {
  const d = load()
  const p = change.payload ?? {}
  const by = `${signer.name} (${signer.role})`
  if (change.kind === 'register_patient') {
    const id = nextPatientId()
    d.patients.push({
      id,
      name: str(p.name),
      dob: str(p.dob),
      bloodGroup: str(p.bloodGroup),
      gender: str(p.gender),
      phone: str(p.phone),
      email: str(p.email),
      address: str(p.address),
      allergies: [],
      medications: [],
      severity: CLINICAL_FIELDS.severity.includes(p.severity) ? p.severity : 'Mild',
      injuries: str(p.injuries) || 'Not yet assessed',
      xray: { needed: false, detail: 'Not yet assessed.' },
      labs: [],
      lastNote: '',
      lastVisit: today(),
      admitted: false,
      admission: null,
      notes: [],
    })
    return id
  }

  const patient = d.patients.find((x) => x.id === change.patientId)
  if (!patient) throw new Error('Patient no longer exists.')
  patient.notes ??= []

  switch (change.kind) {
    case 'soap_note': {
      const text = `S: ${str(p.subjective)}\nO: ${str(p.objective)}\nA: ${str(p.assessment)}\nP: ${str(p.plan)}`
      patient.notes.unshift({ at: new Date().toISOString(), type: 'SOAP', text, by })
      patient.lastNote = text
      patient.lastVisit = today()
      break
    }
    case 'visit_summary':
      patient.notes.unshift({ at: new Date().toISOString(), type: 'Visit summary', text: str(p.summary), by })
      patient.lastVisit = today()
      break
    case 'prescription_add':
      patient.medications.push({ name: medRef(p.name)?.name ?? str(p.name), dose: str(p.dose) })
      break
    case 'prescription_stop': {
      const i = patient.medications.findIndex((m) => norm(m.name).includes(norm(p.name)))
      if (i >= 0) patient.medications.splice(i, 1)
      break
    }
    case 'prescription_change': {
      const m = patient.medications.find((x) => norm(x.name).includes(norm(p.name)))
      if (m) m.dose = str(p.dose)
      break
    }
    case 'lab_result': {
      const flag = ['normal', 'high', 'low', 'critical', 'pending'].includes(p.flag) ? p.flag : 'normal'
      const existing = patient.labs.find((l) => norm(l.test) === norm(p.test))
      if (existing) Object.assign(existing, { value: str(p.value), flag })
      else patient.labs.push({ test: str(p.test), value: str(p.value), flag })
      break
    }
    case 'clinical_update': {
      const field = str(p.field)
      if (field === 'xrayNeeded') patient.xray.needed = /^(true|yes|1)$/i.test(str(p.value))
      else if (field === 'xrayDetail') patient.xray.detail = str(p.value)
      else if (field === 'riskLevel' || field === 'emergencyProtocol') patient.admission[field] = str(p.value)
      else patient[field] = str(p.value)
      break
    }
    case 'allergy_add':
      patient.allergies.push({ substance: str(p.substance), reaction: str(p.reaction) || 'Not recorded', class: str(p.class).toLowerCase() || null })
      break
    case 'contact_update':
      patient[str(p.field)] = str(p.value)
      break
    case 'admit': {
      const room = d.rooms.find((r) => norm(r.number) === norm(p.room))
      if (!room || room.status !== 'available') throw new Error(`${p.room} is no longer available.`)
      room.status = 'occupied'
      room.patientId = patient.id
      patient.admitted = true
      patient.admission = { room: room.number, admittedOn: today(), riskLevel: str(p.riskLevel), emergencyProtocol: str(p.emergencyProtocol) }
      break
    }
    case 'discharge': {
      const room = d.rooms.find((r) => r.patientId === patient.id)
      if (room) Object.assign(room, { patientId: null, status: 'cleaning' })
      patient.admitted = false
      patient.admission = null
      patient.notes.unshift({ at: new Date().toISOString(), type: 'Discharge', text: str(p.note) || 'Discharged.', by })
      break
    }
    case 'room_assign': {
      const to = d.rooms.find((r) => norm(r.number) === norm(p.room))
      if (!to || to.status !== 'available') throw new Error(`${p.room} is no longer available.`)
      const from = d.rooms.find((r) => r.patientId === patient.id)
      if (from) Object.assign(from, { patientId: null, status: 'cleaning' })
      Object.assign(to, { patientId: patient.id, status: 'occupied' })
      patient.admission.room = to.number
      break
    }
  }
  return patient.id
}

// ---------------------------------------------------------------------------
// Live connections
// ---------------------------------------------------------------------------

/** Every open dashboard, so a decision made in one tab shows in all. */
const sockets = new Set()

function snapshot(clinician) {
  const d = load()
  return {
    patients: d.patients.map(publicPatient),
    rooms: d.rooms,
    medications: d.medications,
    users: d.users,
    pending: d.pending,
    audit: d.audit.slice(-40).reverse(),
    dashboard: dashboard(),
    clinician,
    voiceProfiles: voiceProfiles(),
  }
}

function broadcast() {
  for (const c of sockets) c.push({ event: 'state', state: snapshot(c.clinician()) })
}

let pendingSeq = 0

// ---------------------------------------------------------------------------
// Tool descriptions
// ---------------------------------------------------------------------------

const PROPOSE_DESCRIPTION = `Stage a change to the clinical record for a clinician to confirm.

Nothing is written by this tool. The change appears on the MEDIQ dashboard as
a confirmation card, and is only committed when a signed-in clinician presses
Confirm. Tell the user it is awaiting their confirmation — never say it has been
saved.

kind and payload:
  soap_note          { subjective, objective, assessment, plan } — structure raw dictation into SOAP yourself first
  visit_summary      { summary } — 3–5 sentence encounter summary
  prescription_add   { name, dose }   (screened for allergy and interactions automatically)
  prescription_stop  { name }
  prescription_change{ name, dose }
  lab_result         { test, value, flag: normal|high|low|critical|pending }
  clinical_update    { field: severity|injuries|xrayNeeded|xrayDetail|riskLevel|emergencyProtocol, value }
  allergy_add        { substance, reaction, class? }  (class e.g. penicillin, nsaid, opioid, sulfonamide, contrast)
  contact_update     { field: phone|email|address, value }
  admit              { room, riskLevel: High|Moderate|Low, emergencyProtocol }
  discharge          { note? }
  room_assign        { room }
  register_patient   { name, dob YYYY-MM-DD, gender, bloodGroup, phone?, email?, address?, injuries?, severity? } (patient may be omitted)

Roles: doctors may propose anything; nurses notes, summaries, lab results and
room moves; admin staff contact details, admissions, discharges and rooms.`

// ---------------------------------------------------------------------------
// Per-connection surface
// ---------------------------------------------------------------------------

/**
 * One MEDIQ session per browser socket. `send` pushes a frame to that page.
 * Returns the MCP server for the agent, and `handle` for the page's own
 * messages — the only route by which a pending change is ever committed.
 */
export function mediqConnection(send) {
  load()
  let clinicianId = null
  const clinician = () => load().users.find((u) => u.id === clinicianId) ?? null
  const push = (frame) => send({ type: 'mediq', ...frame })
  const entry = { push, clinician }
  sockets.add(entry)

  const server = createSdkMcpServer({
    name: 'mediq',
    version: '1.0.0',
    instructions:
      'MEDIQ clinical databases. Read freely; every write goes through ' +
      'propose_record_change and waits for a clinician to confirm on screen.',
    alwaysLoad: true,
    tools: [
      tool(
        'mediq_overview',
        'Clinical dashboard snapshot: census, admissions, severity mix, bed occupancy, urgent alerts, and how many changes await confirmation.',
        {},
        async () => ok(dashboard()),
      ),

      tool(
        'find_patients',
        'Multi-parameter patient search across all registers. Every parameter is optional and they combine (AND). Returns a compact list; call get_patient_record for the full chart.',
        {
          query: z.string().optional().describe('Free text over name, ID, injuries, notes.'),
          admitted: z.boolean().optional(),
          severity: z.enum(['Critical', 'Severe', 'Moderate', 'Mild']).optional(),
          riskLevel: z.enum(['High', 'Moderate', 'Low']).optional(),
          bloodGroup: z.string().optional(),
          room: z.string().optional(),
          medication: z.string().optional(),
          allergy: z.string().optional(),
          xrayNeeded: z.boolean().optional(),
        },
        async (a) => {
          const has = (s, q) => norm(s).includes(norm(q))
          const hits = load()
            .patients.map(publicPatient)
            .filter((p) => {
              if (a.query) {
                const hay = [p.name, p.id, p.injuries, p.lastNote, p.gender].join(' ')
                if (!norm(a.query).split(' ').every((w) => has(hay, w))) return false
              }
              if (a.admitted !== undefined && p.admitted !== a.admitted) return false
              if (a.severity && p.severity !== a.severity) return false
              if (a.riskLevel && p.admission?.riskLevel !== a.riskLevel) return false
              if (a.bloodGroup && norm(p.bloodGroup) !== norm(a.bloodGroup)) return false
              if (a.room && !has(p.admission?.room, a.room)) return false
              if (a.medication && !p.medications.some((m) => has(m.name, a.medication))) return false
              if (a.allergy && !p.allergies.some((x) => has(x.substance, a.allergy) || has(x.class, a.allergy))) return false
              if (a.xrayNeeded !== undefined && p.xray.needed !== a.xrayNeeded) return false
              return true
            })
            .map((p) => ({
              id: p.id,
              name: p.name,
              age: p.age,
              gender: p.gender,
              severity: p.severity,
              admitted: p.admitted,
              room: p.admission?.room ?? null,
              riskLevel: p.admission?.riskLevel ?? null,
              injuries: p.injuries,
              alerts: p.alerts.length,
            }))
          return ok(hits.length ? hits : 'No patients match.')
        },
      ),

      tool(
        'get_patient_record',
        'The full chart for one patient — every MEDIQ schema field, the admission block if admitted, medication reference entries, active alerts, and recent notes.',
        { patient: z.string().describe('Patient ID (P-1001) or name.') },
        async ({ patient }) => {
          const { patient: p, error } = findPatient(patient)
          if (error) return refuse(error)
          const full = publicPatient(p)
          full.medications = full.medications.map((m) => {
            const ref = medRef(m.name)
            return ref ? { ...m, class: ref.class, monitoring: ref.monitoring } : m
          })
          full.notes = (full.notes ?? []).slice(0, 5)
          return ok(full)
        },
      ),

      tool(
        'get_room_board',
        'Database A — every room with unit, type, status (occupied, available, cleaning, maintenance) and the patient in it.',
        {},
        async () => {
          const d = load()
          return ok(
            d.rooms.map((r) => ({
              ...r,
              patient: r.patientId ? d.patients.find((p) => p.id === r.patientId)?.name ?? null : null,
            })),
          )
        },
      ),

      tool(
        'lookup_medication',
        'Database B — mechanism, indication, side effects, monitoring and known interactions for a drug, plus which patients are on it. Omit name to list every drug in the reference.',
        { name: z.string().optional() },
        async ({ name }) => {
          const d = load()
          if (!name) return ok(d.medications.map((m) => `${m.name} — ${m.class}`).join('\n'))
          const ref = medRef(name)
          if (!ref) return refuse(`"${name}" is not in the MEDIQ medication reference.`)
          const onIt = d.patients
            .filter((p) => p.medications.some((m) => m.name === ref.name))
            .map((p) => `${p.name} (${p.id})`)
          return ok({ ...ref, patientsOnIt: onIt })
        },
      ),

      tool(
        'check_interactions',
        'Drug-interaction and allergy screen for a patient — their current list, optionally with candidate drugs added. Use before suggesting or proposing any new prescription.',
        {
          patient: z.string(),
          add: z.array(z.string()).optional().describe('Candidate drugs to screen against the current list.'),
        },
        async ({ patient, add = [] }) => {
          const { patient: p, error } = findPatient(patient)
          if (error) return refuse(error)
          const names = [...p.medications.map((m) => m.name), ...add]
          const unknown = add.filter((n) => !medRef(n))
          return ok({
            patient: p.name,
            screened: names,
            allergyConflicts: allergyConflicts(p, names),
            interactions: interactionsAmong(names),
            notInReference: unknown,
            caveat: 'Screen covers the MEDIQ reference only; confirm against a full interaction database before prescribing.',
          })
        },
      ),

      tool('propose_record_change', PROPOSE_DESCRIPTION, {
        kind: z.enum(CHANGE_KINDS),
        patient: z.string().optional().describe('Patient ID or name. Omit only for register_patient.'),
        payload: z.record(z.string(), z.any()),
        rationale: z.string().optional().describe('One line on why, shown to the confirming clinician.'),
      }, async ({ kind, patient, payload, rationale }) => {
        const d = load()
        const who = clinician()
        let target = null
        let described
        if (kind === 'register_patient') {
          described = describeRegistration(payload)
        } else {
          const found = findPatient(patient)
          if (found.error) return refuse(found.error)
          target = found.patient
          described = describeChange(kind, target, payload)
        }
        if (described.error) return refuse(`Not staged: ${described.error}`)
        if (who && !PERMISSIONS[who.role]?.has(kind)) {
          return refuse(
            `Not staged: ${who.name} is signed in as ${who.role}, and ${who.role}s cannot make a ${kind.replace(/_/g, ' ')}. A doctor must sign in to propose it.`,
          )
        }
        const change = {
          id: `C-${Date.now().toString(36)}-${++pendingSeq}`,
          kind,
          patientId: target?.id ?? null,
          patientName: target?.name ?? str(payload?.name),
          payload,
          rationale: str(rationale),
          summary: described.summary,
          warnings: described.warnings ?? [],
          draftedFor: who ? `${who.name} (${who.role})` : 'no clinician signed in',
          createdAt: new Date().toISOString(),
        }
        d.pending.push(change)
        save()
        broadcast()
        push({ event: 'open', view: 'pending' })
        return ok(
          `Staged ${change.id}: ${change.summary}` +
            (change.warnings.length ? ` WARNINGS: ${change.warnings.map((w) => w.note).join(' | ')}` : '') +
            ' It is NOT saved — it is waiting on the dashboard for a clinician to press Confirm.' +
            (who ? '' : ' No clinician is signed in on the dashboard yet; one must sign in to confirm.'),
        )
      }),

      tool(
        'list_pending_changes',
        'Changes awaiting clinician confirmation, plus the most recent confirmed or rejected decisions from the audit log.',
        {},
        async () => {
          const d = load()
          return ok({
            pending: d.pending.map((c) => ({ id: c.id, summary: c.summary, warnings: c.warnings.length })),
            recentDecisions: d.audit.slice(-8).reverse(),
          })
        },
      ),

      tool(
        'list_clinicians',
        'Authorised users and their roles, who is signed in on the dashboard, and whether voice biometrics are enrolled.',
        {},
        async () =>
          ok({
            users: load().users,
            signedIn: clinician(),
            enrolledVoiceProfiles: voiceProfiles(),
          }),
      ),

      tool(
        'show_dashboard',
        'Open the MEDIQ dashboard on screen at a given view, optionally focused on one patient. Use this whenever the user asks to see records, rooms, medications or pending changes.',
        {
          view: z.enum(['overview', 'patients', 'rooms', 'medications', 'pending', 'audit']),
          patient: z.string().optional(),
        },
        async ({ view, patient }) => {
          let patientId = null
          if (patient) {
            const found = findPatient(patient)
            if (found.error) return refuse(found.error)
            patientId = found.patient.id
          }
          push({ event: 'open', view, patientId })
          return ok('Shown.')
        },
      ),

      tool(
        'close_dashboard',
        'Hide the MEDIQ dashboard.',
        {},
        async () => {
          push({ event: 'close' })
          return ok('Hidden.')
        },
      ),

      tool(
        'speak_translation',
        'Read text aloud in another language for a patient or handoff. YOU translate the text first; this only speaks it with a native voice and shows it on screen. Use a BCP-47 tag, e.g. es-ES, hi-IN, zh-CN, ar-SA, fr-FR.',
        {
          language: z.string().describe('BCP-47 language tag.'),
          text: z.string().describe('The already-translated text.'),
          original: z.string().optional().describe('The English original, shown alongside.'),
        },
        async ({ language, text, original }) => {
          push({ event: 'speak', language, text, original: original ?? '' })
          return ok('Spoken on the interface. Do not repeat it aloud yourself.')
        },
      ),
    ],
  })

  /** Messages from the page itself. */
  function handle(msg) {
    if (msg.op === 'state') {
      push({ event: 'state', state: snapshot(clinician()) })
      return
    }
    if (msg.op === 'session') {
      const user = load().users.find((u) => u.id === msg.clinicianId)
      clinicianId = user ? user.id : null
      if (user) {
        load().audit.push({ at: new Date().toISOString(), by: `${user.name} (${user.role})`, action: 'Signed in to MEDIQ' })
        save()
      }
      push({ event: 'state', state: snapshot(clinician()) })
      return
    }
    if (msg.op === 'decide') {
      const d = load()
      const i = d.pending.findIndex((c) => c.id === msg.id)
      if (i < 0) return push({ event: 'notice', level: 'warn', text: 'That change is no longer pending.' })
      const who = clinician()
      if (!who) return push({ event: 'notice', level: 'warn', text: 'Sign in as a clinician before confirming.' })
      const change = d.pending[i]
      if (msg.decision === 'confirm' && !PERMISSIONS[who.role]?.has(change.kind)) {
        return push({
          event: 'notice',
          level: 'error',
          text: `${who.role}s cannot confirm a ${change.kind.replace(/_/g, ' ')}.`,
        })
      }
      d.pending.splice(i, 1)
      const by = `${who.name} (${who.role})`
      if (msg.decision === 'confirm') {
        try {
          applyChange(change, who)
          d.audit.push({ at: new Date().toISOString(), by, action: `CONFIRMED ${change.id}: ${change.summary}` })
          push({ event: 'notice', level: 'ok', text: 'Committed to the record.' })
        } catch (err) {
          d.audit.push({ at: new Date().toISOString(), by, action: `FAILED ${change.id}: ${err.message}` })
          push({ event: 'notice', level: 'error', text: `Not committed: ${err.message}` })
        }
      } else {
        d.audit.push({ at: new Date().toISOString(), by, action: `REJECTED ${change.id}: ${change.summary}` })
        push({ event: 'notice', level: 'ok', text: 'Draft discarded.' })
      }
      save()
      broadcast()
    }
  }

  return {
    server,
    handle,
    close: () => sockets.delete(entry),
  }
}
