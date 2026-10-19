import type { Patient, Vitals } from '../db/schema'

export function ageFromDob(dob: string, now = new Date()): number | null {
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const diff = (now - new Date(iso).getTime()) / 1000
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`
  return `${Math.round(diff / 86400)} d ago`
}

export const notDocumented = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 'Not documented' : String(v))

export function latestVitals(p: Patient): Vitals | null {
  if (!p.vitals.length) return null
  return [...p.vitals].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]
}

export function bp(v: Vitals | null): string | null {
  return v && v.systolic !== null && v.diastolic !== null ? `${v.systolic}/${v.diastolic}` : null
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')
}
