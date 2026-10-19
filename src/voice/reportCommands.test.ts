import { describe, expect, it, vi } from 'vitest'
import type { Authorization, DoctorProfile } from '../db/schema'
import { parseCommand } from './commands'
import { gateVoiceCommand } from './gate'
import { assessSample } from './quality'
import { routeCommand, type RouterDeps } from './router'
import { britishScore, pickBritishVoice } from './tts'
import { decide, SPEAKER_MODEL_TYPE } from './verification'

describe('report voice commands', () => {
  it.each([
    ['MEDIQ, show me the patient report.', { type: 'open-report', report: 'summary' }],
    ['Open the clinical summary.', { type: 'open-report', report: 'summary' }],
    ['MEDIQ, open the patient summary', { type: 'open-report', report: 'summary' }],
    ['Display the latest visit note.', { type: 'open-report', report: 'visit' }],
    ['Show me the visit report', { type: 'open-report', report: 'visit' }],
    ['Bring up the medication report', { type: 'open-report', report: 'medications' }],
    ['open the lab report', { type: 'open-report', report: 'labs' }],
    ['show the vitals report', { type: 'open-report', report: 'vitals' }],
    ['Close the report.', { type: 'close-report', all: false }],
    ['close', { type: 'close-report', all: false }],
    ['close all reports', { type: 'close-report', all: true }],
    ['Make this report larger', { type: 'resize-report', direction: 'larger' }],
    ['make it smaller', { type: 'resize-report', direction: 'smaller' }],
    ['Scroll down', { type: 'scroll-report', direction: 'down' }],
    ['scroll up', { type: 'scroll-report', direction: 'up' }],
    ['Return to the dashboard', { type: 'show-dashboard' }],
  ])('%s', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected)
  })

  it('keeps existing navigation phrases unchanged', () => {
    expect(parseCommand('Show medications')).toEqual({ type: 'show-medications' })
    expect(parseCommand('show lab results')).toEqual({ type: 'show-labs' })
    expect(parseCommand('Start a visit note')).toEqual({ type: 'start-note' })
    expect(parseCommand('Summarize this visit')).toEqual({ type: 'summarize' })
    expect(parseCommand('Read that summary')).toEqual({ type: 'read-summary' })
    expect(parseCommand('Open patient 104')).toEqual({ type: 'open-patient', patientId: '104' })
    expect(parseCommand('Show available rooms')).toEqual({ type: 'show-rooms', filter: 'available' })
  })

  it('never turns arbitrary speech into an action', () => {
    expect(parseCommand('prescribe amoxicillin and save the note').type).toBe('unknown')
    expect(parseCommand('delete patient 104').type).toBe('unknown')
  })
})

function deps(over: Partial<RouterDeps> = {}) {
  const reports = { open: vi.fn(), hasOpen: vi.fn(() => true), closeTop: vi.fn(() => true), closeAll: vi.fn(), scaleTop: vi.fn(() => true), scrollTop: vi.fn(() => true) }
  const d: RouterDeps = {
    activePatientId: '104',
    navigate: vi.fn(),
    back: vi.fn(() => true),
    shiftPatientTab: vi.fn(),
    patientExists: (id) => id === '104',
    hasDraftText: () => false,
    generateSummary: vi.fn(),
    latestSummary: () => null,
    speak: vi.fn(),
    stopListening: vi.fn(),
    reports,
    ...over,
  }
  return { d, reports }
}

describe('report routing', () => {
  it('opens a floating report for the active patient', () => {
    const { d, reports } = deps()
    const r = routeCommand({ type: 'open-report', report: 'medications' }, d)
    expect(r.executed).toBe(true)
    expect(reports.open).toHaveBeenCalledWith('medications', '104')
    expect(d.navigate).not.toHaveBeenCalled()
  })

  it('asks for a patient rather than guessing one', () => {
    const { d, reports } = deps({ activePatientId: null })
    const r = routeCommand({ type: 'open-report', report: 'summary' }, d)
    expect(r.executed).toBe(false)
    expect(reports.open).not.toHaveBeenCalled()
  })

  it('close / resize / scroll act on the front report, and say so when none is open', () => {
    const { d, reports } = deps()
    expect(routeCommand({ type: 'close-report', all: false }, d).executed).toBe(true)
    expect(reports.closeTop).toHaveBeenCalled()
    routeCommand({ type: 'resize-report', direction: 'larger' }, d)
    expect(reports.scaleTop).toHaveBeenCalledWith(1.2)
    routeCommand({ type: 'scroll-report', direction: 'down' }, d)
    expect(reports.scrollTop).toHaveBeenCalledWith('down')

    reports.hasOpen.mockReturnValue(false)
    const r = routeCommand({ type: 'close-report', all: true }, d)
    expect(r.executed).toBe(false)
    expect(r.message).toMatch(/No report is open/)
    expect(reports.closeAll).not.toHaveBeenCalled()
  })
})

