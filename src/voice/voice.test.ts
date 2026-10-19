import { describe, expect, it, vi } from 'vitest'
import { parseCommand, extractPatientNumber } from './commands'
import { routeCommand, type RouterDeps } from './router'
import { assessSample, ENROLL_THRESHOLDS, VERIFY_THRESHOLDS } from './quality'
import { centroid, consistency, decide, decisionMessage, l2normalize, SPEAKER_MODEL_TYPE } from './verification'
import { challengePhrase } from './phrases'
import type { Authorization, DoctorProfile } from '../db/schema'

describe('command parser', () => {
  it.each([
    ['Show patients', { type: 'show-patients' }],
    ['Open patient 104', { type: 'open-patient', patientId: '104' }],
    ['hey mediq open patient one oh four', { type: 'open-patient', patientId: '104' }],
    ['open patient one hundred and four', { type: 'open-patient', patientId: '104' }],
    ['Show allergies.', { type: 'show-allergies' }],
    ['Show medications', { type: 'show-medications' }],
    ['Show medication effects', { type: 'show-effects' }],
    ['show lab results', { type: 'show-labs' }],
    ['Show rooms', { type: 'show-rooms', filter: 'all' }],
    ['Show available rooms', { type: 'show-rooms', filter: 'available' }],
    ['Show admissions', { type: 'show-admissions' }],
    ['Start a visit note', { type: 'start-note' }],
    ['Summarize this visit', { type: 'summarize' }],
    ['Read that summary', { type: 'read-summary' }],
    ['Stop listening', { type: 'stop-listening' }],
    ['Go back', { type: 'go-back' }],
    ['Help', { type: 'help' }],
  ])('%s', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected)
  })

  it('returns unknown rather than guessing', () => {
    expect(parseCommand('prescribe amoxicillin').type).toBe('unknown')
    expect(parseCommand('').type).toBe('unknown')
  })

  it('extracts spoken patient numbers', () => {
    expect(extractPatientNumber('open patient one zero seven')).toBe('107')
    expect(extractPatientNumber('patient 108')).toBe('108')
  })
})

function deps(over: Partial<RouterDeps> = {}): RouterDeps {
  return {
    activePatientId: null,
    navigate: vi.fn(),
    back: vi.fn(() => true),
    shiftPatientTab: vi.fn(),
    patientExists: (id) => ['104', '105'].includes(id),
    hasDraftText: () => false,
    generateSummary: vi.fn(),
    latestSummary: () => null,
    speak: vi.fn(),
    stopListening: vi.fn(),
    ...over,
  }
}

describe('router', () => {
  it('asks for a patient instead of guessing', () => {
    const d = deps()
    const r = routeCommand({ type: 'show-labs' }, d)
    expect(r.executed).toBe(false)
    expect(r.message).toMatch(/Select a patient first/)
    expect(d.navigate).not.toHaveBeenCalled()
  })

  it('opens existing patients and rejects missing ones', () => {
    const d = deps()
    expect(routeCommand({ type: 'open-patient', patientId: '104' }, d).executed).toBe(true)
    expect(d.navigate).toHaveBeenCalledWith({ view: 'patients', patientId: '104', patientTab: 'overview' })
    expect(routeCommand({ type: 'open-patient', patientId: '999' }, d).executed).toBe(false)
  })

  it('summarize only prepares a draft and never saves', () => {
    const d = deps({ activePatientId: '104', hasDraftText: () => true })
    const r = routeCommand({ type: 'summarize' }, d)
    expect(r.executed).toBe(true)
    expect(d.generateSummary).toHaveBeenCalledWith('104')
    expect(r.message).toMatch(/will not be saved/)
  })
})

