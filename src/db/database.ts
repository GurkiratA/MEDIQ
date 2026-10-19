/**
 * IndexedDB persistence. One database, one object store per logical
 * database (patients, rooms, admissions, medications, medication effects,
 * visits, doctor profiles, authorizations, activity, settings, meta), all
 * behind a small repository API. Every write is validated with the Zod
 * schemas, and multi-store changes (e.g. a transfer that touches admissions,
 * patients and the activity log) commit in a single transaction.
 *
 * NOTE: browser storage is not tamper-proof. Anyone with access to this
 * browser profile can read or modify it. Synthetic data only.
 */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb'
import { z } from 'zod'
import {
  ActivityEventSchema,
  AdmissionSchema,
  AuthorizationSchema,
  DEFAULT_SETTINGS,
  DoctorProfileSchema,
  MedicationEffectSchema,
  MedicationSchema,
  PatientSchema,
  RoomSchema,
  SettingsSchema,
  VisitSchema,
  type ActivityEvent,
  type Admission,
  type Authorization,
  type DoctorProfile,
  type Medication,
  type MedicationEffect,
  type Patient,
  type Room,
  type Settings,
  type Visit,
} from './schema'
import { SEED_VERSION, seedActivity, seedAdmissions, seedEffects, seedMedications, seedPatients, seedRooms, seedVisits } from './seed'
import { checkConsistency, isActive, planAdmission, planDischarge, planTransfer, type AdmissionInput } from './allocation'

export const DB_NAME = 'mediq-synthetic'
const DB_VERSION = 1

interface MediqSchema extends DBSchema {
  patients: { key: string; value: Patient }
  rooms: { key: string; value: Room }
  admissions: { key: string; value: Admission; indexes: { patientId: string; roomId: string } }
  medications: { key: string; value: Medication; indexes: { patientId: string } }
  medicationEffects: { key: string; value: MedicationEffect; indexes: { patientId: string; medicationId: string } }
  visits: { key: string; value: Visit; indexes: { patientId: string } }
  doctors: { key: string; value: DoctorProfile }
  authorizations: { key: string; value: Authorization; indexes: { profileId: string } }
  activity: { key: string; value: ActivityEvent; indexes: { at: string } }
  settings: { key: string; value: { key: string; value: Settings } }
  meta: { key: string; value: { key: string; value: number | string } }
}

export const CLINICAL_STORES = ['patients', 'rooms', 'admissions', 'medications', 'medicationEffects', 'visits'] as const

export interface Snapshot {
  patients: Patient[]
  rooms: Room[]
  admissions: Admission[]
  medications: Medication[]
  effects: MedicationEffect[]
  visits: Visit[]
  doctors: DoctorProfile[]
  authorizations: Authorization[]
  activity: ActivityEvent[]
  settings: Settings
}

export class StorageError extends Error {}
export class ValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(' '))
  }
}