const profile = (id: string, embedding: number[], extra: Partial<DoctorProfile> = {}): DoctorProfile => ({
  id,
  displayName: `Dr ${id}`,
  clinicianId: 'SYN-CLN-0001',
  role: 'Owner',
  enrollmentStatus: 'Enrolled',
  enrolledAt: '2026-10-19T00:00:00.000Z',
  lastVerifiedAt: null,
  voiceModel: { type: SPEAKER_MODEL_TYPE, version: '1', dimensions: embedding.length, threshold: 0.5 },
  embedding,
  sampleCount: 3,
  enrollmentConsistency: 0.9,
  revokedAt: null,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  ...extra,
})
const grant = (profileId: string, active = true): Authorization => ({
  id: `G-${profileId}`,
  profileId,
  permissions: ['voice-navigation'],
  grantedBy: 'owner',
  grantedAt: '2026-10-19T00:00:00.000Z',
  revokedAt: active ? null : '2026-10-19T01:00:00.000Z',
  revokedBy: active ? null : 'owner',
  active,
})
const vec = (i: number) => Array.from({ length: 16 }, (_, k) => (k === i ? 1 : 0))
const opts = { threshold: 0.5, margin: 0.08, permission: 'voice-navigation' as const }
const okQuality = assessSample(new Float32Array(16000 * 2).map((_, i) => 0.2 * Math.sin(i / 8) * (i % 4000 < 3000 ? 1 : 0.02)))

describe('speaker-verification gate for spoken commands', () => {
  /** Mirrors VoiceContext: parse → verify → gate → execute only if allowed. */
  function handle(decision: ReturnType<typeof decide> | null, error: string | null = null) {
    const open = vi.fn()
    const { d } = deps({ reports: { open, hasOpen: () => false, closeTop: () => false, closeAll: () => {}, scaleTop: () => false, scrollTop: () => false } })
    const gate = gateVoiceCommand({ decision, quality: okQuality, error })
    if (gate.allowed) routeCommand(parseCommand('show me the patient report'), d)
    return { gate, open }
  }

  it('executes for an enrolled, authorized speaker', () => {
    const { gate, open } = handle(decide(vec(0), [profile('A', vec(0))], [grant('A')], opts))
    expect(gate.allowed).toBe(true)
    expect(open).toHaveBeenCalledWith('summary', '104')
  })

  it('rejects an unknown speaker — nothing opens', () => {
    const { gate, open } = handle(decide(vec(7), [profile('A', vec(0))], [grant('A')], opts))
    expect(gate).toMatchObject({ allowed: false, reason: 'rejected' })
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a revoked doctor whose voice still matches', () => {
    const { gate, open } = handle(decide(vec(0), [profile('A', vec(0), { revokedAt: '2026-10-19T01:00:00.000Z' })], [grant('A', false)], opts))
    expect(gate).toMatchObject({ allowed: false, reason: 'rejected', decision: { outcome: 'revoked' } })
    expect(open).not.toHaveBeenCalled()
  })

  it('fails closed when no one is enrolled, on a poor sample, or when verification is unavailable', () => {
    expect(handle(decide(vec(0), [], [], opts)).open).not.toHaveBeenCalled()
    expect(handle(null).gate).toMatchObject({ allowed: false, reason: 'poor-sample' })
    expect(handle(null, 'model failed').gate).toMatchObject({ allowed: false, reason: 'unavailable' })
  })
})

describe('British voice selection', () => {
  const v = (name: string, lang: string) => ({ name, lang })
  it('prefers an installed en-GB voice and never picks a non-English one', () => {
    expect(pickBritishVoice([v('Samantha', 'en-US'), v('Google UK English Male', 'en-GB'), v('Daniel', 'en-GB')])?.name).toBe('Daniel')
    expect(pickBritishVoice([v('Google US English', 'en-US'), v('Google UK English Female', 'en-GB')])?.name).toBe('Google UK English Female')
    expect(pickBritishVoice([v('Thomas', 'fr-FR'), v('Alex', 'en-US')])).toBeNull()
    expect(britishScore(v('Bad News', 'en-GB'))).toBeLessThan(0)
  })
})
