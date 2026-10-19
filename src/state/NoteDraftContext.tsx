import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { generate as runGeneration, providerLabel, type GenerationResult } from '../ai/client'
import { draftToText } from '../ai/localEngine'
import { DEMO_SINUSITIS_NOTE } from '../ai/demoScenarios'
import type { VisitType } from '../db/schema'
import { buildPatientContext } from '../lib/patientContext'
import { useData } from './DataContext'

export type InputSource = 'typed' | 'dictated' | 'demo-scenario'

export interface NoteDraft {
  patientId: string
  text: string
  inputSources: InputSource[]
  visitType: VisitType
  generating: boolean
  progress: string | null
  result: GenerationResult | null
  /** Editable final note (starts as the formatted model draft). */
  finalText: string
  finalEdited: boolean
  error: string | null
}

interface NoteDraftApi {
  drafts: Record<string, NoteDraft>
  get: (patientId: string) => NoteDraft
  setText: (patientId: string, text: string) => void
  appendDictation: (patientId: string, text: string) => void
  loadDemoScenario: (patientId: string) => void
  setVisitType: (patientId: string, t: VisitType) => void
  setFinalText: (patientId: string, text: string) => void
  generate: (patientId: string) => Promise<GenerationResult | null>
  discard: (patientId: string) => void
}

const empty = (patientId: string): NoteDraft => ({
  patientId,
  text: '',
  inputSources: [],
  visitType: 'Outpatient',
  generating: false,
  progress: null,
  result: null,
  finalText: '',
  finalEdited: false,
  error: null,
})

const Ctx = createContext<NoteDraftApi | null>(null)

/** Drafts live in memory only (never persisted) until the clinician explicitly confirms a save. */
export function NoteDraftProvider({ children }: { children: ReactNode }) {
  const { snap, log } = useData()
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({})
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const patch = useCallback((patientId: string, p: Partial<NoteDraft> | ((d: NoteDraft) => Partial<NoteDraft>)) => {
    setDrafts((cur) => {
      const d = cur[patientId] ?? empty(patientId)
      return { ...cur, [patientId]: { ...d, ...(typeof p === 'function' ? p(d) : p) } }
    })
  }, [])

  const get = useCallback((patientId: string) => drafts[patientId] ?? empty(patientId), [drafts])

  const addSource = (d: NoteDraft, s: InputSource) => (d.inputSources.includes(s) ? d.inputSources : [...d.inputSources, s])

  const setText = useCallback((id: string, text: string) => patch(id, (d) => ({ text, inputSources: text ? addSource(d, 'typed') : [] })), [patch])
  const appendDictation = useCallback(
    (id: string, text: string) => patch(id, (d) => ({ text: d.text ? `${d.text.trimEnd()} ${text}` : text, inputSources: addSource(d, 'dictated') })),
    [patch],
  )
  const loadDemoScenario = useCallback((id: string) => patch(id, { text: DEMO_SINUSITIS_NOTE, inputSources: ['demo-scenario'], result: null, finalText: '', finalEdited: false, error: null }), [patch])
  const setVisitType = useCallback((id: string, visitType: VisitType) => patch(id, { visitType }), [patch])
  const setFinalText = useCallback((id: string, finalText: string) => patch(id, { finalText, finalEdited: true }), [patch])
  const discard = useCallback((id: string) => setDrafts((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== id))), [])

  const generate = useCallback(
    async (patientId: string) => {
      const d = draftsRef.current[patientId] ?? empty(patientId)
      if (!snap) return null
      const patient = snap.patients.find((p) => p.id === patientId)
      if (!patient) {
        patch(patientId, { error: `Patient ${patientId} not found.` })
        return null
      }
      if (!d.text.trim()) {
        patch(patientId, { error: 'Enter or dictate the visit note first.' })
        return null
      }
      if (d.generating) return null
      patch(patientId, { generating: true, error: null, progress: 'Running local deterministic rules…' })
      try {
        const ctx = buildPatientContext(patient, snap.medications)
        const result = await runGeneration(snap.settings.providerMode, d.text, ctx, (stage) => patch(patientId, { progress: stage }))
        patch(patientId, { result, generating: false, progress: null, finalText: draftToText(result.primary.note), finalEdited: false })
        await log({
          kind: 'note-generated',
          category: 'ai',
          mode: d.inputSources.includes('demo-scenario') ? 'simulation' : 'live',
          message: `Draft generated for patient ${patientId} by ${providerLabel(result.primary.source, result.primary.model)}; audit: ${result.audit ? providerLabel(result.audit.source, result.audit.model) : 'local rules only'}.`,
          patientId,
          details: { documentation: result.primary.source, audit: result.audit?.source ?? 'local-rules', mode: result.mode },
        })
        if (result.primary.fallbackReason)
          await log({
            kind: 'fallback-activated',
            category: 'ai',
            mode: 'live',
            message: `Model A (${result.primary.attempted}) failed; local deterministic draft used instead.`,
            patientId,
            details: { reason: result.primary.fallbackReason.slice(0, 180) },
          })
        if (result.auditUnavailableReason && (result.mode === 'hybrid' || result.mode === 'gemini'))
          await log({
            kind: 'ai-provider-failure',
            category: 'ai',
            mode: 'live',
            message: 'Gemini safety audit unavailable; local deterministic safety rules shown instead.',
            patientId,
            details: { reason: result.auditUnavailableReason.slice(0, 180) },
          })
        return result
      } catch (err) {
        patch(patientId, { generating: false, progress: null, error: err instanceof Error ? err.message : String(err) })
        return null
      }
    },
    [snap, patch, log],
  )

  const value = useMemo(
    () => ({ drafts, get, setText, appendDictation, loadDemoScenario, setVisitType, setFinalText, generate, discard }),
    [drafts, get, setText, appendDictation, loadDemoScenario, setVisitType, setFinalText, generate, discard],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNoteDrafts() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNoteDrafts outside NoteDraftProvider')
  return v
}
