/**
 * Minimal GENERAL drug-class reference used by the local deterministic
 * safety rules. Classes follow the WHO Anatomical Therapeutic Chemical (ATC)
 * classification (WHO Collaborating Centre for Drug Statistics Methodology,
 * https://atcddd.fhi.no/atc_ddd_index/). This table is general reference
 * information — not patient-specific facts — and covers only the handful of
 * drugs needed for the synthetic demo. It is NOT a clinical knowledge base.
 */

export interface DrugClass {
  key: string
  label: string
  atc: string
}

export const CLASSES: Record<string, DrugClass> = {
  penicillin: { key: 'penicillin', label: 'Penicillins (beta-lactam antibacterials)', atc: 'J01C' },
  cephalosporin: { key: 'cephalosporin', label: 'Cephalosporins (other beta-lactam antibacterials)', atc: 'J01DB–J01DI' },
  sulfonamide: { key: 'sulfonamide', label: 'Sulfonamide antibacterials', atc: 'J01E' },
  nsaid: { key: 'nsaid', label: 'Non-steroidal anti-inflammatory drugs', atc: 'M01A' },
  opioid: { key: 'opioid', label: 'Opioids', atc: 'N02A' },
  anticoagulant: { key: 'anticoagulant', label: 'Antithrombotic agents (anticoagulants)', atc: 'B01A' },
  contrast: { key: 'contrast', label: 'Iodinated X-ray contrast media', atc: 'V08A' },
}

/** name (lower-case generic or common brand) → class key + ATC code */
export const DRUGS: Record<string, { cls: string; atc: string; generic: string }> = {
  amoxicillin: { cls: 'penicillin', atc: 'J01CA04', generic: 'amoxicillin' },
  amoxil: { cls: 'penicillin', atc: 'J01CA04', generic: 'amoxicillin' },
  ampicillin: { cls: 'penicillin', atc: 'J01CA01', generic: 'ampicillin' },
  'amoxicillin-clavulanate': { cls: 'penicillin', atc: 'J01CR02', generic: 'amoxicillin and beta-lactamase inhibitor' },
  'co-amoxiclav': { cls: 'penicillin', atc: 'J01CR02', generic: 'amoxicillin and beta-lactamase inhibitor' },
  augmentin: { cls: 'penicillin', atc: 'J01CR02', generic: 'amoxicillin and beta-lactamase inhibitor' },
  penicillin: { cls: 'penicillin', atc: 'J01CE', generic: 'penicillin' },
  'penicillin v': { cls: 'penicillin', atc: 'J01CE02', generic: 'phenoxymethylpenicillin' },
  phenoxymethylpenicillin: { cls: 'penicillin', atc: 'J01CE02', generic: 'phenoxymethylpenicillin' },
  benzylpenicillin: { cls: 'penicillin', atc: 'J01CE01', generic: 'benzylpenicillin' },
  piperacillin: { cls: 'penicillin', atc: 'J01CA12', generic: 'piperacillin' },
  flucloxacillin: { cls: 'penicillin', atc: 'J01CF05', generic: 'flucloxacillin' },
  cloxacillin: { cls: 'penicillin', atc: 'J01CF02', generic: 'cloxacillin' },
  dicloxacillin: { cls: 'penicillin', atc: 'J01CF01', generic: 'dicloxacillin' },
  cephalexin: { cls: 'cephalosporin', atc: 'J01DB01', generic: 'cefalexin' },
  cefalexin: { cls: 'cephalosporin', atc: 'J01DB01', generic: 'cefalexin' },
  cefuroxime: { cls: 'cephalosporin', atc: 'J01DC02', generic: 'cefuroxime' },
  ceftriaxone: { cls: 'cephalosporin', atc: 'J01DD04', generic: 'ceftriaxone' },
  sulfamethoxazole: { cls: 'sulfonamide', atc: 'J01EE01', generic: 'sulfamethoxazole and trimethoprim' },
  'co-trimoxazole': { cls: 'sulfonamide', atc: 'J01EE01', generic: 'sulfamethoxazole and trimethoprim' },
  bactrim: { cls: 'sulfonamide', atc: 'J01EE01', generic: 'sulfamethoxazole and trimethoprim' },
  septra: { cls: 'sulfonamide', atc: 'J01EE01', generic: 'sulfamethoxazole and trimethoprim' },
  ibuprofen: { cls: 'nsaid', atc: 'M01AE01', generic: 'ibuprofen' },
  naproxen: { cls: 'nsaid', atc: 'M01AE02', generic: 'naproxen' },
  diclofenac: { cls: 'nsaid', atc: 'M01AB05', generic: 'diclofenac' },
  ketorolac: { cls: 'nsaid', atc: 'M01AB15', generic: 'ketorolac' },
  codeine: { cls: 'opioid', atc: 'R05DA04', generic: 'codeine' },
  morphine: { cls: 'opioid', atc: 'N02AA01', generic: 'morphine' },
  oxycodone: { cls: 'opioid', atc: 'N02AA05', generic: 'oxycodone' },
  warfarin: { cls: 'anticoagulant', atc: 'B01AA03', generic: 'warfarin' },
  apixaban: { cls: 'anticoagulant', atc: 'B01AF02', generic: 'apixaban' },
  rivaroxaban: { cls: 'anticoagulant', atc: 'B01AF01', generic: 'rivaroxaban' },
  enoxaparin: { cls: 'anticoagulant', atc: 'B01AB05', generic: 'enoxaparin' },
  heparin: { cls: 'anticoagulant', atc: 'B01AB01', generic: 'heparin' },
  lisinopril: { cls: 'acei', atc: 'C09AA03', generic: 'lisinopril' },
  metformin: { cls: 'biguanide', atc: 'A10BA02', generic: 'metformin' },
  acetaminophen: { cls: 'analgesic', atc: 'N02BE01', generic: 'paracetamol' },
  paracetamol: { cls: 'analgesic', atc: 'N02BE01', generic: 'paracetamol' },
  ondansetron: { cls: 'antiemetic', atc: 'A04AA01', generic: 'ondansetron' },
  atorvastatin: { cls: 'statin', atc: 'C10AA05', generic: 'atorvastatin' },
  furosemide: { cls: 'diuretic', atc: 'C03CA01', generic: 'furosemide' },
  salbutamol: { cls: 'saba', atc: 'R03AC02', generic: 'salbutamol' },
  albuterol: { cls: 'saba', atc: 'R03AC02', generic: 'salbutamol' },
  azithromycin: { cls: 'macrolide', atc: 'J01FA10', generic: 'azithromycin' },
  doxycycline: { cls: 'tetracycline', atc: 'J01AA02', generic: 'doxycycline' },
}

