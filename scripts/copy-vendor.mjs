// Copies browser runtime assets (WASM) from node_modules into public/vendor so
// the app never depends on a CDN at demo time. Runs as `postinstall`; it is
// intentionally non-fatal so a partial install never blocks `npm install`.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'vendor')

const jobs = [
  {
    name: 'onnxruntime-web',
    from: join(root, 'node_modules', 'onnxruntime-web', 'dist'),
    to: join(out, 'ort'),
    // Only the plain (CPU) WASM backend is used — no WebGPU/JSEP variants.
    filter: (f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f),
  },
  {
    name: '@mediapipe/tasks-vision',
    from: join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
    to: join(out, 'mediapipe'),
    filter: () => true,
  },
]

for (const job of jobs) {
  try {
    if (!existsSync(job.from)) {
      console.warn(`[copy-vendor] ${job.name} not found at ${job.from} — skipping`)
      continue
    }
    mkdirSync(job.to, { recursive: true })
    const files = readdirSync(job.from).filter(job.filter)
    for (const f of files) cpSync(join(job.from, f), join(job.to, f))
    console.log(`[copy-vendor] ${job.name}: copied ${files.length} file(s) to ${job.to}`)
  } catch (err) {
    console.warn(`[copy-vendor] ${job.name}: ${err instanceof Error ? err.message : err}`)
  }
}
