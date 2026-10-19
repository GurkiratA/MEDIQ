/**
 * Deterministic voice-command parser. Navigation never calls an LLM.
 * Input is a speech-recognition transcript (or typed text); output is a
 * typed intent. Unknown input maps to { type: 'unknown' } — never guessed.
 */
import type { ReportKind } from '../reports/reportKinds'

export type Command =
  | { type: 'show-dashboard' }
  | { type: 'show-patients' }
  | { type: 'open-patient'; patientId: string }
  | { type: 'show-allergies' }
  | { type: 'show-medications' }
  | { type: 'show-effects' }
  | { type: 'show-labs' }
  | { type: 'show-vitals' }
  | { type: 'show-rooms'; filter: 'all' | 'available' | 'occupied' }
  | { type: 'show-admissions' }
  | { type: 'start-note' }
  | { type: 'summarize' }
  | { type: 'read-summary' }
  | { type: 'stop-listening' }
  | { type: 'go-back' }
  | { type: 'next-tab' }
  | { type: 'previous-tab' }
  | { type: 'help' }
  | { type: 'open-report'; report: ReportKind }
  | { type: 'close-report'; all: boolean }
  | { type: 'resize-report'; direction: 'larger' | 'smaller' }
  | { type: 'scroll-report'; direction: 'up' | 'down' }
  | { type: 'unknown'; text: string }

export const COMMAND_HELP: { phrase: string; description: string }[] = [
  { phrase: 'Show the patient report / clinical summary', description: 'Floating clinical summary for the active patient' },
  { phrase: 'Display the latest visit note', description: 'Floating latest visit note' },
  { phrase: 'Bring up the medication report', description: 'Floating medication report' },
  { phrase: 'Open the lab report / vitals report', description: 'Floating labs or vitals' },
  { phrase: 'Make this report larger / smaller', description: 'Resize the front report' },
  { phrase: 'Scroll down / Scroll up', description: 'Scroll the front report' },
  { phrase: 'Close the report / Close all reports', description: 'Close floating reports' },
  { phrase: 'Show patients', description: 'Open the synthetic patient list' },
  { phrase: 'Open patient 104', description: 'Open a patient record by ID' },
  { phrase: 'Show allergies', description: 'Allergies for the active patient' },
  { phrase: 'Show medications', description: 'Medications for the active patient' },
  { phrase: 'Show medication effects', description: 'Documented medication effects' },
  { phrase: 'Show lab results', description: 'Labs for the active patient' },
  { phrase: 'Show rooms / Show available rooms', description: 'Room occupancy' },
  { phrase: 'Show admissions', description: 'Active and past admissions' },
  { phrase: 'Start a visit note', description: 'Open the note workflow for the active patient' },
  { phrase: 'Summarize this visit', description: 'Generate the structured draft (never saves)' },
  { phrase: 'Read that summary', description: 'Read the draft summary aloud' },
  { phrase: 'Next tab / Previous tab', description: 'Move between patient tabs' },
  { phrase: 'Go back', description: 'Return to the previous screen' },
  { phrase: 'Stop listening', description: 'Stop the microphone' },
  { phrase: 'Help', description: 'List available commands' },
]

/** Commands that act on "the active patient" and must not guess one. */
export function requiresPatient(c: Command): boolean {
  return ['show-allergies', 'show-labs', 'show-vitals', 'start-note', 'summarize', 'next-tab', 'previous-tab', 'open-report'].includes(c.type)
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', five: '5',
  six: '6', seven: '7', eight: '8', ate: '8', nine: '9',
}
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

