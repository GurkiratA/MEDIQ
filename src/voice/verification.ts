/**
 * Speaker-verification decision logic (pure; unit-tested).
 *
 * 1. Speech recognition decides WHAT was said (elsewhere).
 * 2. Speaker verification: cosine similarity of a fresh sample's embedding
 *    against every enrolled profile — including revoked ones, so a revoked
 *    speaker is recognised and explicitly rejected.
 * 3. Authorization: the best match must be enrolled with the current model,
 *    not revoked, and hold an active grant with the required permission.
 *
 * Similarity is a model score, NOT a calibrated probability of identity.
 */
import type { Authorization, DoctorProfile, Permission } from '../db/schema'

export const SPEAKER_MODEL_TYPE = 'wespeaker-resnet34-voxceleb' as const

export type Decision =
  | { outcome: 'accepted'; profileId: string; displayName: string; score: number; runnerUp: number | null }
  | { outcome: 'no-profiles' }
  | { outcome: 'unknown-speaker'; bestScore: number }
  | { outcome: 'ambiguous'; bestScore: number; runnerUp: number }
  | { outcome: 'revoked'; profileId: string; score: number }
  | { outcome: 'not-authorized'; profileId: string; score: number }
  | { outcome: 'model-mismatch'; profileId: string }

export interface DecideOptions {
  threshold: number
  margin: number
  permission: Permission
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || !a.length) return -1
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na * nb) || 1)
}

export function l2normalize(v: ArrayLike<number>): number[] {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  const n = Math.sqrt(s) || 1
  return Array.from(v, (x) => x / n)
}

/** Mean of L2-normalised embeddings, re-normalised (the enrollment centroid). */
export function centroid(embeddings: ArrayLike<number>[]): number[] {
  const dim = embeddings[0].length
  const sum = new Array<number>(dim).fill(0)
  for (const e of embeddings) {
    const n = l2normalize(e)
    for (let i = 0; i < dim; i++) sum[i] += n[i]
  }
  return l2normalize(sum)
}

/** Mean pairwise similarity between enrollment samples (consistency check). */
export function consistency(embeddings: ArrayLike<number>[]): { mean: number; min: number; worstIndex: number } {
  let total = 0
  let count = 0
  let min = 1
  const perSample = new Array<number>(embeddings.length).fill(0)
  for (let i = 0; i < embeddings.length; i++)
    for (let j = i + 1; j < embeddings.length; j++) {
      const s = cosine(embeddings[i], embeddings[j])
      total += s
      count++
      min = Math.min(min, s)
      perSample[i] += s
      perSample[j] += s
    }
  const worstIndex = perSample.indexOf(Math.min(...perSample))
  return { mean: count ? total / count : 0, min, worstIndex }
}

export function activeGrant(profileId: string, auths: Authorization[], permission: Permission): Authorization | undefined {
  return auths.find((a) => a.profileId === profileId && a.active && !a.revokedAt && a.permissions.includes(permission))
}

export function decide(embedding: ArrayLike<number>, profiles: DoctorProfile[], auths: Authorization[], opts: DecideOptions): Decision {
  if (!profiles.length) return { outcome: 'no-profiles' }
  const scored = profiles
    .map((p) => ({ p, score: p.voiceModel.type === SPEAKER_MODEL_TYPE && p.embedding.length === embedding.length ? cosine(embedding, p.embedding) : -1 }))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  const second = scored[1]
  if (best.score < opts.threshold) {
    const mismatch = profiles.find((p) => p.voiceModel.type !== SPEAKER_MODEL_TYPE)
    if (mismatch && best.score === -1) return { outcome: 'model-mismatch', profileId: mismatch.id }
    return { outcome: 'unknown-speaker', bestScore: best.score }
  }
  // Two different profiles both match closely → refuse rather than guess.
  if (second && second.score >= opts.threshold && best.score - second.score < opts.margin) {
    return { outcome: 'ambiguous', bestScore: best.score, runnerUp: second.score }
  }
  if (best.p.revokedAt) return { outcome: 'revoked', profileId: best.p.id, score: best.score }
  if (best.p.enrollmentStatus !== 'Enrolled') return { outcome: 'model-mismatch', profileId: best.p.id }
  if (!activeGrant(best.p.id, auths, opts.permission)) return { outcome: 'not-authorized', profileId: best.p.id, score: best.score }
  return { outcome: 'accepted', profileId: best.p.id, displayName: best.p.displayName, score: best.score, runnerUp: second?.score ?? null }
}

/** User-facing message. Never reveals enrolled names to an unrecognised speaker. */
export function decisionMessage(d: Decision): string {
  switch (d.outcome) {
    case 'accepted':
      return `Verified: ${d.displayName}`
    case 'no-profiles':
      return 'No authorized doctor is enrolled yet. Voice commands stay locked until the owner enrolls.'
    case 'unknown-speaker':
    case 'ambiguous':
    case 'revoked':
    case 'not-authorized':
    case 'model-mismatch':
      return 'Voice Not Verified: Access Denied.'
  }
}

export function decisionReason(d: Decision): string {
  switch (d.outcome) {
    case 'accepted':
      return `Similarity ${d.score.toFixed(2)} (model score, not a probability).`
    case 'no-profiles':
      return 'Fail-closed: there is nothing to verify against.'
    case 'unknown-speaker':
      return `Best similarity ${d.bestScore.toFixed(2)} is below the acceptance threshold.`
    case 'ambiguous':
      return `Two enrolled profiles matched closely (${d.bestScore.toFixed(2)} vs ${d.runnerUp.toFixed(2)}); refusing to guess.`
    case 'revoked':
      return 'The matching profile has been revoked by the owner.'
    case 'not-authorized':
      return 'The matching profile has no active authorization for this action.'
    case 'model-mismatch':
      return 'The matching profile was enrolled with a different voice model and must be re-enrolled.'
  }
}
