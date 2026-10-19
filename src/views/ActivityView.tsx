import { Activity, Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '../components/ui'
import type { ActivityCategory } from '../db/schema'
import { fmtDateTime } from '../lib/format'
import { useData, useSnap } from '../state/DataContext'
import { useToast } from '../state/ToastContext'
import { OwnerCheck } from './OwnerCheck'

const CATS: (ActivityCategory | 'all')[] = ['all', 'security', 'clinical', 'allocation', 'ai', 'system']

export function ActivityView() {
  const snap = useSnap()
  const { run } = useData()
  const toast = useToast()
  const [cat, setCat] = useState<ActivityCategory | 'all'>('all')
  const [mode, setMode] = useState<'all' | 'live' | 'simulation'>('all')
  const [resetOpen, setResetOpen] = useState(false)
  const [includeVoice, setIncludeVoice] = useState(false)
  const [ownerCheck, setOwnerCheck] = useState(false)
  const [importJson, setImportJson] = useState<{ name: string; json: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const owner = snap.doctors.find((d) => d.role === 'Owner')

  const events = snap.activity.filter((e) => (cat === 'all' || e.category === cat) && (mode === 'all' || e.mode === mode))

  const exportData = async () => {
    const json = await run((db) => db.exportClinical())
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `mediq-synthetic-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    await run((db) => db.log({ kind: 'data-exported', category: 'system', mode: 'live', message: 'Synthetic clinical records exported (voice profiles excluded).' }))
    toast({ tone: 'ok', title: 'Export downloaded', body: 'Synthetic clinical records only — no voice profiles or settings.' })
  }

  return (
    <>
      <PageHeader title="Activity Log" icon={<Activity className="size-5" />} subtitle="Local demo activity and security events. No raw audio, transcripts or secrets are recorded." />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="text-xs text-ink-muted">
            Category{' '}
            <select className="input ml-1 inline-block h-8 w-auto py-0" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            Mode{' '}
            <select className="input ml-1 inline-block h-8 w-auto py-0" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="all">all</option>
              <option value="live">live</option>
              <option value="simulation">simulation</option>
            </select>
          </label>
          <span className="text-xs text-ink-faint">{events.length} event(s)</span>
        </div>
        {events.length === 0 ? (
          <EmptyState title="No events for this filter" />
        ) : (
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[11rem_1fr_auto] sm:items-start">
                <span className="text-xs text-ink-faint">{fmtDateTime(e.at)}</span>
                <span className="text-ink">
                  {e.message}
                  <span className="block text-[11px] text-ink-faint">
                    {e.kind}
                    {e.patientId && ` · patient ${e.patientId}`}
                    {Object.entries(e.details).length > 0 && ` · ${Object.entries(e.details).map(([k, v]) => `${k}=${v}`).join(', ')}`}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Badge tone={e.mode === 'simulation' ? 'sim' : 'neutral'}>{e.mode}</Badge>
                  <Badge tone={e.category === 'security' ? 'cyan' : 'neutral'}>{e.category}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Demo data management" />
        <div className="flex flex-wrap gap-2 p-4">
          <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>
            Reset demo data…
          </Button>
          <Button icon={<Download className="size-4" />} onClick={() => void exportData()}>
            Export synthetic records
          </Button>
          <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
            Import synthetic records…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (f.size > 2_000_000) return toast({ tone: 'error', title: 'File too large' })
              setImportJson({ name: f.name, json: await f.text() })
            }}
          />
        </div>
      </Card>

      <ConfirmDialog
        open={resetOpen && !ownerCheck}
        title="Reset demo data"
        target="All synthetic clinical databases in this browser"
        changes={[
          { label: 'Patients, rooms, admissions', before: 'Current state', after: 'Original seed' },
          { label: 'Medications & effects', before: 'Current state', after: 'Original seed' },
          { label: 'Visit notes (incl. saved notes)', before: `${snap.visits.length} visits`, after: 'Original seed visits only' },
          { label: 'Activity log', before: `${snap.activity.length} events`, after: 'Cleared' },
          { label: 'Voice profiles & authorizations', before: `${snap.doctors.length} profile(s)`, after: includeVoice ? 'Deleted' : 'Kept' },
          { label: 'Settings', before: 'Current', after: 'Kept' },
        ]}
        warnings={['This permanently deletes notes and changes you made in this demo. It cannot be undone.', ...(includeVoice && owner ? ['Deleting voice profiles requires owner verification.'] : [])]}
        source="Manual action"
        confirmLabel="Reset now"
        danger
        extra={
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-teal" checked={includeVoice} onChange={(e) => setIncludeVoice(e.target.checked)} /> Also delete all voice profiles and authorizations
          </label>
        }
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          if (includeVoice && owner) {
            setOwnerCheck(true)
            return
          }
          await run((db) => db.resetDemoData({ includeVoiceProfiles: includeVoice }))
          setResetOpen(false)
          toast({ tone: 'ok', title: 'Demo data restored to seed' })
        }}
      />
      {ownerCheck && (
        <OwnerCheck
          purpose="Delete all voice profiles during reset"
          onCancel={() => setOwnerCheck(false)}
          onVerified={async () => {
            setOwnerCheck(false)
            await run((db) => db.resetDemoData({ includeVoiceProfiles: true }))
            setResetOpen(false)
            toast({ tone: 'ok', title: 'Demo data and voice profiles reset' })
          }}
        />
      )}

      <ConfirmDialog
        open={!!importJson}
        title="Import synthetic records"
        target={importJson?.name ?? ''}
        changes={[{ label: 'Clinical databases', before: 'Current state', after: 'Replaced by file contents (after validation)' }]}
        warnings={['Only MEDIQ synthetic exports are accepted. The file is schema-validated and checked for referential consistency before anything is replaced. Voice profiles are unaffected.']}
        source="Local file chosen by you"
        confirmLabel="Validate & import"
        danger
        extra={<Alert tone="info">Never import real patient data.</Alert>}
        onCancel={() => setImportJson(null)}
        onConfirm={async () => {
          await run((db) => db.importClinical(importJson!.json))
          setImportJson(null)
          toast({ tone: 'ok', title: 'Import complete' })
        }}
      />
    </>
  )
}