/** Extracts a patient number from "104", "one oh four", "one zero four" or "one hundred (and) four". */
export function extractPatientNumber(text: string): string | null {
  const digits = text.match(/\b(\d{2,4})\b/)
  if (digits) return digits[1]
  const words = text.split(/\s+/)
  const idx = words.findIndex((w) => w === 'patient' || w === 'number' || w === 'id')
  const tail = (idx >= 0 ? words.slice(idx + 1) : words).filter((w) => w !== 'number' && w !== 'and')
  // "one hundred four" / "one hundred and four"
  if (tail[1] === 'hundred' && DIGIT_WORDS[tail[0]]) {
    const hundreds = Number(DIGIT_WORDS[tail[0]]) * 100
    const rest = tail.slice(2)
    let n = 0
    if (rest[0] && TEENS[rest[0]] !== undefined) n = TEENS[rest[0]]
    else if (rest[0] && TENS[rest[0]] !== undefined) n = TENS[rest[0]] + (rest[1] && DIGIT_WORDS[rest[1]] ? Number(DIGIT_WORDS[rest[1]]) : 0)
    else if (rest[0] && DIGIT_WORDS[rest[0]]) n = Number(DIGIT_WORDS[rest[0]])
    return String(hundreds + n)
  }
  // digit-by-digit
  let out = ''
  for (const w of tail) {
    if (DIGIT_WORDS[w] === undefined) {
      if (out) break
      continue
    }
    out += DIGIT_WORDS[w]
  }
  return out.length >= 2 ? out : null
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(hey|hi|ok|okay)\s+(mediq|medic|medi q|medic you|media q|medi queue)\b/g, ' ')
    .replace(/^\s*(mediq|medic)\b/, ' ')
    .replace(/\b(please|can you|could you|would you|now|the|my|me)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCommand(raw: string): Command {
  const t = normalize(raw)
  if (!t) return { type: 'unknown', text: raw }
  const has = (...words: string[]) => words.every((w) => new RegExp(`\\b${w}\\b`).test(t))

  if (/^(stop|pause) (listening|microphone|mic)\b/.test(t) || t === 'stop' || t === 'stop listening') return { type: 'stop-listening' }
  if (/^(go )?back\b/.test(t) || t === 'previous screen') return { type: 'go-back' }
  if (/^(help|what can i say|commands|show commands)\b/.test(t)) return { type: 'help' }
  if (/\b(read|speak|say)\b.*\b(summary|that)\b/.test(t)) return { type: 'read-summary' }
  const panel = parseReportCommand(t)
  if (panel) return panel
  if (/\b(summari[sz]e|summary of)\b/.test(t)) return { type: 'summarize' }
  if (/\b(start|begin|new|create|open)\b.*\b(visit )?note\b/.test(t) || /\bdictate\b/.test(t)) return { type: 'start-note' }
  if (/\bnext tab\b/.test(t)) return { type: 'next-tab' }
  if (/\b(previous|prior|last) tab\b/.test(t)) return { type: 'previous-tab' }

  if (/\b(open|show|find|pull up|go to|load)\b/.test(t) && /\b(patient|number|id)\b/.test(t)) {
    const id = extractPatientNumber(t)
    if (id) return { type: 'open-patient', patientId: id }
  }
  if (/\b(allerg(y|ies))\b/.test(t)) return { type: 'show-allergies' }
  if (has('medication') && /\b(effects?|side effects?|reactions?)\b/.test(t)) return { type: 'show-effects' }
  if (/\bside effects?\b/.test(t)) return { type: 'show-effects' }
  if (/\b(medications?|meds|drugs|prescriptions)\b/.test(t)) return { type: 'show-medications' }
  if (/\b(labs?|lab results|laboratory|bloods|blood work)\b/.test(t)) return { type: 'show-labs' }
  if (/\b(vitals|vital signs|observations)\b/.test(t)) return { type: 'show-vitals' }
  if (/\badmissions?\b/.test(t)) return { type: 'show-admissions' }
  if (/\b(rooms?|beds?)\b/.test(t)) {
    if (/\b(available|free|empty|vacant|open)\b/.test(t)) return { type: 'show-rooms', filter: 'available' }
    if (/\b(occupied|full|taken)\b/.test(t)) return { type: 'show-rooms', filter: 'occupied' }
    return { type: 'show-rooms', filter: 'all' }
  }
  if (/\b(patients|patient list)\b/.test(t)) return { type: 'show-patients' }
  if (/\b(dashboard|overview|home)\b/.test(t)) return { type: 'show-dashboard' }
  return { type: 'unknown', text: raw }
}

const REPORT_NOUN = '(report|summary|panel|sheet)'
const SHOW_VERB = /\b(show|open|display|bring up|pull up|view|see|give|get|load|present)\b/

/** Report-panel commands. Needs an explicit report noun so "show medications" keeps navigating. */
function parseReportCommand(t: string): Command | null {
  if (/^(close|dismiss|hide|clear)\b/.test(t) || /\b(close|dismiss|hide)\b.*\b(report|reports|summary|panel|panels|window|windows|note)\b/.test(t)) {
    if (/\b(all|everything|reports|panels|windows)\b/.test(t)) return { type: 'close-report', all: true }
    if (/^(close|dismiss|hide|clear)( (it|this|that|report|panel|window|summary|note|this report|that report|current report))?$/.test(t) || /\b(report|summary|panel|window|note)\b/.test(t)) return { type: 'close-report', all: false }
  }
  if (/\b(scroll|page|move) (down|up)\b/.test(t) || /^(down|up)$/.test(t)) return { type: 'scroll-report', direction: /\bup\b/.test(t) ? 'up' : 'down' }
  if (/\b(larger|bigger|enlarge|expand|zoom in|increase size|grow)\b/.test(t)) return { type: 'resize-report', direction: 'larger' }
  if (/\b(smaller|shrink|zoom out|reduce|decrease size)\b/.test(t)) return { type: 'resize-report', direction: 'smaller' }
  if (!SHOW_VERB.test(t) && !/\b(report|summary)$/.test(t)) return null
  if (/\b(start|begin|new|create|dictate)\b/.test(t)) return null
  if (new RegExp(`\\b(medication|medications|meds|drug|drugs|prescription|prescriptions) ${REPORT_NOUN}\\b`).test(t)) return { type: 'open-report', report: 'medications' }
  if (new RegExp(`\\b(lab|labs|laboratory|lab results|blood|bloods) ${REPORT_NOUN}\\b`).test(t)) return { type: 'open-report', report: 'labs' }
  if (new RegExp(`\\b(vitals|vital signs|vital|observations|obs) ${REPORT_NOUN}\\b`).test(t)) return { type: 'open-report', report: 'vitals' }
  if (new RegExp(`\\b(visit|consultation|encounter) ${REPORT_NOUN}\\b`).test(t) || /\b(latest|last|recent|most recent|previous) (visit |clinical )?note\b/.test(t) || /\bvisit note\b/.test(t))
    return { type: 'open-report', report: 'visit' }
  if (new RegExp(`\\b(patient|clinical|patients|case|summary) ${REPORT_NOUN}\\b`).test(t) || /\b(patient|clinical) (summary|report|overview)\b/.test(t) || /^(show|open|display|bring up|pull up|view) (report|summary)$/.test(t))
    return { type: 'open-report', report: 'summary' }
  return null
}

export function describeCommand(c: Command): string {
  switch (c.type) {
    case 'open-patient':
      return `Open patient ${c.patientId}`
    case 'show-rooms':
      return c.filter === 'all' ? 'Show rooms' : `Show ${c.filter} rooms`
    case 'open-report':
      return `Open ${({ summary: 'clinical summary', visit: 'latest visit note', medications: 'medication report', labs: 'lab report', vitals: 'vitals report' } as const)[c.report]}`
    case 'close-report':
      return c.all ? 'Close all reports' : 'Close report'
    case 'resize-report':
      return `Make report ${c.direction}`
    case 'scroll-report':
      return `Scroll report ${c.direction}`
    case 'unknown':
      return 'Unrecognised command'
    default:
      return c.type.replace(/-/g, ' ').replace(/^\w/, (s) => s.toUpperCase())
  }
}
