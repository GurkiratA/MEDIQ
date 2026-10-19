import * as ort from 'onnxruntime-node'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Speaker embeddings — turning a clip of speech into a fixed-size vector
 * such that the same person's voice lands nearby regardless of what they
 * said, and different people land apart.
 *
 * Model: NeXt-TDNN (jaehyun-ko/next-tdnn-onnx on Hugging Face, Apache 2.0),
 * the "standard-256" variant (~28MB). Started with "mobile-128" (~6.7MB,
 * smaller and faster) but it wasn't discriminative enough for related
 * voices — a parent and child were confused. Voice-family confusion is a
 * known, real limitation of speaker verification generally (vocal tract
 * shape is partly heritable), not just an undertrained model, but the
 * smaller/faster variant makes it measurably worse, and verification only
 * runs once per utterance (not per frame), so the extra inference cost is
 * cheap enough to trade for the accuracy. Downloaded once on first use and
 * cached in ~/.mediq-voice; every run after that is fully offline.
 *
 * Chosen over Picovoice Eagle (the original plan) because Eagle's "free"
 * AccessKey is actually a 7-day company-email-gated trial, not a real free
 * tier — a dead end for a personal project. This has no account, no key, no
 * expiry, ever; it's just a published model file.
 *
 * The mel-spectrogram feature extraction below is a straight port of the
 * pure-JS math from @jaehyun-ko/speaker-verification (same license), the
 * reference implementation for this exact model — its only browser-specific
 * part was which onnxruntime package it imported (web vs here, node), so
 * this is that same math running against onnxruntime-node instead.
 */

/** Identifies which model a saved profile's embedding was computed with.
 *  Embeddings from different model variants live in unrelated vector
 *  spaces — comparing them is meaningless, not just less accurate — so
 *  voiceauth.mjs tags every profile with this and refuses a mismatch rather
 *  than silently producing a wrong answer. Bump this any time MODEL_URL
 *  changes. */
export const MODEL_ID = 'next-tdnn-standard-256'

const MODEL_DIR = join(homedir(), '.mediq-voice')
const MODEL_PATH = join(MODEL_DIR, `${MODEL_ID}.onnx`)
const MODEL_URL =
  'https://huggingface.co/jaehyun-ko/next-tdnn-onnx/resolve/main/NeXt_TDNN_C256_B3_K65_7.onnx'

const MEL = {
  sampleRate: 16000,
  nFft: 512,
  winLength: 400,
  hopLength: 160,
  nMels: 80,
  preEmphasisCoef: 0.97,
}
/** The model always wants exactly 300 frames of input. With winLength=400
 *  and hopLength=160: numFrames = floor((N - winLength) / hopLength) + 1,
 *  so N = (300 - 1) * 160 + 400 = 48240 samples — just over 3 seconds at
 *  16kHz. Shorter clips are zero-padded, longer ones truncated. */
const TARGET_SAMPLES = 48240

/* ------------------------------------------------------------------- FFT */

class FFT {
  constructor(size) {
    this.size = size
    const log2Size = Math.log2(size)
    if (log2Size !== Math.floor(log2Size)) throw new Error('FFT size must be a power of 2')
    this.cosTable = new Float32Array(size / 2)
    this.sinTable = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      const angle = (2 * Math.PI * i) / size
      this.cosTable[i] = Math.cos(angle)
      this.sinTable[i] = Math.sin(angle)
    }
    this.reverseTable = new Uint32Array(size)
    const shift = 32 - log2Size
    for (let i = 0; i < size; i++) this.reverseTable[i] = this.reverseBits(i) >>> shift
  }

  reverseBits(x) {
    x = ((x & 0x55555555) << 1) | ((x & 0xaaaaaaaa) >>> 1)
    x = ((x & 0x33333333) << 2) | ((x & 0xcccccccc) >>> 2)
    x = ((x & 0x0f0f0f0f) << 4) | ((x & 0xf0f0f0f0) >>> 4)
    x = ((x & 0x00ff00ff) << 8) | ((x & 0xff00ff00) >>> 8)
    x = ((x & 0x0000ffff) << 16) | ((x & 0xffff0000) >>> 16)
    return x
  }

  forward(real, imag) {
    const n = this.size
    for (let i = 0; i < n; i++) {
      const j = this.reverseTable[i]
      if (j > i) {
        ;[real[i], real[j]] = [real[j], real[i]]
        ;[imag[i], imag[j]] = [imag[j], imag[i]]
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2
      const tableStep = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfSize; j++, k += tableStep) {
          const l = j + halfSize
          const cos = this.cosTable[k]
          const sin = this.sinTable[k]
          const tReal = real[l] * cos - imag[l] * sin
          const tImag = real[l] * sin + imag[l] * cos
          real[l] = real[j] - tReal
          imag[l] = imag[j] - tImag
          real[j] += tReal
          imag[j] += tImag
        }
      }
    }
  }
}

/* --------------------------------------------------------- mel spectrum */

function hzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700)
}
function melToHz(mel) {
  return 700 * (10 ** (mel / 2595) - 1)
}

