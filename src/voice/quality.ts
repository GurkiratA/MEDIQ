/**
 * Voice-sample quality checks, run before any embedding is computed.
 * Rejects silent, clipped, too-short or very noisy recordings. Frame
 * energies use 25 ms windows at 16 kHz.
 */

export const SAMPLE_RATE = 16000
const FRAME = 400

export interface QualityThresholds {
  minVoicedSec: number
  minRmsDbfs: number
  maxClippingRatio: number
  minSnrDb: number
}

/** Short command utterances: ≥ 1.2 s voiced (scores degrade sharply below that). */
export const VERIFY_THRESHOLDS: QualityThresholds = { minVoicedSec: 1.2, minRmsDbfs: -45, maxClippingRatio: 0.01, minSnrDb: 8 }
/** Enrollment phrases are longer, so demand more voiced audio. */
export const ENROLL_THRESHOLDS: QualityThresholds = { minVoicedSec: 2.0, minRmsDbfs: -45, maxClippingRatio: 0.01, minSnrDb: 10 }

export interface QualityReport {
  ok: boolean
  durationSec: number
  voicedSec: number
  rmsDbfs: number
  peak: number
  clippingRatio: number
  snrDb: number
  issues: string[]
}

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9))

function frameRms(pcm: Float32Array): number[] {
  const out: number[] = []
  for (let i = 0; i + FRAME <= pcm.length; i += FRAME) {
    let s = 0
    for (let j = i; j < i + FRAME; j++) s += pcm[j] * pcm[j]
    out.push(Math.sqrt(s / FRAME))
  }
  return out
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]
}

export function assessSample(pcm: Float32Array, t: QualityThresholds = VERIFY_THRESHOLDS): QualityReport {
  const durationSec = pcm.length / SAMPLE_RATE
  let peak = 0
  let clipped = 0
  let sumSq = 0
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i])
    if (a > peak) peak = a
    if (a >= 0.99) clipped++
    sumSq += pcm[i] * pcm[i]
  }
  const frames = frameRms(pcm)
  const sorted = [...frames].sort((a, b) => a - b)
  const noise = Math.max(percentile(sorted, 0.1), 1e-5)
  const speech = percentile(sorted, 0.9)
  const voicedThreshold = Math.max(noise * 2, 10 ** (-50 / 20))
  const voicedFrames = frames.filter((f) => f > voicedThreshold).length
  const voicedSec = (voicedFrames * FRAME) / SAMPLE_RATE
  const rmsDbfs = db(Math.sqrt(sumSq / Math.max(1, pcm.length)))
  const snrDb = db(speech) - db(noise)
  const clippingRatio = pcm.length ? clipped / pcm.length : 0

  const issues: string[] = []
  if (durationSec < 0.5 || peak < 0.01) issues.push('No speech detected — check the microphone and speak closer.')
  else {
    if (voicedSec < t.minVoicedSec) issues.push(`Too little speech (${voicedSec.toFixed(1)} s; need ≥ ${t.minVoicedSec} s). Say the full phrase.`)
    if (db(speech) < t.minRmsDbfs) issues.push('Recording is very quiet — speak louder or move closer to the microphone.')
    if (clippingRatio > t.maxClippingRatio) issues.push('Recording is clipped (too loud) — move slightly away from the microphone.')
    if (snrDb < t.minSnrDb) issues.push(`Too much background noise (SNR ≈ ${snrDb.toFixed(0)} dB).`)
  }
  return { ok: issues.length === 0, durationSec, voicedSec, rmsDbfs, peak, clippingRatio, snrDb, issues }
}

/** Trims leading/trailing non-speech (keeps 150 ms padding) so embeddings focus on the voice. */
export function trimSilence(pcm: Float32Array): Float32Array {
  const frames = frameRms(pcm)
  if (!frames.length) return pcm
  const sorted = [...frames].sort((a, b) => a - b)
  const thr = Math.max(percentile(sorted, 0.1) * 2, 10 ** (-50 / 20))
  const first = frames.findIndex((f) => f > thr)
  if (first < 0) return pcm
  let last = frames.length - 1
  while (last > first && frames[last] <= thr) last--
  const pad = Math.round(0.15 * SAMPLE_RATE)
  const start = Math.max(0, first * FRAME - pad)
  const end = Math.min(pcm.length, (last + 1) * FRAME + pad)
  return pcm.slice(start, end)
}