const profile = (id: string, emb: number[], over: Partial<DoctorProfile> = {}): DoctorProfile => ({
  id,
  displayName: `Dr ${id}`,
  clinicianId: 'SYN-CLN-0001',
  role: 'Clinician',
  enrollmentStatus: 'Enrolled',
  enrolledAt: '2026-10-19T00:00:00.000Z',
  lastVerifiedAt: null,
  voiceModel: { type: SPEAKER_MODEL_TYPE, version: 'test', dimensions: emb.length, threshold: 0.5 },
  embedding: l2normalize(emb),
  sampleCount: 3,
  enrollmentConsistency: 0.7,
  revokedAt: null,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  ...over,
})
const grant = (profileId: string, active = true): Authorization => ({
  id: `G-${profileId}`,
  profileId,
  permissions: ['voice-navigation', 'voice-dictation'],
  grantedBy: 'owner',
  grantedAt: '2026-10-19T00:00:00.000Z',
  revokedAt: active ? null : '2026-10-19T01:00:00.000Z',
  revokedBy: active ? null : 'owner',
  active,
})
const vec = (i: number, noise = 0) => Array.from({ length: 16 }, (_, k) => (k === i ? 1 : 0) + noise * Math.sin(k + i))
const opts = { threshold: 0.5, margin: 0.08, permission: 'voice-navigation' as const }

describe('verification gate', () => {
  it('fails closed with no profiles', () => {
    expect(decide(vec(0), [], [], opts).outcome).toBe('no-profiles')
  })

  it('accepts an authorized matching profile', () => {
    const d = decide(vec(0, 0.1), [profile('A', vec(0)), profile('B', vec(5))], [grant('A'), grant('B')], opts)
    expect(d).toMatchObject({ outcome: 'accepted', profileId: 'A' })
  })

  it('rejects an unknown speaker without disclosing names', () => {
    const d = decide(vec(9), [profile('A', vec(0))], [grant('A')], opts)
    expect(d.outcome).toBe('unknown-speaker')
    expect(decisionMessage(d)).toBe('Voice Not Verified: Access Denied.')
    expect(decisionMessage(d)).not.toMatch(/Dr A/)
  })

  it('rejects a revoked profile even when the voice matches', () => {
    const d = decide(vec(0), [profile('A', vec(0), { revokedAt: '2026-10-19T01:00:00.000Z' })], [grant('A', false)], opts)
    expect(d.outcome).toBe('revoked')
  })

  it('rejects an enrolled voice with no active grant', () => {
    expect(decide(vec(0), [profile('A', vec(0))], [], opts).outcome).toBe('not-authorized')
  })

  it('rejects ambiguous matches between two profiles', () => {
    const a = vec(0).map((x, i) => x + (i === 1 ? 0.95 : 0))
    const b = vec(1).map((x, i) => x + (i === 0 ? 0.95 : 0))
    const d = decide(l2normalize(vec(0).map((x, i) => x + (i === 1 ? 1 : 0))), [profile('A', a), profile('B', b)], [grant('A'), grant('B')], opts)
    expect(d.outcome).toBe('ambiguous')
  })

  it('treats profiles from another model as non-matching', () => {
    const p = profile('A', vec(0))
    const other = { ...p, voiceModel: { ...p.voiceModel, type: 'other-model' } } as unknown as DoctorProfile
    expect(decide(vec(0), [other], [grant('A')], opts).outcome).toBe('model-mismatch')
  })

  it('computes centroid and consistency', () => {
    const c = centroid([vec(0, 0.1), vec(0, 0.2), vec(0, 0.15)])
    expect(c[0]).toBeGreaterThan(0.9)
    const s = consistency([vec(0), vec(0, 0.1), vec(7)])
    expect(s.worstIndex).toBe(2)
  })
})

describe('sample quality', () => {
  const tone = (secs: number, amp: number) => Float32Array.from({ length: secs * 16000 }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / 16000) * (Math.floor(i / 4000) % 4 === 3 ? 0.02 : 1))
  it('rejects silence', () => {
    expect(assessSample(new Float32Array(32000)).ok).toBe(false)
  })
  it('rejects clips that are too short', () => {
    const r = assessSample(tone(1, 0.3), VERIFY_THRESHOLDS)
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toMatch(/Too little speech/)
  })
  it('rejects clipped audio', () => {
    const r = assessSample(tone(3, 1.5).map((x) => Math.max(-1, Math.min(1, x))), ENROLL_THRESHOLDS)
    expect(r.issues.join(' ')).toMatch(/clipped/)
  })
  it('accepts a clean, voiced-length signal', () => {
    expect(assessSample(tone(3, 0.3), ENROLL_THRESHOLDS).ok).toBe(true)
  })
})

describe('challenge phrases', () => {
  it('are fresh per call', () => {
    expect(challengePhrase()).toMatch(/^MEDIQ owner check: /)
    expect(new Set(Array.from({ length: 10 }, () => challengePhrase())).size).toBeGreaterThan(5)
  })
})
