/** Prompted phrases for enrollment and owner re-verification. */

export const ENROLLMENT_PHRASES = [
  'MEDIQ, this is my voice for secure clinical access on this workstation.',
  'Please open the synthetic patient record and show the latest vital signs.',
  'I confirm that every clinical note is reviewed by a qualified person before saving.',
  'Seven bright cyan monitors glow quietly across the observation unit tonight.',
  'Show available rooms, then summarise this visit for clinician review.',
]

const WORDS = ['amber', 'harbor', 'violet', 'granite', 'meadow', 'falcon', 'cedar', 'lantern', 'orbit', 'willow', 'copper', 'summit', 'river', 'tundra', 'marble', 'beacon']

/** A fresh random challenge phrase for owner re-verification (not replayable verbatim). */
export function challengePhrase(rand: () => number = Math.random): string {
  const pick = () => WORDS[Math.floor(rand() * WORDS.length)]
  const digits = Array.from({ length: 3 }, () => Math.floor(rand() * 10)).join(' ')
  return `MEDIQ owner check: ${pick()} ${pick()} ${pick()}, ${digits}.`
}
