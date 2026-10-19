/**
 * On-device speaker-embedding model: WeSpeaker ResNet34 trained on
 * VoxCeleb (ONNX export distributed by k2-fsa/sherpa-onnx), run with
 * onnxruntime-web (WASM, CPU). Produces a 256-dim embedding per utterance.
 *
 * Provenance, licence (model: CC BY 4.0, VoxCeleb) and validation results
 * are in docs/SPEAKER_VERIFICATION.md. Everything runs locally in the
 * browser; no audio leaves the device.
 */
import * as ort from 'onnxruntime-web/wasm'
import { computeFbank, FBANK_NUM_BINS } from './fbank'
import { trimSilence } from './quality'
import { l2normalize, SPEAKER_MODEL_TYPE } from './verification'

export const SPEAKER_MODEL = {
  type: SPEAKER_MODEL_TYPE,
  version: 'wespeaker voxceleb_resnet34 (sherpa-onnx export, sha256 5ef208a9…)',
  dimensions: 256,
  url: '/models/wespeaker_en_voxceleb_resnet34.onnx',
} as const

const MAX_SECONDS = 8

export type ModelState = 'idle' | 'loading' | 'ready' | 'error'
let state: ModelState = 'idle'
let lastError: string | null = null
let session: Promise<ort.InferenceSession> | null = null
const listeners = new Set<() => void>()
const setState = (s: ModelState, err: string | null = null) => {
  state = s
  lastError = err
  listeners.forEach((l) => l())
}

export const speakerModelStatus = {
  get: () => ({ state, error: lastError }),
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function loadSpeakerModel(): Promise<ort.InferenceSession> {
  if (session) return session
  setState('loading')
  ort.env.wasm.wasmPaths = { wasm: '/vendor/ort/ort-wasm-simd-threaded.wasm' }
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'error'
  session = (async () => {
    const res = await fetch(SPEAKER_MODEL.url)
    if (!res.ok) throw new Error(`Speaker model not found (HTTP ${res.status}). Run "npm run setup:models".`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  })()
  session.then(
    () => setState('ready'),
    (err) => {
      session = null
      setState('error', err instanceof Error ? err.message : String(err))
    },
  )
  return session
}

/** Embeds a 16 kHz mono utterance. Returns an L2-normalised 256-dim vector. */
export async function embedUtterance(pcm16k: Float32Array): Promise<number[]> {
  const s = await loadSpeakerModel()
  let audio = trimSilence(pcm16k)
  if (audio.length > MAX_SECONDS * 16000) audio = audio.slice(0, MAX_SECONDS * 16000)
  const { data, numFrames } = computeFbank(audio)
  if (numFrames < 50) throw new Error('Utterance too short to embed.')
  const out = await s.run({ feats: new ort.Tensor('float32', data, [1, numFrames, FBANK_NUM_BINS]) })
  const embs = out[s.outputNames[0]]
  return l2normalize(embs.data as Float32Array)
}