function buildMelFilterBank() {
  const { nFft, nMels, sampleRate } = MEL
  const fftBins = Math.floor(nFft / 2) + 1
  const melMin = hzToMel(20)
  const melMax = hzToMel(7600)
  const melPoints = new Float32Array(nMels + 2)
  for (let i = 0; i < nMels + 2; i++) melPoints[i] = melMin + ((melMax - melMin) * i) / (nMels + 1)
  const hzPoints = melPoints.map(melToHz)
  const binPoints = hzPoints.map((hz) => Math.floor(((nFft + 1) * hz) / sampleRate))

  const bank = []
  for (let i = 0; i < nMels; i++) {
    const filter = new Float32Array(fftBins)
    const [startBin, centerBin, endBin] = [binPoints[i], binPoints[i + 1], binPoints[i + 2]]
    for (let j = startBin; j < centerBin; j++) filter[j] = (j - startBin) / (centerBin - startBin)
    for (let j = centerBin; j < endBin; j++) filter[j] = (endBin - j) / (endBin - centerBin)
    bank.push(filter)
  }
  return bank
}

const melFilterBank = buildMelFilterBank()
const fft = new FFT(MEL.nFft)

function preEmphasis(signal) {
  const out = new Float32Array(signal.length)
  out[0] = signal[0]
  for (let i = 1; i < signal.length; i++) out[i] = signal[i] - MEL.preEmphasisCoef * signal[i - 1]
  return out
}

function hammingWindow(frame) {
  const { winLength } = MEL
  const out = new Float32Array(frame.length)
  for (let i = 0; i < winLength; i++) {
    out[i] = frame[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (winLength - 1)))
  }
  return out
}

function magnitudeSpectrum(frame) {
  const { nFft } = MEL
  const real = new Float32Array(nFft)
  const imag = new Float32Array(nFft)
  for (let i = 0; i < Math.min(frame.length, nFft); i++) real[i] = frame[i]
  fft.forward(real, imag)
  const half = Math.floor(nFft / 2) + 1
  const mag = new Float32Array(half)
  for (let i = 0; i < half; i++) mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i])
  return mag
}

/** @param {Float32Array} pcm samples in [-1, 1] at MEL.sampleRate
 *  @returns {{ mel: Float32Array, numFrames: number }} row-major [nMels, numFrames] */
function computeMelSpectrogram(pcm) {
  const { winLength, hopLength, nMels } = MEL
  const emphasized = preEmphasis(pcm)
  const numFrames = Math.floor((emphasized.length - winLength) / hopLength) + 1
  const mel = new Float32Array(nMels * numFrames)

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopLength
    const spectrum = magnitudeSpectrum(hammingWindow(emphasized.slice(start, start + winLength)))
    for (let m = 0; m < nMels; m++) {
      const filter = melFilterBank[m]
      let energy = 0
      const len = Math.min(spectrum.length, filter.length)
      for (let i = 0; i < len; i++) energy += spectrum[i] * spectrum[i] * filter[i]
      if (Number.isNaN(energy) || energy < 0) energy = 0
      mel[m * numFrames + f] = Math.log(energy + 1e-6)
    }
  }
  // Per-mel-bin mean normalization across time, matching training.
  for (let m = 0; m < nMels; m++) {
    let sum = 0
    for (let f = 0; f < numFrames; f++) sum += mel[m * numFrames + f]
    const mean = sum / numFrames
    for (let f = 0; f < numFrames; f++) mel[m * numFrames + f] -= mean
  }
  return { mel, numFrames }
}

/* ----------------------------------------------------------------- model */

let sessionPromise = null
async function ensureSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      if (!existsSync(MODEL_PATH)) {
        await mkdir(MODEL_DIR, { recursive: true })
        console.log('[mediq] downloading voice-recognition model (~28MB, one-time)...')
        const res = await fetch(MODEL_URL)
        if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`)
        await writeFile(MODEL_PATH, Buffer.from(await res.arrayBuffer()))
        console.log('[mediq] voice-recognition model ready')
      }
      return ort.InferenceSession.create(MODEL_PATH)
    })()
  }
  return sessionPromise
}

/** @param {Float32Array} pcm samples in [-1, 1] at 16kHz, any length —
 *  padded or truncated to the model's fixed 3-second window.
 *  @returns {Promise<Float32Array>} an L2-normalized embedding. */
export async function embed(pcm) {
  const session = await ensureSession()

  let data = pcm
  if (data.length < TARGET_SAMPLES) {
    const padded = new Float32Array(TARGET_SAMPLES)
    padded.set(data)
    data = padded
  } else if (data.length > TARGET_SAMPLES) {
    data = data.slice(0, TARGET_SAMPLES)
  }

  const { mel, numFrames } = computeMelSpectrogram(data)
  const tensor = new ort.Tensor('float32', mel, [1, MEL.nMels, numFrames])
  const results = await session.run({ [session.inputNames[0]]: tensor })
  const output = results[session.outputNames[0]]
  const raw = output.data

  let vec
  if (output.dims.length === 2) {
    vec = Float32Array.from(raw)
  } else {
    // [batch, hiddenDim, timeFrames] — mean-pool over time.
    const [, hiddenDim, timeFrames] = output.dims
    vec = new Float32Array(hiddenDim)
    for (let h = 0; h < hiddenDim; h++) {
      let sum = 0
      for (let t = 0; t < timeFrames; t++) sum += raw[h * timeFrames + t]
      vec[h] = sum / timeFrames
    }
  }

  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

/** Both vectors are already L2-normalized, so this is just the dot product. */
export function cosineSimilarity(a, b) {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return Math.max(-1, Math.min(1, dot))
}
