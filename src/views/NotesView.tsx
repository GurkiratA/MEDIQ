import { clsx } from 'clsx'
import { AlertOctagon, BrainCircuit, CheckCircle2, ClipboardCheck, FileText, FlaskConical, Mic, ShieldAlert, Square, Trash2, Volume2, Wand2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { SafetyAlert, StructuredNote } from '../../shared/aiSchemas'
import { providerLabel, type GenerationResult } from '../ai/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SeverityBadge, SourceTag, type SourceKind } from '../components/display'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, NotDocumented, PageHeader, Spinner, SyntheticTag } from '../components/ui'
import { newId } from '../db/database'
import { VisitType, type Visit } from '../db/schema'
import { ageFromDob } from '../lib/format'
import { useData, useSnap } from '../state/DataContext'
import { useNav } from '../state/NavContext'
import { useNoteDrafts } from '../state/NoteDraftContext'
import { useProviders } from '../state/ProvidersContext'
import { useToast } from '../state/ToastContext'
import { speak } from '../voice/tts'
import { useVoice } from '../voice/VoiceContext'
import { decisionMessage, decisionReason } from '../voice/verification'

type Attributed = SafetyAlert & { sources: { kind: SourceKind; model?: string | null }[] }

const sourceOf = (r: GenerationResult['primary']): { kind: SourceKind; model?: string | null } => ({ kind: r.source === 'local' ? 'local' : r.source, model: r.model })

/** Groups findings by (category, title-ish) and records which sources raised each. */
function attribute(result: GenerationResult): Attributed[] {
  const out: Attributed[] = []
  const add = (a: SafetyAlert, src: { kind: SourceKind; model?: string | null }) => {
    const key = (x: SafetyAlert) => `${x.category}|${x.title.toLowerCase().replace(/[^a-z]/g, '').slice(0, 40)}`
    const existing = out.find((o) => key(o) === key(a) || (o.category === 'allergy-conflict' && a.category === 'allergy-conflict'))
    if (existing) {
      if (!existing.sources.some((s) => s.kind === src.kind)) existing.sources.push(src)
    } else out.push({ ...a, sources: [src] })
  }
  for (const a of result.localAudit.findings) add(a, { kind: 'local-rule' })
  if (result.audit) for (const a of result.audit.audit.findings) add(a, { kind: result.audit.source, model: result.audit.model })
  for (const a of result.primary.note.safetyAlerts) add(a, sourceOf(result.primary))
  const order = ['critical', 'high', 'moderate', 'low', 'info']
  return out.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
}

function List({ items, empty = 'Not documented' }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm italic text-ink-faint">{empty}</p>
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  )
}