/** Allergy substance / documented class text → class key. */
export function allergyClassKey(substance: string, substanceClass: string | null): string | null {
  const s = `${substance} ${substanceClass ?? ''}`.toLowerCase()
  if (/penicillin|amoxicillin|ampicillin/.test(s)) return 'penicillin'
  if (/cephalosporin|cef|ceph/.test(s)) return 'cephalosporin'
  if (/sulfonamide|sulfamethoxazole|sulfa\b|co-trimoxazole/.test(s)) return 'sulfonamide'
  if (/nsaid|ibuprofen|naproxen|aspirin|diclofenac/.test(s)) return 'nsaid'
  if (/codeine|morphine|opioid|oxycodone/.test(s)) return 'opioid'
  if (/contrast/.test(s)) return 'contrast'
  const direct = DRUGS[substance.toLowerCase()]
  return direct?.cls ?? null
}

/** Finds known drug names in free text (longest names first). */
export function findDrugs(text: string): { name: string; index: number }[] {
  const lower = text.toLowerCase()
  const names = Object.keys(DRUGS).sort((a, b) => b.length - a.length)
  const found: { name: string; index: number }[] = []
  const taken: [number, number][] = []
  for (const n of names) {
    const re = new RegExp(`\\b${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(lower))) {
      const span: [number, number] = [m.index, m.index + n.length]
      if (taken.some(([a, b]) => span[0] < b && span[1] > a)) continue
      taken.push(span)
      found.push({ name: n, index: m.index })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}
