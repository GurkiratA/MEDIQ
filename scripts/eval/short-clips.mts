import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-web'
import { computeFbank, FBANK_NUM_BINS } from '../../src/voice/fbank.ts'
ort.env.wasm.numThreads = 1
const SP = process.argv[2]
function readWav(p: string): Float32Array { const b = readFileSync(p); let off = 12; let data: Buffer | null = null
  while (off < b.length) { const id = b.toString('ascii', off, off + 4); const size = b.readUInt32LE(off + 4); if (id === 'data') { data = b.subarray(off + 8, off + 8 + size); break } off += 8 + size }
  const n = data!.length >> 1; const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = data!.readInt16LE(i * 2) / 32768; return out }
function files(dir: string): string[] { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.wav') ? [p] : [] }) }
const label = (p: string) => { const n = p.split('/').pop()!; return n.startsWith('speaker') ? n.split('_')[0] + '_' + n.split('_')[2] : n.split('-')[0] }
const norm = (v: Float32Array) => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map((x) => x / s) }
const cos = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d }
const sess = await ort.InferenceSession.create(readFileSync(join(SP, 'wespeaker_en_voxceleb_resnet34.onnx')))
async function embed(pcm: Float32Array) { const { data, numFrames } = computeFbank(pcm); const r = await sess.run({ feats: new ort.Tensor('float32', data, [1, numFrames, FBANK_NUM_BINS]) }); return norm(r.embs.data as Float32Array) }
const all = files(join(SP, 'sr-data')).sort()
const profiles = new Map<string, Float32Array>()
for (const l of ['fangjun', 'leijun', 'liudehua']) {
  const es = await Promise.all(all.filter((p) => label(p) === l && p.includes('/enroll/')).map((p) => embed(readWav(p).subarray(0, 64000))))
  const avg = new Float32Array(256); for (const e of es) e.forEach((v, i) => (avg[i] += v / es.length)); profiles.set(l, norm(avg))
}
for (const secs of [1.0, 1.5, 2.0, 3.0]) {
  const gen: number[] = [], imp: number[] = []
  for (const p of all.filter((p) => p.includes('/test/'))) {
    const pcm = readWav(p); const n = Math.floor(secs * 16000)
    // two windows per clip (start + middle) for more trials
    for (const start of [Math.floor(0.3 * 16000), Math.max(0, Math.floor(pcm.length / 2 - n / 2))]) {
      if (start + n > pcm.length) continue
      const e = await embed(pcm.subarray(start, start + n))
      for (const [l, pe] of profiles) (l === label(p) ? gen : imp).push(cos(e, pe))
    }
  }
  const st = (a: number[]) => `n=${a.length} min=${Math.min(...a).toFixed(3)} mean=${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)} max=${Math.max(...a).toFixed(3)}`
  const thr = [0.4, 0.45, 0.5, 0.55, 0.6].map((t) => `t=${t}: FRR ${(gen.filter((s) => s < t).length / gen.length * 100).toFixed(0)}% FAR ${(imp.filter((s) => s >= t).length / imp.length * 100).toFixed(0)}%`).join(' | ')
  console.log(`${secs}s  genuine ${st(gen)}\n      impostor ${st(imp)}\n      ${thr}`)
}