let counter = 0
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  counter = (counter + 1) % 1000
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}-${rand}`.toUpperCase()
}

const nowIso = () => new Date().toISOString()

/** Aborts a transaction without leaving an unhandled `tx.done` rejection behind. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function abort(tx: IDBPTransaction<any, any, 'readwrite'>) {
  tx.done.catch(() => {})
  tx.abort()
}

function validate<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value)
  if (!r.success) {
    const issue = r.error.issues[0]
    throw new ValidationError([`Invalid ${what}: ${issue?.path.join('.') || '(root)'} — ${issue?.message ?? 'invalid'}`])
  }
  return r.data
}

export type NewActivity = Omit<ActivityEvent, 'id' | 'at' | 'details' | 'patientId' | 'profileId'> &
  Partial<Pick<ActivityEvent, 'details' | 'patientId' | 'profileId'>>

export function makeEvent(e: NewActivity): ActivityEvent {
  return validate(ActivityEventSchema, { id: newId('ACT'), at: nowIso(), patientId: null, profileId: null, details: {}, ...e }, 'activity event')
}

export class MediqDatabase {
  private constructor(private readonly db: IDBPDatabase<MediqSchema>) {}

  static async open(name = DB_NAME): Promise<MediqDatabase> {
    try {
      const db = await openDB<MediqSchema>(name, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('patients', { keyPath: 'id' })
          db.createObjectStore('rooms', { keyPath: 'id' })
          const adm = db.createObjectStore('admissions', { keyPath: 'id' })
          adm.createIndex('patientId', 'patientId')
          adm.createIndex('roomId', 'roomId')
          db.createObjectStore('medications', { keyPath: 'id' }).createIndex('patientId', 'patientId')
          const eff = db.createObjectStore('medicationEffects', { keyPath: 'id' })
          eff.createIndex('patientId', 'patientId')
          eff.createIndex('medicationId', 'medicationId')
          db.createObjectStore('visits', { keyPath: 'id' }).createIndex('patientId', 'patientId')
          db.createObjectStore('doctors', { keyPath: 'id' })
          db.createObjectStore('authorizations', { keyPath: 'id' }).createIndex('profileId', 'profileId')
          db.createObjectStore('activity', { keyPath: 'id' }).createIndex('at', 'at')
          db.createObjectStore('settings', { keyPath: 'key' })
          db.createObjectStore('meta', { keyPath: 'key' })
        },
      })
      const instance = new MediqDatabase(db)
      await instance.ensureSeeded()
      return instance
    } catch (err) {
      if (err instanceof ValidationError) throw err
      throw new StorageError(`Local database unavailable: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  close() {
    this.db.close()
  }

  /** Seeds only when the database has never been seeded — user data is never overwritten on load. */
  private async ensureSeeded() {
    const meta = await this.db.get('meta', 'seedVersion')
    if (meta) return
    await this.writeSeed(true)
  }

  private async writeSeed(includeActivity: boolean) {
    const tx = this.db.transaction([...CLINICAL_STORES, 'activity', 'meta', 'settings'], 'readwrite')
    for (const p of seedPatients) await tx.objectStore('patients').put(validate(PatientSchema, p, 'patient'))
    for (const r of seedRooms) await tx.objectStore('rooms').put(validate(RoomSchema, r, 'room'))
    for (const a of seedAdmissions) await tx.objectStore('admissions').put(validate(AdmissionSchema, a, 'admission'))
    for (const m of seedMedications) await tx.objectStore('medications').put(validate(MedicationSchema, m, 'medication'))
    for (const e of seedEffects) await tx.objectStore('medicationEffects').put(validate(MedicationEffectSchema, e, 'medication effect'))
    for (const v of seedVisits) await tx.objectStore('visits').put(validate(VisitSchema, v, 'visit'))
    if (includeActivity) for (const e of seedActivity) await tx.objectStore('activity').put(e)
    if (!(await tx.objectStore('settings').get('app'))) await tx.objectStore('settings').put({ key: 'app', value: DEFAULT_SETTINGS })
    await tx.objectStore('meta').put({ key: 'seedVersion', value: SEED_VERSION })
    await tx.done
  }

  async snapshot(): Promise<Snapshot> {
    const [patients, rooms, admissions, medications, effects, visits, doctors, authorizations, activity, settingsRow] = await Promise.all([
      this.db.getAll('patients'),
      this.db.getAll('rooms'),
      this.db.getAll('admissions'),
      this.db.getAll('medications'),
      this.db.getAll('medicationEffects'),
      this.db.getAll('visits'),
      this.db.getAll('doctors'),
      this.db.getAll('authorizations'),
      this.db.getAll('activity'),
      this.db.get('settings', 'app'),
    ])
    const parsedSettings = SettingsSchema.safeParse(settingsRow?.value)
    return {
      patients: patients.sort((a, b) => a.id.localeCompare(b.id)),
      rooms: rooms.sort((a, b) => a.floor - b.floor || a.roomNumber.localeCompare(b.roomNumber)),
      admissions,
      medications,
      effects,
      visits: visits.sort((a, b) => b.visitAt.localeCompare(a.visitAt)),
      doctors: doctors.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      authorizations,
      activity: activity.sort((a, b) => b.at.localeCompare(a.at)),
      settings: parsedSettings.success ? parsedSettings.data : DEFAULT_SETTINGS,
    }
  }

  /* --------------------------------------------------------------- activity */

  async log(e: NewActivity): Promise<ActivityEvent> {
    const event = makeEvent(e)
    await this.db.put('activity', event)
    return event
  }

  /* --------------------------------------------------------------- settings */

  async saveSettings(settings: Settings) {
    await this.db.put('settings', { key: 'app', value: validate(SettingsSchema, settings, 'settings') })
  }

  /* --------------------------------------------------------------- admissions */

  private async allocationContext() {
    const [patients, rooms, admissions] = await Promise.all([this.db.getAll('patients'), this.db.getAll('rooms'), this.db.getAll('admissions')])
    return { patients, rooms, admissions }
  }

  /**
   * Commits a planned admission/transfer/discharge. The plan is re-validated
   * against the CURRENT stored state inside the write path, so a stale UI
   * proposal can never double-book a bed.
   */
  async admit(input: AdmissionInput, by: string): Promise<Admission> {
    const ctx = await this.allocationContext()
    const plan = planAdmission(input, ctx, nowIso(), by, newId('ADM'))
    if (!plan.ok) throw new ValidationError(plan.errors)
    const admission = validate(AdmissionSchema, plan.value, 'admission')
    const patient = ctx.patients.find((p) => p.id === input.patientId)!
    await this.commitAllocation(admission, { ...patient, currentVisitStatus: 'Admitted', updatedAt: nowIso() }, {
      kind: 'admission-created',
      category: 'allocation',
      mode: 'live',
      message: `Patient ${patient.id} admitted to bed ${admission.bedId} (confirmed by user).`,
      patientId: patient.id,
      details: { admissionId: admission.id, bedId: admission.bedId },
    })
    return admission
  }

  async transfer(admissionId: string, toRoomId: string, toBedId: string, reason: string, by: string): Promise<Admission> {
    const ctx = await this.allocationContext()
    const plan = planTransfer(admissionId, toRoomId, toBedId, reason, ctx, nowIso(), by)
    if (!plan.ok) throw new ValidationError(plan.errors)
    const admission = validate(AdmissionSchema, plan.value, 'admission')
    const prev = ctx.admissions.find((a) => a.id === admissionId)!
    await this.commitAllocation(admission, null, {
      kind: 'room-transfer',
      category: 'allocation',
      mode: 'live',
      message: `Patient ${admission.patientId} transferred ${prev.bedId} → ${admission.bedId} (confirmed by user).`,
      patientId: admission.patientId,
      details: { admissionId, from: prev.bedId, to: admission.bedId },
    })
    return admission
  }

  async discharge(admissionId: string, by: string): Promise<Admission> {
    const ctx = await this.allocationContext()
    const plan = planDischarge(admissionId, ctx, nowIso(), by)
    if (!plan.ok) throw new ValidationError(plan.errors)
    const admission = validate(AdmissionSchema, plan.value, 'admission')
    const patient = ctx.patients.find((p) => p.id === admission.patientId)
    await this.commitAllocation(admission, patient ? { ...patient, currentVisitStatus: 'Discharged', updatedAt: nowIso() } : null, {
      kind: 'discharge',
      category: 'allocation',
      mode: 'live',
      message: `Admission ${admission.id} discharged; bed ${admission.bedId} released (confirmed by user).`,
      patientId: admission.patientId,
      details: { admissionId, bedId: admission.bedId },
    })
    return admission
  }

  private async commitAllocation(admission: Admission, patient: Patient | null, event: NewActivity) {
    const tx = this.db.transaction(['admissions', 'patients', 'rooms', 'activity'], 'readwrite')
    // Final in-transaction guard against concurrent writes (e.g. two tabs).
    const all = await tx.objectStore('admissions').getAll()
    const clash = all.find((a) => a.id !== admission.id && isActive(a) && isActive(admission) && a.bedId === admission.bedId)
    if (clash) {
      abort(tx)
      throw new ValidationError([`Bed ${admission.bedId} was assigned to ${clash.id} in the meantime.`])
    }
    await tx.objectStore('admissions').put(admission)
    if (patient) await tx.objectStore('patients').put(validate(PatientSchema, patient, 'patient'))
    const rooms = await tx.objectStore('rooms').getAll()
    const patients = await tx.objectStore('patients').getAll()
    const merged = all.filter((a) => a.id !== admission.id).concat(admission)
    const problems = checkConsistency({ rooms, patients, admissions: merged })
    if (problems.length) {
      abort(tx)
      throw new ValidationError(problems)
    }
    await tx.objectStore('activity').put(makeEvent(event))
    await tx.done.catch((err) => {
      throw new StorageError(`Allocation could not be saved: ${err instanceof Error ? err.message : String(err)}`)
    })
  }

  /* --------------------------------------------------------------- visits */

  /**
   * Persists a clinician-confirmed note. Refuses anything that is not
   * explicitly confirmed — generated drafts are never saved automatically.
   */
  async saveConfirmedVisit(visit: Visit): Promise<Visit> {
    if (visit.reviewStatus !== 'Saved (clinician-confirmed)' || !visit.saveConfirmedAt) {
      throw new ValidationError(['A visit note can only be saved after explicit clinician confirmation.'])
    }
    if (!visit.finalNote.trim()) throw new ValidationError(['The final note is empty.'])
    const v = validate(VisitSchema, visit, 'visit')
    const tx = this.db.transaction(['visits', 'patients', 'activity'], 'readwrite')
    const patient = await tx.objectStore('patients').get(v.patientId)
    if (!patient) {
      abort(tx)
      throw new ValidationError([`Patient ${v.patientId} does not exist.`])
    }
    await tx.objectStore('visits').put(v)
    await tx.objectStore('patients').put({ ...patient, updatedAt: nowIso() })
    await tx.objectStore('activity').put(
      makeEvent({
        kind: 'note-saved',
        category: 'clinical',
        mode: 'live',
        message: `Visit note ${v.id} saved for patient ${v.patientId} after explicit confirmation.`,
        patientId: v.patientId,
        details: { visitId: v.id, documentation: v.provenance.documentation, audit: v.provenance.audit ?? 'none' },
      }),
    )
    await tx.done
    return v
  }

  async updateEffectReview(effectId: string, reviewStatus: MedicationEffect['reviewStatus']) {
    const effect = await this.db.get('medicationEffects', effectId)
    if (!effect) throw new ValidationError([`Medication effect ${effectId} does not exist.`])
    const med = await this.db.get('medications', effect.medicationId)
    if (!med || med.patientId !== effect.patientId) throw new ValidationError(['Medication effect references an invalid medication.'])
    await this.db.put('medicationEffects', validate(MedicationEffectSchema, { ...effect, reviewStatus }, 'medication effect'))
  }

  /* --------------------------------------------------------------- doctors & authorizations */

  async addProfile(profile: DoctorProfile, authorization: Authorization, event: NewActivity) {
    const p = validate(DoctorProfileSchema, profile, 'doctor profile')
    const a = validate(AuthorizationSchema, authorization, 'authorization')
    if (a.profileId !== p.id) throw new ValidationError(['Authorization must reference the new profile.'])
    const tx = this.db.transaction(['doctors', 'authorizations', 'activity'], 'readwrite')
    const existing = await tx.objectStore('doctors').getAll()
    if (p.role === 'Owner' && existing.some((d) => d.role === 'Owner')) {
      abort(tx)
      throw new ValidationError(['An owner profile already exists.'])
    }
    if (existing.some((d) => d.clinicianId === p.clinicianId)) {
      abort(tx)
      throw new ValidationError([`Clinician identifier ${p.clinicianId} is already in use.`])
    }
    await tx.objectStore('doctors').put(p)
    await tx.objectStore('authorizations').put(a)
    await tx.objectStore('activity').put(makeEvent(event))
    await tx.done
  }

  async updateProfile(profile: DoctorProfile, event: NewActivity | null) {
    const p = validate(DoctorProfileSchema, profile, 'doctor profile')
    const tx = this.db.transaction(['doctors', 'activity'], 'readwrite')
    if (!(await tx.objectStore('doctors').get(p.id))) {
      abort(tx)
      throw new ValidationError(['Profile not found.'])
    }
    await tx.objectStore('doctors').put(p)
    if (event) await tx.objectStore('activity').put(makeEvent(event))
    await tx.done
  }

  async revokeProfile(profileId: string, by: string, event: NewActivity) {
    const tx = this.db.transaction(['doctors', 'authorizations', 'activity'], 'readwrite')
    const profile = await tx.objectStore('doctors').get(profileId)
    if (!profile) {
      abort(tx)
      throw new ValidationError(['Profile not found.'])
    }
    if (profile.role === 'Owner') {
      abort(tx)
      throw new ValidationError(['The owner profile cannot be revoked. Reset voice profiles instead.'])
    }
    const now = nowIso()
    const grants = await tx.objectStore('authorizations').index('profileId').getAll(profileId)
    for (const g of grants) if (g.active) await tx.objectStore('authorizations').put({ ...g, active: false, revokedAt: now, revokedBy: by })
    await tx.objectStore('doctors').put({ ...profile, revokedAt: now, updatedAt: now })
    await tx.objectStore('activity').put(makeEvent(event))
    await tx.done
  }

  async removeProfile(profileId: string, event: NewActivity) {
    const tx = this.db.transaction(['doctors', 'authorizations', 'activity'], 'readwrite')
    const profile = await tx.objectStore('doctors').get(profileId)
    if (!profile) {
      abort(tx)
      throw new ValidationError(['Profile not found.'])
    }
    if (profile.role === 'Owner') {
      abort(tx)
      throw new ValidationError(['The owner profile cannot be removed here. Use “Reset voice profiles”.'])
    }
    const grants = await tx.objectStore('authorizations').index('profileId').getAll(profileId)
    for (const g of grants) await tx.objectStore('authorizations').delete(g.id)
    await tx.objectStore('doctors').delete(profileId)
    await tx.objectStore('activity').put(makeEvent(event))
    await tx.done
  }

  /* --------------------------------------------------------------- reset / export / import */

  /**
   * Restores the original synthetic seed for every clinical store and clears
   * the activity log. Voice profiles and authorizations are cleared only
   * when `includeVoiceProfiles` is true. Settings are kept.
   */
  async resetDemoData(opts: { includeVoiceProfiles: boolean }) {
    const base: StoreNames<MediqSchema>[] = [...CLINICAL_STORES, 'activity', 'meta']
    const names: StoreNames<MediqSchema>[] = opts.includeVoiceProfiles ? [...base, 'doctors', 'authorizations'] : base
    const tx = this.db.transaction(names, 'readwrite')
    for (const s of names) await tx.objectStore(s).clear()
    await tx.done
    await this.writeSeed(true)
    await this.log({
      kind: 'demo-reset',
      category: 'system',
      mode: 'live',
      message: `Demo data reset to seed v${SEED_VERSION}${opts.includeVoiceProfiles ? ' (voice profiles cleared)' : ' (voice profiles kept)'}.`,
    })
  }

  /** Exports synthetic clinical records only — never voice profiles or settings. */
  async exportClinical(): Promise<string> {
    const s = await this.snapshot()
    return JSON.stringify(
      {
        format: 'mediq-synthetic-export',
        version: 1,
        exportedAt: nowIso(),
        notice: 'SYNTHETIC DEMO DATA — not real patient information.',
        patients: s.patients,
        rooms: s.rooms,
        admissions: s.admissions,
        medications: s.medications,
        medicationEffects: s.effects,
        visits: s.visits,
      },
      null,
      2,
    )
  }

  async importClinical(json: string) {
    const ImportSchema = z.object({
      format: z.literal('mediq-synthetic-export'),
      version: z.literal(1),
      patients: z.array(PatientSchema),
      rooms: z.array(RoomSchema),
      admissions: z.array(AdmissionSchema),
      medications: z.array(MedicationSchema),
      medicationEffects: z.array(MedicationEffectSchema),
      visits: z.array(VisitSchema),
    })
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      throw new ValidationError(['File is not valid JSON.'])
    }
    const data = validate(ImportSchema, raw, 'import file')
    const problems = checkConsistency({ patients: data.patients, rooms: data.rooms, admissions: data.admissions })
    const pids = new Set(data.patients.map((p) => p.id))
    const meds = new Map(data.medications.map((m) => [m.id, m]))
    for (const m of data.medications) if (!pids.has(m.patientId)) problems.push(`Medication ${m.id} references missing patient ${m.patientId}`)
    for (const e of data.medicationEffects) {
      const m = meds.get(e.medicationId)
      if (!m) problems.push(`Effect ${e.id} references missing medication ${e.medicationId}`)
      else if (m.patientId !== e.patientId) problems.push(`Effect ${e.id} patient does not match its medication`)
    }
    for (const v of data.visits) if (!pids.has(v.patientId)) problems.push(`Visit ${v.id} references missing patient ${v.patientId}`)
    if (problems.length) throw new ValidationError(problems.slice(0, 8))

    const tx = this.db.transaction([...CLINICAL_STORES, 'activity'], 'readwrite')
    for (const s of CLINICAL_STORES) await tx.objectStore(s).clear()
    for (const p of data.patients) await tx.objectStore('patients').put(p)
    for (const r of data.rooms) await tx.objectStore('rooms').put(r)
    for (const a of data.admissions) await tx.objectStore('admissions').put(a)
    for (const m of data.medications) await tx.objectStore('medications').put(m)
    for (const e of data.medicationEffects) await tx.objectStore('medicationEffects').put(e)
    for (const v of data.visits) await tx.objectStore('visits').put(v)
    await tx.objectStore('activity').put(makeEvent({ kind: 'data-imported', category: 'system', mode: 'live', message: `Imported ${data.patients.length} synthetic patients.` }))
    await tx.done
  }
}
