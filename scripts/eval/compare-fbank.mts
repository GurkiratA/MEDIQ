import { readFileSync } from 'node:fs'
import { computeFbank } from '../../src/voice/fbank.ts'
for (const f of process.argv.slice(2)) {
  const ref = JSON.parse(readFileSync(f, 'utf8'))
  const pcm = Float32Array.from(ref.pcm)
  const mine = computeFbank(pcm, false)
  const refFeats: number[][] = ref.feats
  let maxAbs = 0, sumAbs = 0, n = 0
  for (let t = 0; t < Math.min(mine.numFrames, refFeats.length); t++) for (let b = 0; b < 80; b++) {
    const d = Math.abs(mine.data[t * 80 + b] - refFeats[t][b]); maxAbs = Math.max(maxAbs, d); sumAbs += d; n++
  }
  console.log(f.split('/').pop(), 'frames mine', mine.numFrames, 'ref', refFeats.length, 'maxAbsDiff', maxAbs.toExponential(3), 'meanAbsDiff', (sumAbs / n).toExponential(3))
}
