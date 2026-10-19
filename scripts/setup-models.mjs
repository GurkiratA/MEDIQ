// Downloads (or verifies) the two on-device models MEDIQ uses, into public/models.
// Both are committed to the repo for offline demos; run `npm run setup:models`
// to re-download or to check integrity. Provenance and licences are documented
// in docs/SPEAKER_VERIFICATION.md and public/models/MODELS.md.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')

const MODELS = [
  {
    file: 'wespeaker_en_voxceleb_resnet34.onnx',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx',
    sha256: '5ef208a9da1453335308a6b6f4e6dfbd7e183a38b604de0a57664f45d257fe94',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    sha256: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1',
  },
]

const sha = (buf) => createHash('sha256').update(buf).digest('hex')
mkdirSync(dir, { recursive: true })
let failed = false

for (const m of MODELS) {
  const path = join(dir, m.file)
  if (existsSync(path) && sha(readFileSync(path)) === m.sha256) {
    console.log(`✓ ${m.file} present and verified`)
    continue
  }
  try {
    console.log(`↓ downloading ${m.file} ...`)
    const res = await fetch(m.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const got = sha(buf)
    if (got !== m.sha256) throw new Error(`checksum mismatch (got ${got})`)
    writeFileSync(path, buf)
    console.log(`✓ ${m.file} downloaded and verified (${(buf.length / 1e6).toFixed(1)} MB)`)
  } catch (err) {
    failed = true
    console.error(`✗ ${m.file}: ${err instanceof Error ? err.message : err}`)
  }
}

if (failed) {
  console.error('\nSome models are missing. MEDIQ still runs: live speaker verification and/or hand tracking will report "unavailable" instead of guessing.')
  process.exit(1)
}
