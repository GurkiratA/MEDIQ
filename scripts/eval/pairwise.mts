/**
 * Pairwise same-/different-speaker cosine scores for the WeSpeaker models, using
 * MEDIQ's own fbank front end and onnxruntime-web (WASM) — as in the browser.
 * Usage: node --import tsx scripts/eval/pairwise.mts <dir>
 *   <dir> must contain wespeaker_en_voxceleb_resnet34.onnx, wespeaker_en_voxceleb_CAM++.onnx
 *   (sherpa-onnx release "speaker-recongition-models") and a clone of github.com/csukuangfj/sr-data.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-web'
import { computeFbank, FBANK_NUM_BINS } from '../../src/voice/fbank.ts'
ort.env.wasm.numThreads = 1
const SP = process.argv[2]
function readWav(p: string): Float32Array {
  const b = readFileSync(p); let off = 12; let data: Buffer | null = null
  while (off < b.length) { const id = b.toString('ascii', off, off + 4); const size = b.readUInt32LE(off + 4); if (id === 'data') { data = b.subarray(off + 8, off + 8 + size); break } off += 8 + size }
  const n = data!.length >> 1; const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = data!.readInt16LE(i * 2) / 32768; return out
}
function files(dir: string): string[] { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.wav') ? [p] : [] }) }
const label = (p: string) => { const n = p.split('/').pop()!; return n.startsWith('speaker') ? n.split('_')[0] + '_' + n.split('_')[2] : n.split('-')[0] }
const norm = (v: Float32Array) => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map((x) => x / s) }
const cos = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d }
for (const model of ['wespeaker_en_voxceleb_resnet34.onnx', 'wespeaker_en_voxceleb_CAM++.onnx']) {
  const sess = await ort.InferenceSession.create(readFileSync(join(SP, model)))
  const all = files(join(SP, 'sr-data')).sort()
  const embs: { p: string; l: string; e: Float32Array }[] = []
  let tTotal = 0
  for (const p of all) {
    const pcm = readWav(p).subarray(0, 16000 * 4) // app uses ~3-4 s utterances
    const { data, numFrames } = computeFbank(pcm)
    const t0 = performance.now()
    const r = await sess.run({ feats: new ort.Tensor('float32', data, [1, numFrames, FBANK_NUM_BINS]) })
    tTotal += performance.now() - t0
    embs.push({ p, l: label(p), e: norm(r.embs.data as Float32Array) })
  }
  const same: number[] = [], diff: number[] = []
  for (let i = 0; i < embs.length; i++) for (let j = i + 1; j < embs.length; j++) (embs[i].l === embs[j].l ? same : diff).push(cos(embs[i].e, embs[j].e))
  const st = (a: number[]) => `n=${a.length} min=${Math.min(...a).toFixed(3)} mean=${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)} max=${Math.max(...a).toFixed(3)}`
  console.log(`\n== ${model}  avg inference ${(tTotal / embs.length).toFixed(0)} ms per 4 s clip (WASM, 1 thread)`)
  console.log(' same-speaker pairs:', st(same))
  console.log(' diff-speaker pairs:', st(diff))
  // Enrollment protocol: average enroll/* clips per speaker, verify each test clip against every profile.
  const profiles = new Map<string, Float32Array>()
  for (const l of ['fangjun', 'leijun', 'liudehua']) {
    const es = embs.filter((x) => x.l === l && x.p.includes('/enroll/')).map((x) => x.e)
    const avg = new Float32Array(es[0].length); for (const e of es) e.forEach((v, i) => (avg[i] += v / es.length)); profiles.set(l, norm(avg))
  }
  for (const t of embs.filter((x) => x.p.includes('/test/'))) {
    const scores = [...profiles].map(([l, e]) => [l, cos(t.e, e)] as const).sort((a, b) => b[1] - a[1])
    console.log(`  ${t.p.split('sr-data/')[1].padEnd(40)} truth=${t.l.padEnd(9)} best=${scores[0][0].padEnd(9)} ${scores[0][1].toFixed(3)}  2nd=${scores[1][1].toFixed(3)}`)
  }
}
