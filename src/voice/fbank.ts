/**
 * Kaldi-compatible log-Mel filterbank features (80 bins) — the front end the
 * WeSpeaker speaker-embedding models were trained on.
 *
 * Mirrors `torchaudio.compliance.kaldi.fbank` with WeSpeaker's settings:
 * 25 ms frames, 10 ms shift, snip_edges, DC-offset removal, 0.97
 * pre-emphasis, Hamming window, 512-point FFT, power spectrum, 80 triangular
 * Mel bins over 20 Hz – Nyquist, natural log with a float-epsilon floor,
 * followed by per-utterance cepstral mean normalisation (CMN).
 *
 * Input samples are in [-1, 1] at 16 kHz. The model metadata declares
 * `normalize_samples = 0`, i.e. it expects int16-range amplitudes, so samples
 * are scaled by 32768 before analysis.
 *
 * Validated numerically against kaldi-native-fbank — see docs/SPEAKER_VERIFICATION.md.
 */

export const FBANK_SAMPLE_RATE = 16000
export const FBANK_NUM_BINS = 80
const FRAME_LENGTH = 400 // 25 ms @ 16 kHz
const FRAME_SHIFT = 160 // 10 ms @ 16 kHz
const NFFT = 512
const PREEMPH = 0.97
const LOW_FREQ = 20
const EPS = 1.1920928955078125e-7 // float32 epsilon, as in torchaudio

function melScale(freq: number): number {
  return 1127 * Math.log(1 + freq / 700)
}

let cachedBank: Float32Array[] | null = null
let cachedWindow: Float32Array | null = null
let cachedTwiddle: { cos: Float64Array; sin: Float64Array; rev: Uint32Array } | null = null

function melBank(): Float32Array[] {
  if (cachedBank) return cachedBank
  const numFftBins = NFFT / 2
  const binWidth = FBANK_SAMPLE_RATE / NFFT
  const melLow = melScale(LOW_FREQ)
  const melHigh = melScale(FBANK_SAMPLE_RATE / 2)
  const delta = (melHigh - melLow) / (FBANK_NUM_BINS + 1)
  const bank: Float32Array[] = []
  for (let b = 0; b < FBANK_NUM_BINS; b++) {
    const left = melLow + b * delta
    const center = melLow + (b + 1) * delta
    const right = melLow + (b + 2) * delta
    const w = new Float32Array(numFftBins + 1) // last (Nyquist) bin stays 0, as in Kaldi
    for (let i = 0; i < numFftBins; i++) {
      const mel = melScale(binWidth * i)
      if (mel > left && mel < right) {
        w[i] = mel <= center ? (mel - left) / (center - left) : (right - mel) / (right - center)
      }
    }
    bank.push(w)
  }
  cachedBank = bank
  return bank
}

function hamming(): Float32Array {
  if (cachedWindow) return cachedWindow
  const w = new Float32Array(FRAME_LENGTH)
  const a = (2 * Math.PI) / (FRAME_LENGTH - 1)
  for (let i = 0; i < FRAME_LENGTH; i++) w[i] = 0.54 - 0.46 * Math.cos(a * i)
  cachedWindow = w
  return w
}

function twiddles() {
  if (cachedTwiddle) return cachedTwiddle
  const cos = new Float64Array(NFFT / 2)
  const sin = new Float64Array(NFFT / 2)
  for (let i = 0; i < NFFT / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / NFFT)
    sin[i] = Math.sin((-2 * Math.PI * i) / NFFT)
  }
  const bits = Math.log2(NFFT)
  const rev = new Uint32Array(NFFT)
  for (let i = 0; i < NFFT; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    rev[i] = r
  }
  cachedTwiddle = { cos, sin, rev }
  return cachedTwiddle
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const { cos, sin, rev } = twiddles()
  for (let i = 0; i < NFFT; i++) {
    const j = rev[i]
    if (j > i) {
      let t = re[i]
      re[i] = re[j]
      re[j] = t
      t = im[i]
      im[i] = im[j]
      im[j] = t
    }
  }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1
    const step = NFFT / size
    for (let start = 0; start < NFFT; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step]
        const s = sin[k * step]
        const a = start + k
        const b = a + half
        const tr = re[b] * c - im[b] * s
        const ti = re[b] * s + im[b] * c
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

export interface FbankResult {
  /** Row-major [numFrames, 80]. */
  data: Float32Array
  numFrames: number
}

/** Number of frames Kaldi produces with snip_edges=true. */
export function frameCount(numSamples: number): number {
  if (numSamples < FRAME_LENGTH) return 0
  return 1 + Math.floor((numSamples - FRAME_LENGTH) / FRAME_SHIFT)
}

/**
 * Computes 80-dim log-Mel fbank features.
 * @param pcm mono samples in [-1, 1] at 16 kHz
 * @param applyCmn subtract the per-bin mean over time (WeSpeaker inference does)
 */
export function computeFbank(pcm: Float32Array, applyCmn = true): FbankResult {
  const numFrames = frameCount(pcm.length)
  const out = new Float32Array(numFrames * FBANK_NUM_BINS)
  if (numFrames === 0) return { data: out, numFrames }

  const bank = melBank()
  const win = hamming()
  const frame = new Float64Array(FRAME_LENGTH)
  const re = new Float64Array(NFFT)
  const im = new Float64Array(NFFT)
  const power = new Float64Array(NFFT / 2 + 1)

  for (let f = 0; f < numFrames; f++) {
    const offset = f * FRAME_SHIFT
    let mean = 0
    for (let i = 0; i < FRAME_LENGTH; i++) {
      frame[i] = pcm[offset + i] * 32768
      mean += frame[i]
    }
    mean /= FRAME_LENGTH
    for (let i = 0; i < FRAME_LENGTH; i++) frame[i] -= mean
    for (let i = FRAME_LENGTH - 1; i > 0; i--) frame[i] -= PREEMPH * frame[i - 1]
    frame[0] -= PREEMPH * frame[0]

    re.fill(0)
    im.fill(0)
    for (let i = 0; i < FRAME_LENGTH; i++) re[i] = frame[i] * win[i]
    fft(re, im)
    for (let i = 0; i <= NFFT / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i]

    const row = f * FBANK_NUM_BINS
    for (let b = 0; b < FBANK_NUM_BINS; b++) {
      const w = bank[b]
      let e = 0
      for (let i = 0; i < w.length; i++) if (w[i] !== 0) e += w[i] * power[i]
      out[row + b] = Math.log(Math.max(e, EPS))
    }
  }

  if (applyCmn) {
    for (let b = 0; b < FBANK_NUM_BINS; b++) {
      let sum = 0
      for (let f = 0; f < numFrames; f++) sum += out[f * FBANK_NUM_BINS + b]
      const m = sum / numFrames
      for (let f = 0; f < numFrames; f++) out[f * FBANK_NUM_BINS + b] -= m
    }
  }
  return { data: out, numFrames }
}