function NotePanel({ note }: { note: StructuredNote }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="label">Summary</p>
        <p className="mt-0.5 text-sm text-ink">{note.summary}</p>
      </div>
      <div>
        <p className="label">Chief complaint</p>
        <p className="mt-0.5 text-sm text-ink">{note.chiefComplaint || <NotDocumented value={null} />}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((k) => (
          <div key={k} className="rounded-lg border border-line bg-surface-2 p-2.5">
            <p className="label">{k[0].toUpperCase()} · {k}</p>
            <p className={clsx('mt-0.5 text-sm', note.soap[k] === 'Not documented' ? 'italic text-ink-faint' : 'text-ink')}>{note.soap[k]}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="label">Reported symptoms</p>
          <List items={note.reportedSymptoms} />
        </div>
        <div>
          <p className="label">Relevant history (from note)</p>
          <List items={note.relevantHistory} />
        </div>
        <div>
          <p className="label">Allergies mentioned</p>
          <List items={note.allergiesMentioned} empty="None mentioned in the note" />
        </div>
        <div>
          <p className="label">Documented findings</p>
          <List items={note.documentedFindings} />
        </div>
      </div>
      <div>
        <p className="label mb-1">Medications mentioned (draft entries — not prescriptions)</p>
        {note.medicationsMentioned.length === 0 ? (
          <p className="text-sm italic text-ink-faint">None mentioned</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-ink-muted">
                <tr>
                  {['Name', 'Dose', 'Route', 'Frequency', 'Duration', 'Status'].map((h) => (
                    <th key={h} scope="col" className="px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {note.medicationsMentioned.map((m) => (
                  <tr key={m.name} className="border-t border-line">
                    <td className="px-2 py-1.5 font-medium text-ink">{m.name}</td>
                    <td className="px-2 py-1.5"><NotDocumented value={m.dose} /></td>
                    <td className="px-2 py-1.5"><NotDocumented value={m.route} /></td>
                    <td className="px-2 py-1.5"><NotDocumented value={m.frequency} /></td>
                    <td className="px-2 py-1.5"><NotDocumented value={m.duration} /></td>
                    <td className="px-2 py-1.5"><Badge tone={m.status === 'proposed-in-draft' ? 'warn' : 'neutral'}>{m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <p className="label">Follow-up items</p>
        <List items={note.followUpItems} />
      </div>
    </div>
  )
}

function FindingCard({ f }: { f: Attributed }) {
  return (
    <li className={clsx('rounded-lg border p-3', f.severity === 'critical' ? 'border-danger/60 bg-danger/10' : f.severity === 'high' ? 'border-danger/40 bg-danger/5' : 'border-line bg-surface-2')}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={f.severity} />
        <span className="text-sm font-semibold text-ink">{f.title}</span>
      </div>
      <p className="mt-1 text-sm text-ink">{f.detail}</p>
      {f.evidence.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
          {f.evidence.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        Identified by: {f.sources.map((s) => <SourceTag key={s.kind} kind={s.kind} model={s.model} />)}
      </div>
    </li>
  )
}

export function NotesView() {
  const snap = useSnap()
  const nav = useNav()
  const prov = useProviders()
  const patientId = nav.patientId
  if (!patientId || !snap.patients.some((p) => p.id === patientId))
    return (
      <>
        <PageHeader title="Visit Notes" icon={<FileText className="size-5" />} subtitle="Select a synthetic patient to start a visit note." />
        <Card>
          <ul className="divide-y divide-line">
            {snap.patients.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-2" onClick={() => nav.navigate({ view: 'notes', patientId: p.id })}>
                  <span>
                    <span className="font-mono text-cyan">{p.id}</span> · {p.fullName}
                  </span>
                  <span className="text-xs text-ink-muted">Start note →</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-3 text-xs text-ink-faint">Mode: {prov.effective.documentation} documentation · {prov.effective.audit} audit.</p>
      </>
    )
  return <NoteWorkflow patientId={patientId} />
}

function NoteWorkflow({ patientId }: { patientId: string }) {
  const snap = useSnap()
  const { run } = useData()
  const nav = useNav()
  const toast = useToast()
  const voice = useVoice()
  const drafts = useNoteDrafts()
  const d = drafts.get(patientId)
  const patient = snap.patients.find((p) => p.id === patientId)!
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [dictating, setDictating] = useState<{ level: number; partial: string } | null>(null)
  const [dictationMsg, setDictationMsg] = useState<{ tone: 'ok' | 'danger' | 'warn'; text: string } | null>(null)
  const stopRef = useRef<AbortController | null>(null)

  const result = d.result
  const findings = useMemo(() => (result ? attribute(result) : []), [result])
  const critical = findings.filter((f) => f.severity === 'critical' && f.category === 'allergy-conflict')
  const missing = useMemo(() => {
    if (!result) return []
    const rows: { text: string; sources: SourceKind[] }[] = []
    const push = (t: string, s: SourceKind) => {
      const ex = rows.find((r) => r.text.toLowerCase() === t.toLowerCase())
      if (!ex) rows.push({ text: t, sources: [s] })
      else if (!ex.sources.includes(s)) ex.sources.push(s)
    }
    result.primary.note.missingInformation.forEach((t) => push(t, sourceOf(result.primary).kind))
    result.audit?.audit.missingInformation.forEach((t) => push(t, result.audit!.source))
    result.localAudit.missingInformation.forEach((t) => push(t, 'local-rule'))
    return rows
  }, [result])
  const discrepancies = useMemo(() => {
    if (!result) return []
    return [
      ...result.primary.note.discrepancies.map((t) => ({ t, s: sourceOf(result.primary) })),
      ...(result.audit?.audit.contradictions ?? []).map((t) => ({ t, s: { kind: result.audit!.source as SourceKind, model: result.audit!.model } })),
      ...result.localAudit.contradictions.map((t) => ({ t, s: { kind: 'local-rule' as SourceKind, model: null } })),
    ]
  }, [result])

  const say = (text: string) => speak(text, { voiceURI: snap.settings.ttsVoiceURI, rate: snap.settings.ttsRate, lang: snap.settings.speechLang, onError: (m) => toast({ tone: 'error', title: 'Text-to-speech', body: m }) })

  const startDictation = async () => {
    setDictationMsg(null)
    const ctrl = new AbortController()
    stopRef.current = ctrl
    setDictating({ level: 0, partial: '' })
    voice.cancel('Dictation started')
    try {
      const r = await voice.verifyFresh({
        permission: 'voice-dictation',
        maxSeconds: 60,
        signal: ctrl.signal,
        onLevel: (level) => setDictating((s) => (s ? { ...s, level } : s)),
        onPartial: (partial) => setDictating((s) => (s ? { ...s, partial } : s)),
      })
      if (r.error) setDictationMsg({ tone: 'warn', text: `${r.error} Dictation discarded.` })
      else if (!r.transcriptAvailable) setDictationMsg({ tone: 'warn', text: 'Speech recognition is not supported in this browser. Type the note instead.' })
      else if (!r.decision) setDictationMsg({ tone: 'danger', text: `Voice Not Verified: Access Denied. Sample rejected: ${r.quality.issues.join(' ')} Dictation discarded.` })
      else if (r.decision.outcome !== 'accepted') setDictationMsg({ tone: 'danger', text: `${decisionMessage(r.decision)} ${decisionReason(r.decision)} Dictation discarded.` })
      else if (!r.transcript) setDictationMsg({ tone: 'warn', text: 'Speaker verified, but no speech was transcribed.' })
      else {
        drafts.appendDictation(patientId, r.transcript)
        setDictationMsg({ tone: 'ok', text: `Dictation added after live speaker verification (${r.decision.displayName}, score ${r.decision.score.toFixed(2)}).` })
      }
    } catch (err) {
      setDictationMsg({ tone: 'warn', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setDictating(null)
      stopRef.current = null
    }
  }

  const buildVisit = (): Visit => {
    const now = new Date().toISOString()
    const r = result
    const allFindings: SafetyAlert[] = findings.map(({ sources, ...f }) => ({ ...f, evidence: [...f.evidence, `Identified by: ${sources.map((s) => s.kind).join(', ')}`].slice(0, 10) }))
    return {
      id: newId('VIS'),
      patientId,
      visitAt: now,
      type: d.visitType,
      clinicianId: null,
      clinicianName: snap.doctors.find((x) => x.role === 'Owner')?.displayName ?? null,
      originalText: d.text,
      structuredNote: r?.primary.note ?? null,
      safetyAudit: r?.audit?.audit ?? r?.localAudit ?? null,
      finalNote: d.finalText.trim(),
      missingInformation: missing.map((m) => m.text).slice(0, 40),
      safetyFindings: allFindings.slice(0, 20),
      discrepancies: discrepancies.map((x) => x.t).slice(0, 40),
      reviewStatus: 'Saved (clinician-confirmed)',
      provenance: { documentation: r ? (r.primary.source === 'local' ? 'local' : r.primary.source) : 'manual', audit: r ? (r.audit ? r.audit.source : 'local') : null },
      saveConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  const canSave = !!d.finalText.trim() && !d.generating

  return (
    <>
      <PageHeader
        title="Visit note"
        icon={<FileText className="size-5" />}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-cyan">{patient.id}</span> {patient.fullName} · {ageFromDob(patient.dateOfBirth)} y · <SyntheticTag />
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => nav.navigate({ view: 'patients', patientId, patientTab: 'notes' })}>
              Visit history
            </Button>
            <Button size="sm" variant="ghost" onClick={() => nav.navigate({ view: 'notes', patientId: null })}>
              Change patient
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title="1 · Original dictated or typed text"
          subtitle="Kept verbatim and saved alongside the final note."
          icon={<Mic className="size-4" />}
          actions={
            <span className="flex flex-wrap gap-1">
              {d.inputSources.map((s) => (
                <Badge key={s} tone={s === 'demo-scenario' ? 'sim' : s === 'dictated' ? 'cyan' : 'neutral'}>
                  {s === 'demo-scenario' ? 'Demonstration scenario (synthetic)' : s === 'dictated' ? 'Dictated · speaker-verified' : 'Typed'}
                </Badge>
              ))}
            </span>
          }
        />
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <textarea
              aria-label="Original visit note text"
              className="input min-h-32 font-mono text-[13px] leading-relaxed"
              placeholder="Type the visit note, use verified dictation, or load the demonstration scenario…"
              value={d.text}
              onChange={(e) => drafts.setText(patientId, e.target.value)}
              disabled={d.generating}
            />
            <Field label="Visit type" htmlFor="visit-type">
              <select id="visit-type" className="input" value={d.visitType} onChange={(e) => drafts.setVisitType(patientId, e.target.value as VisitType)}>
                {VisitType.options.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          {dictating && (
            <div className="flex items-center gap-3 rounded-lg border border-cyan/40 bg-cyan/5 px-3 py-2 text-sm" aria-live="polite">
              <span className="h-1.5 w-24 overflow-hidden rounded bg-cyan/20">
                <span className="block h-full bg-cyan" style={{ width: `${Math.round(dictating.level * 100)}%` }} />
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{dictating.partial || 'Listening… dictate the note, then press Stop.'}</span>
            </div>
          )}
          {dictationMsg && <Alert tone={dictationMsg.tone === 'ok' ? 'ok' : dictationMsg.tone === 'danger' ? 'danger' : 'warn'}>{dictationMsg.text}</Alert>}
          <div className="flex flex-wrap gap-2">
            {dictating ? (
              <Button variant="danger" icon={<Square className="size-4" />} onClick={() => stopRef.current?.abort()}>
                Stop & verify dictation
              </Button>
            ) : (
              <Button icon={<Mic className="size-4" />} onClick={() => void startDictation()} disabled={d.generating || !voice.srSupported || !voice.micSupported} title={!voice.srSupported ? 'Speech recognition unsupported in this browser' : undefined}>
                Dictate (speaker-verified)
              </Button>
            )}
            <Button variant="sim" icon={<FlaskConical className="size-4" />} onClick={() => drafts.loadDemoScenario(patientId)} disabled={d.generating || !!dictating}>
              Load demo scenario (synthetic)
            </Button>
            <Button variant="primary" icon={<Wand2 className="size-4" />} loading={d.generating} disabled={!d.text.trim() || !!dictating} onClick={() => void drafts.generate(patientId)}>
              Generate structured draft
            </Button>
            {(d.text || result) && (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setDiscardOpen(true)} disabled={d.generating}>
                Cancel / discard draft
              </Button>
            )}
          </div>
          {d.generating && <Spinner label={d.progress ?? 'Generating…'} />}
          {d.error && <Alert tone="danger">{d.error}</Alert>}
          <p className="text-xs text-ink-faint">Generating never saves anything. Dictation is appended only when the live speaker check passes; the browser’s speech recogniser may use an online service.</p>
        </div>
      </Card>

      {result && (
        <>
          {critical.length > 0 && (
            <div role="alert" className="mt-4 animate-alert-in rounded-xl border-2 border-danger bg-danger/10 p-4">
              <div className="flex items-start gap-3">
                <AlertOctagon className="mt-0.5 size-6 shrink-0 text-danger" />
                <div className="min-w-0 space-y-2">
                  {critical.map((c) => (
                    <div key={c.title}>
                      <p className="text-base font-semibold leading-snug text-danger-soft">{c.detail.startsWith('CRITICAL SAFETY WARNING') ? c.detail : `CRITICAL SAFETY WARNING (as reported by the AI auditor): ${c.detail}`}</p>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-ink">
                        {c.evidence.map((e) => (
                          <li key={e}>• {e}</li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        Identified by: {c.sources.map((s) => <SourceTag key={s.kind} kind={s.kind} model={s.model} />)}
                        {result.audit && !c.sources.some((s) => s.kind === 'gemini' || s.kind === 'hermes') && <span className="text-warn">· The AI auditor did not flag this — auditors disagree; review required.</span>}
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="danger" icon={<Volume2 className="size-3.5" />} onClick={() => say(critical[0].detail.startsWith('CRITICAL') ? critical[0].detail : critical[0].title)}>
                      Read warning aloud
                    </Button>
                    <span className="self-center text-xs text-ink-muted">This warning does not modify the medication list, approve, or save anything.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="2a · Model A — structured documentation draft"
                icon={<BrainCircuit className="size-4" />}
                subtitle="Model-generated draft. Organises only what the note states."
                actions={<SourceTag kind={sourceOf(result.primary).kind} model={result.primary.model} />}
              />
              <div className="space-y-3 p-4">
                {result.primary.fallbackReason && (
                  <Alert tone="warn" title={`${providerLabel(result.primary.attempted ?? 'local')} unavailable — local deterministic draft shown`}>
                    {result.primary.fallbackReason}
                  </Alert>
                )}
                {result.primary.source === 'local' && !result.primary.fallbackReason && <Alert tone="info">Local Demo Fallback: produced by deterministic rules, not by an AI model.</Alert>}
                <NotePanel note={result.primary.note} />
                <Button size="sm" variant="ghost" icon={<Volume2 className="size-3.5" />} onClick={() => say(result.primary.note.summary)}>
                  Read summary aloud
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="2b · Independent safety audit"
                icon={<ShieldAlert className="size-4" />}
                subtitle="Compared against the synthetic record. Potential concerns only."
                actions={result.audit ? <SourceTag kind={result.audit.source} model={result.audit.model} /> : <Badge tone="warn">AI auditor unavailable</Badge>}
              />
              <div className="space-y-4 p-4">
                {result.audit ? (
                  <div>
                    <p className="label mb-1.5">
                      {providerLabel(result.audit.source, result.audit.model)} · overall risk: {result.audit.audit.overallRisk}
                    </p>
                    {result.audit.audit.findings.length === 0 ? (
                      <p className="text-sm text-ink-muted">No findings returned by the AI auditor.</p>
                    ) : (
                      <ul className="space-y-2">
                        {result.audit.audit.findings.map((f) => (
                          <FindingCard key={f.title} f={{ ...f, sources: [{ kind: result.audit!.source, model: result.audit!.model }] }} />
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Alert tone="warn" title="Gemini audit not available">
                    {result.auditUnavailableReason}
                  </Alert>
                )}
                <div>
                  <p className="label mb-1.5 flex items-center gap-2">
                    Local Deterministic Safety Rules <span className="font-normal normal-case tracking-normal text-ink-faint">(always run)</span>
                  </p>
                  {result.localAudit.findings.length === 0 ? (
                    <p className="text-sm text-ink-muted">No rule-based findings. Absence of a flag is not a clinical clearance.</p>
                  ) : (
                    <ul className="space-y-2">
                      {result.localAudit.findings.map((f) => (
                        <FindingCard key={f.title} f={{ ...f, sources: [{ kind: 'local-rule' }] }} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Consensus view" subtitle="Which sources raised each concern — never merged silently" />
              <div className="p-4">
                {findings.length === 0 ? <p className="text-sm text-ink-muted">No safety findings from any source.</p> : <ul className="space-y-2">{findings.map((f) => <FindingCard key={f.title + f.sources.length} f={f} />)}</ul>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Missing information" subtitle="Not documented ≠ negative finding" />
              <div className="p-4">
                {missing.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nothing flagged.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {missing.map((m) => (
                      <li key={m.text} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink">{m.text}</span>
                        {m.sources.map((s) => (
                          <SourceTag key={s} kind={s} className="opacity-80" />
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Discrepancies & record-derived context" />
              <div className="space-y-3 p-4">
                {discrepancies.length === 0 ? (
                  <p className="text-sm text-ink-muted">No discrepancies between note and record were identified.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {discrepancies.map((x, i) => (
                      <li key={i} className="text-ink">
                        {x.t} <SourceTag kind={x.s.kind} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="rounded-lg border border-line bg-surface-2 p-2.5 text-xs">
                  <p className="mb-1 flex items-center gap-1.5">
                    <SourceTag kind="record" /> synthetic record
                  </p>
                  <p className="text-ink">Allergies: {patient.noKnownDrugAllergies ? 'NKDA (documented)' : patient.allergies.map((a) => `${a.substance} (${a.severity}, ${a.reaction})`).join('; ') || 'not documented'}</p>
                  <p className="text-ink">
                    Active medications:{' '}
                    {snap.medications
                      .filter((m) => m.patientId === patientId && m.status === 'Active')
                      .map((m) => `${m.name} ${m.dose ?? '(dose not documented)'}`)
                      .join('; ') || 'none documented'}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader
              title="3 · Final note — review and edit"
              icon={<ClipboardCheck className="size-4" />}
              subtitle="Starts as the model-generated draft. Nothing is saved until you explicitly confirm."
              actions={d.finalEdited ? <Badge tone="cyan">Edited by you</Badge> : <SourceTag kind={sourceOf(result.primary).kind} model={result.primary.model} />}
            />
            <div className="space-y-3 p-4">
              <textarea aria-label="Final note text" className="input min-h-72 font-mono text-[13px] leading-relaxed" value={d.finalText} onChange={(e) => drafts.setFinalText(patientId, e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={<CheckCircle2 className="size-4" />} disabled={!canSave} onClick={() => setConfirmOpen(true)}>
                  Review exact note & save…
                </Button>
                <span className="text-xs text-ink-faint">Saving does not change medication lists, admissions or any prescription.</span>
              </div>
            </div>
          </Card>
        </>
      )}

      {!result && !d.generating && (
        <Card className="mt-4">
          <EmptyState icon={<Wand2 className="size-6" />} title="No draft yet" body="Generate a structured draft to see Model A’s note beside the independent safety audit." />
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Save clinician-confirmed visit note"
        target={`Patient ${patient.id} · ${patient.fullName} (synthetic) · ${d.visitType}`}
        source={
          result
            ? `Original text (${d.inputSources.join(', ') || 'typed'}) → draft by ${providerLabel(result.primary.source, result.primary.model)} → audit by ${result.audit ? providerLabel(result.audit.source, result.audit.model) : 'local rules only'}${d.finalEdited ? ' → edited by you' : ''}`
            : 'Typed by user'
        }
        warnings={[
          ...findings.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => `${f.severity.toUpperCase()}: ${f.title} — recorded with the note as acknowledged findings.`),
          'Saving records documentation only. It does not approve or add any medication.',
        ]}
        exactContent={d.finalText}
        confirmLabel="Confirm & save note"
        gestureAllowed
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const visit = buildVisit()
          await run((db) => db.saveConfirmedVisit(visit))
          setConfirmOpen(false)
          drafts.discard(patientId)
          toast({ tone: 'ok', title: 'Visit note saved', body: `Stored in patient ${patientId}’s visit history (persists after refresh).` })
          nav.navigate({ view: 'patients', patientId, patientTab: 'notes' })
        }}
      />

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this draft?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                drafts.discard(patientId)
                setDiscardOpen(false)
                setDictationMsg(null)
                toast({ tone: 'info', title: 'Draft discarded', body: 'Nothing was saved.' })
              }}
            >
              Discard draft
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">The original text, generated draft and edits for patient {patientId} will be removed from memory. Nothing has been saved.</p>
      </Modal>
    </>
  )
}
