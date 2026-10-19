import { useEffect, useMemo, useRef, useState } from 'react'
import { sendMediq, watchMediq } from '../lib/bridge'
import { mediqCommand } from '../lib/mediqCommand'
import { frameSpan, pinchSpan } from '../lib/hands'
import { PRESSABLE, startWindowDrag } from '../lib/windowDrag'
import { useStore, type DropZone } from '../store'

/**
 * The MEDIQ dashboard.
 *
 * Everything on it is a projection of the bridge's clinical database
 * (bridge/mediq.mjs), pushed as a whole snapshot whenever anything changes —
 * there is no local copy to drift. Three things travel the other way: who is
 * signed in, Confirm, and Reject. Those clicks are the only route by which a
 * change the assistant drafted reaches the record.
 *
 * It lives inside the HUD's stacking context, under the blades and the hand
 * pointer, so an X-ray opened as a blade sits on top of it and pinch-to-click
 * works on every control here exactly as the mouse does.
 */

type Flag = 'normal' | 'high' | 'low' | 'critical' | 'pending'
type Alert = { type: string; note: string; severity?: string; level?: string; drugs?: string; drug?: string }
type Patient = {
  id: string
  name: string
  dob: string
  age: number
  bloodGroup: string
  gender: string
  phone: string
  email: string
  address: string
  allergies: { substance: string; reaction: string; class?: string | null }[]
  medications: { name: string; dose: string }[]
  severity: 'Critical' | 'Severe' | 'Moderate' | 'Mild'
  injuries: string
  xray: { needed: boolean; detail: string }
  labs: { test: string; value: string; flag: Flag }[]
  lastNote: string
  lastVisit: string
  admitted: boolean
  admission: null | { room: string; admittedOn: string; riskLevel: string; emergencyProtocol: string }
  alerts: Alert[]
  notes?: { at: string; type: string; text: string; by: string }[]
}
type Room = { number: string; unit: string; type: string; status: string; patientId: string | null }
type Medication = {
  name: string
  class: string
  mechanism: string
  indication: string
  sideEffects: string
  monitoring: string
  interacts: { with: string; note: string }[]
}
type User = { id: string; name: string; role: 'doctor' | 'nurse' | 'admin'; department: string }
type Change = {
  id: string
  kind: string
  patientId: string | null
  patientName: string
  payload: Record<string, unknown>
  rationale: string
  summary: string
  warnings: Alert[]
  draftedFor: string
  createdAt: string
}
type State = {
  patients: Patient[]
  rooms: Room[]
  medications: Medication[]
  users: User[]
  pending: Change[]
  audit: { at: string; by: string; action: string }[]
  dashboard: {
    totalPatients: number
    admitted: number
    outpatients: number
    bySeverity: { severity: string; count: number }[]
    occupancy: { occupied: number; available: number; cleaning: number; maintenance: number; usableBeds: number }
    urgentAlerts: { patient: string; id: string; room?: string; note: string }[]
    pendingConfirmations: number
  }
  clinician: User | null
  voiceProfiles: number
}
type View = 'overview' | 'patients' | 'rooms' | 'medications' | 'pending' | 'audit'

/**
 * Where the dashboard sits. 'full' is the default near-full-screen panel;
 * 'left' and 'right' dock it to half the screen, so a chart can sit beside an
 * X-ray or a second window; 'float' is wherever a hand or mouse has put it.
 */
type Dock = 'full' | 'left' | 'right' | 'float'
type Rect = { x: number; y: number; w: number; h: number }

const MIN_W = 460
const MIN_H = 320

/** Mirrors PERMISSIONS in bridge/mediq.mjs, for greying out buttons only —
 *  the bridge re-checks on every confirm and is the one that decides. */
const CAN: Record<User['role'], string[]> = {
  doctor: ['*'],
  nurse: ['soap_note', 'visit_summary', 'lab_result', 'room_assign'],
  admin: ['contact_update', 'room_assign', 'admit', 'discharge', 'register_patient'],
}
const allowed = (u: User | null, kind: string) => !!u && (CAN[u.role].includes('*') || CAN[u.role].includes(kind))

const TABS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'patients', label: 'Patients' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'medications', label: 'Medications' },
  { id: 'pending', label: 'Review' },
  { id: 'audit', label: 'Audit' },
]

const sevClass = (s: string) => `mq-sev mq-sev-${s.toLowerCase()}`
const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function speak(language: string, text: string) {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = language
  const prefix = language.toLowerCase().split('-')[0]
  const voice =
    synth.getVoices().find((v) => v.lang.toLowerCase() === language.toLowerCase()) ??
    synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(prefix))
  if (voice) u.voice = voice
  u.rate = 0.95
  synth.speak(u)
}

export function Mediq() {
  const [state, setState] = useState<State | null>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [focus, setFocus] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ level: string; text: string } | null>(null)
  const [spoken, setSpoken] = useState<{ language: string; text: string; original: string } | null>(null)
  const noticeTimer = useRef(0)
  const [dock, setDock] = useState<Dock>('full')
  const [rect, setRect] = useState<Rect | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const bladesOpen = useStore((s) => s.blades.length)

  const close = () => {
    setOpen(false)
    // Next time it opens it opens whole, not wherever it was flung from.
    setDock('full')
    setRect(null)
  }

  const measure = (): Rect | null => {
    const b = panel.current?.getBoundingClientRect()
    return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null
  }

  /** Keep at least a grabbable strip of it on screen, wherever it is put. */
  const clampRect = (r: Rect): Rect => ({
    ...r,
    x: Math.min(window.innerWidth - 120, Math.max(120 - r.w, r.x)),
    y: Math.min(window.innerHeight - 60, Math.max(0, r.y)),
  })

  const drop = (zone: DropZone) => {
    if (zone === 'close') close()
    else if (zone === 'left' || zone === 'right') {
      setDock(zone)
      setRect(null)
    }
  }

  const beginDrag = (e: React.PointerEvent) => {
    const from = measure()
    if (!from) return
    e.preventDefault()
    // The header's handler and the panel's both see a press on the header;
    // only one drag may start.
    e.stopPropagation()
    setDock('float')
    setRect(from)
    startWindowDrag(e, {
      onMove: (dx, dy) => setRect((r) => (r ? clampRect({ ...r, x: r.x + dx, y: r.y + dy }) : r)),
      onDrop: drop,
    })
  }

  /** The title bar drags with a mouse or a hand, except on its controls. */
  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(PRESSABLE)) return
    beginDrag(e)
  }

  /**
   * A pinch anywhere that is not a control picks the whole window up — a hand
   * cannot be asked to land on a 60-pixel title bar. Hands only: a mouse keeps
   * text selection, so a dose can still be copied out of a chart.
   */
  const onBodyDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if ((e.target as HTMLElement).closest(PRESSABLE)) return
    beginDrag(e)
  }

  /**
   * Both hands pinching (or framing) and pulling apart resizes it, about its
   * own centre, exactly as it does a blade. Stands down while a blade is open:
   * blades sit on top, and the two-handed gesture belongs to the one in front.
   */
  useEffect(() => {
    if (!open || bladesOpen) return
    let raf = 0
    let from: { span: number; r: Rect } | null = null
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const span = pinchSpan() ?? frameSpan()
      if (span === null) {
        from = null
        return
      }
      if (!from) {
        const r = measure()
        if (r) from = { span, r }
        return
      }
      const k = span / Math.max(from.span, 40)
      const w = Math.max(MIN_W, Math.min(window.innerWidth * 0.98, from.r.w * k))
      const h = Math.max(MIN_H, Math.min(window.innerHeight * 0.96, from.r.h * k))
      const cx = from.r.x + from.r.w / 2
      const cy = from.r.y + from.r.h / 2
      setDock('float')
      setRect(clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }))
    }
    tick()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bladesOpen])

  const placement: React.CSSProperties | undefined =
    dock === 'left'
      ? { inset: '22px calc(50% + 6px) 30px 30px' }
      : dock === 'right'
        ? { inset: '22px 30px 30px calc(50% + 6px)' }
        : dock === 'float' && rect
          ? { inset: 'auto', left: rect.x, top: rect.y, width: rect.w, height: rect.h }
          : undefined

  useEffect(() => {
    watchMediq((f) => {
      if (f.event === 'state') setState(f.state as State)
      else if (f.event === 'open') {
        setOpen(true)
        if (f.view) setView(f.view as View)
        if (f.patientId) {
          setFocus(f.patientId as string)
          setView('patients')
        }
      } else if (f.event === 'close') close()
      else if (f.event === 'notice') {
        setNotice({ level: String(f.level), text: String(f.text) })
        clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(null), 4200)
      } else if (f.event === 'speak') {
        const s = { language: String(f.language), text: String(f.text), original: String(f.original ?? '') }
        setSpoken(s)
        speak(s.language, s.text)
      }
    })
    // The socket may not be up yet at mount; ask again once it is.
    const t = window.setInterval(() => {
      sendMediq({ op: 'state' }).then(() => clearInterval(t)).catch(() => {})
    }, 1500)
    void sendMediq({ op: 'state' }).then(() => clearInterval(t)).catch(() => {})

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'm' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const showPatient = (id: string) => {
    setFocus(id)
    setView('patients')
  }

  return (
    <>
      {!open && (
        <button className="mq-launch" onClick={() => setOpen(true)} title="Open MEDIQ dashboard (M)">
          <span className="mq-launch-mark">MEDIQ</span>
          <span>Clinical dashboard</span>
          {!!state?.pending.length && <span className="mq-pill mq-pill-warn">{state.pending.length} to review</span>}
          <kbd>M</kbd>
        </button>
      )}

      {open && (
        <div
          ref={panel}
          className={`mq mq-dock-${dock}`}
          style={placement}
          role="dialog"
          aria-label="MEDIQ clinical dashboard"
          onPointerDown={onBodyDown}
        >
          <header className="mq-head" onPointerDown={onHeadDown}>
            <div className="mq-brand">
              <span className="mq-logo">M.E.D.I.Q</span>
              <span className="mq-tagline">Clinical intelligence</span>
            </div>
            <nav className="mq-tabs">
              {TABS.map((t) => (
                <button key={t.id} className={view === t.id ? 'on' : ''} onClick={() => setView(t.id)}>
                  {t.label}
                  {t.id === 'pending' && !!state?.pending.length && <span className="mq-count">{state.pending.length}</span>}
                </button>
              ))}
            </nav>
            <Session state={state} />
            <div className="mq-winbtns">
              <button className={`mq-x ${dock === 'left' ? 'on' : ''}`} onClick={() => drop('left')} title="Dock left — or drag it to the left edge" aria-label="Dock left">
                ◧
              </button>
              <button className={`mq-x ${dock === 'right' ? 'on' : ''}`} onClick={() => drop('right')} title="Dock right — or drag it to the right edge" aria-label="Dock right">
                ◨
              </button>
              {dock !== 'full' && (
                <button className="mq-x" onClick={() => { setDock('full'); setRect(null) }} title="Back to full size" aria-label="Restore">
                  ⤢
                </button>
              )}
              <button className="mq-x mq-x-close" onClick={close} title="Close — or drag it off the bottom" aria-label="Close dashboard">
                ✕
              </button>
            </div>
          </header>

          <CommandBar />

          <main className="mq-body">
            {!state && <div className="mq-empty">Connecting to the MEDIQ records…</div>}
            {state && view === 'overview' && <Overview s={state} onPatient={showPatient} onView={setView} />}
            {state && view === 'patients' && <Patients s={state} focus={focus} setFocus={setFocus} />}
            {state && view === 'rooms' && <Rooms s={state} onPatient={showPatient} />}
            {state && view === 'medications' && <Medications s={state} onPatient={showPatient} />}
            {state && view === 'pending' && <Pending s={state} />}
            {state && view === 'audit' && <Audit s={state} />}
          </main>

          {notice && <div className={`mq-notice mq-notice-${notice.level}`}>{notice.text}</div>}
        </div>
      )}

      {spoken && (
        <div className="mq-speak">
          <div className="mq-speak-head">
            <span>Translation · {spoken.language}</span>
            <button onClick={() => speak(spoken.language, spoken.text)}>Replay</button>
            <button onClick={() => setSpoken(null)} aria-label="Dismiss">✕</button>
          </div>
          <p className="mq-speak-text" lang={spoken.language}>{spoken.text}</p>
          {spoken.original && <p className="mq-speak-orig">{spoken.original}</p>}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Session({ state }: { state: State | null }) {
  const who = state?.clinician
  return (
    <div className="mq-session">
      <span
        className={`mq-pill ${state?.voiceProfiles ? 'mq-pill-ok' : 'mq-pill-dim'}`}
        title={
          state?.voiceProfiles
            ? 'Voice biometrics active — unrecognised voices are ignored.'
            : 'No voice enrolled. Say “enroll my voice” to restrict MEDIQ to verified clinicians.'
        }
      >
        Voice ID {state?.voiceProfiles ? `· ${state.voiceProfiles} enrolled` : 'off'}
      </span>
      <select
        value={who?.id ?? ''}
        onChange={(e) => void sendMediq({ op: 'session', clinicianId: e.target.value || null })}
        aria-label="Signed-in clinician"
      >
        <option value="">Sign in…</option>
        {state?.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} — {u.role}
          </option>
        ))}
      </select>
    </div>
  )
}

function CommandBar() {
  const [text, setText] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (t && mediqCommand(t)) setText('')
  }
  return (
    <form className="mq-command" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type to MEDIQ — e.g. “Which admitted patients are high risk?” or dictate a note"
        aria-label="Type a command"
      />
      <button type="submit" disabled={!text.trim()}>
        Send
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------

function Overview({ s, onPatient, onView }: { s: State; onPatient: (id: string) => void; onView: (v: View) => void }) {
  const d = s.dashboard
  const severe = d.bySeverity.filter((x) => x.severity === 'Critical' || x.severity === 'Severe').reduce((a, b) => a + b.count, 0)
  const admitted = s.patients.filter((p) => p.admitted)
  return (
    <div className="mq-overview">
      <div className="mq-kpis">
        <Kpi label="Patients" value={d.totalPatients} sub={`${d.outpatients} outpatient`} />
        <Kpi label="Admitted" value={d.admitted} sub={`${admitted.filter((p) => p.admission?.riskLevel === 'High').length} high risk`} />
        <Kpi label="Critical / severe" value={severe} tone={severe ? 'hot' : undefined} />
        <Kpi label="Beds occupied" value={`${d.occupancy.occupied}/${d.occupancy.usableBeds}`} sub={`${d.occupancy.available} free · ${d.occupancy.cleaning} cleaning`} />
        <Kpi
          label="Awaiting sign-off"
          value={d.pendingConfirmations}
          tone={d.pendingConfirmations ? 'warn' : undefined}
          onClick={() => onView('pending')}
        />
      </div>

      <div className="mq-cols">
        <section className="mq-card">
          <h3>Urgent alerts</h3>
          {d.urgentAlerts.length === 0 && <p className="mq-dim">No active alerts.</p>}
          <ul className="mq-alerts">
            {d.urgentAlerts.map((a, i) => (
              <li key={i} onClick={() => onPatient(a.id)}>
                <span className="mq-alert-who">
                  {a.patient}
                  {a.room && <span className="mq-dim"> · {a.room}</span>}
                </span>
                <span>{a.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mq-card">
          <h3>Inpatients</h3>
          <table className="mq-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Patient</th>
                <th>State</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {admitted.map((p) => (
                <tr key={p.id} onClick={() => onPatient(p.id)}>
                  <td className="mq-mono">{p.admission?.room}</td>
                  <td>
                    {p.name}
                    <span className="mq-dim"> · {p.age}{p.gender[0]}</span>
                  </td>
                  <td>
                    <span className={sevClass(p.severity)}>{p.severity}</span>
                  </td>
                  <td>
                    <span className={`mq-risk mq-risk-${p.admission?.riskLevel.toLowerCase()}`}>{p.admission?.riskLevel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mq-gap">Severity mix</h3>
          <div className="mq-mix">
            {d.bySeverity.map((x) =>
              x.count ? (
                <div key={x.severity} className={`mq-mix-seg mq-sevbg-${x.severity.toLowerCase()}`} style={{ flex: x.count }}>
                  {x.severity} {x.count}
                </div>
              ) : null,
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone, onClick }: { label: string; value: number | string; sub?: string; tone?: 'hot' | 'warn'; onClick?: () => void }) {
  return (
    <div className={`mq-kpi ${tone ? `mq-kpi-${tone}` : ''} ${onClick ? 'mq-click' : ''}`} onClick={onClick}>
      <span className="mq-kpi-label">{label}</span>
      <span className="mq-kpi-value">{value}</span>
      {sub && <span className="mq-kpi-sub">{sub}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Patients({ s, focus, setFocus }: { s: State; focus: string | null; setFocus: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'all' | 'in' | 'out'>('all')
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return s.patients.filter((p) => {
      if (scope === 'in' && !p.admitted) return false
      if (scope === 'out' && p.admitted) return false
      const hay = [
        p.name, p.id, p.bloodGroup, p.severity, p.injuries, p.admission?.room ?? '',
        ...p.medications.map((m) => m.name), ...p.allergies.map((a) => a.substance),
      ].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [s.patients, q, scope])
  const current = s.patients.find((p) => p.id === focus) ?? list[0] ?? null

  return (
    <div className="mq-split">
      <aside className="mq-list">
        <input
          className="mq-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, ID, drug, allergy, room…"
          aria-label="Search patients"
        />
        <div className="mq-seg">
          {(['all', 'in', 'out'] as const).map((k) => (
            <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>
              {k === 'all' ? 'All' : k === 'in' ? 'Admitted' : 'Outpatient'}
            </button>
          ))}
        </div>
        <ul>
          {list.map((p) => (
            <li key={p.id} className={current?.id === p.id ? 'on' : ''} onClick={() => setFocus(p.id)}>
              <span className="mq-li-name">{p.name}</span>
              <span className="mq-li-meta">
                <span className="mq-mono">{p.id}</span>
                {p.admitted ? ` · ${p.admission?.room}` : ' · Outpatient'}
              </span>
              <span className={sevClass(p.severity)}>{p.severity}</span>
              {p.alerts.length > 0 && <span className="mq-alert-dot" title={`${p.alerts.length} alert(s)`} />}
            </li>
          ))}
          {list.length === 0 && <li className="mq-dim">No match.</li>}
        </ul>
      </aside>
      {current ? <Chart p={current} meds={s.medications} /> : <div className="mq-empty">No patient selected.</div>}
    </div>
  )
}

function Field({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mq-field ${wide ? 'mq-wide' : ''}`}>
      <span className="mq-k">{k}</span>
      <span className="mq-v">{v || <span className="mq-dim">—</span>}</span>
    </div>
  )
}

function Chart({ p, meds }: { p: Patient; meds: Medication[] }) {
  const ref = (name: string) => meds.find((m) => m.name === name)
  return (
    <article className="mq-chart">
      <header className="mq-chart-head">
        <div>
          <h2>{p.name}</h2>
          <span className="mq-dim mq-mono">
            {p.id} · {p.age} y · {p.gender} · {p.bloodGroup}
          </span>
        </div>
        <div className="mq-chart-tags">
          <span className={sevClass(p.severity)}>{p.severity}</span>
          <span className={`mq-pill ${p.admitted ? 'mq-pill-in' : 'mq-pill-dim'}`}>{p.admitted ? 'Admitted' : 'Outpatient'}</span>
        </div>
      </header>

      {p.alerts.length > 0 && (
        <section className="mq-alertbox">
          {p.alerts.map((a, i) => (
            <div
              key={i}
              className={`mq-alertline mq-alertline-${a.severity === 'contraindicated' || a.level === 'major' ? 'hot' : a.type}`}
            >
              <b>
                {a.type === 'interaction'
                  ? `${a.level === 'major' ? 'Major interaction' : 'Interaction'} · ${a.drugs}`
                  : a.type === 'allergy'
                    ? `Allergy · ${a.drug}`
                    : 'Lab'}
              </b>
              <span>{a.note}</span>
            </div>
          ))}
        </section>
      )}

      {p.admitted && p.admission && (
        <section className="mq-admit">
          <Field k="Room number" v={<span className="mq-mono">{p.admission.room}</span>} />
          <Field k="Risk level" v={<span className={`mq-risk mq-risk-${p.admission.riskLevel.toLowerCase()}`}>{p.admission.riskLevel}</span>} />
          <Field k="Admitted" v={fmtDate(p.admission.admittedOn)} />
          <Field k="Emergency protocol" v={p.admission.emergencyProtocol} wide />
        </section>
      )}

      <section className="mq-card">
        <h3>Personal info</h3>
        <div className="mq-grid">
          <Field k="Name" v={p.name} />
          <Field k="Date of birth" v={fmtDate(p.dob)} />
          <Field k="Age" v={`${p.age}`} />
          <Field k="Blood group" v={p.bloodGroup} />
          <Field k="Gender" v={p.gender} />
          <Field k="Phone" v={p.phone} />
          <Field k="E-mail" v={p.email} />
          <Field k="Home address" v={p.address} wide />
        </div>
      </section>

      <section className="mq-card">
        <h3>Clinical</h3>
        <div className="mq-grid">
          <Field
            k="Allergies"
            wide
            v={
              p.allergies.length ? (
                <span className="mq-chips">
                  {p.allergies.map((a) => (
                    <span key={a.substance} className="mq-chip mq-chip-hot" title={a.reaction}>
                      {a.substance} <span className="mq-dim">· {a.reaction}</span>
                    </span>
                  ))}
                </span>
              ) : (
                'No known drug allergies'
              )
            }
          />
          <Field k="State / severity" v={<span className={sevClass(p.severity)}>{p.severity}</span>} />
          <Field k="Last visit" v={fmtDate(p.lastVisit)} />
          <Field k="Area of injuries" v={p.injuries} wide />
          <Field
            k="X-ray needed"
            wide
            v={
              <>
                <b className={p.xray.needed ? 'mq-yes' : 'mq-no'}>{p.xray.needed ? 'Yes' : 'No'}</b> — {p.xray.detail}
              </>
            }
          />
        </div>
      </section>

      <section className="mq-card">
        <h3>Medication</h3>
        {p.medications.length === 0 && <p className="mq-dim">None.</p>}
        <table className="mq-table">
          <tbody>
            {p.medications.map((m) => {
              const r = ref(m.name)
              return (
                <tr key={m.name} title={r ? `${r.mechanism}\n\nMonitoring: ${r.monitoring}` : undefined}>
                  <td>
                    <b>{m.name}</b>
                    {r && <div className="mq-dim mq-small">{r.class}</div>}
                  </td>
                  <td>{m.dose}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="mq-card">
        <h3>Lab results</h3>
        <table className="mq-table">
          <tbody>
            {p.labs.map((l) => (
              <tr key={l.test}>
                <td>{l.test}</td>
                <td className={`mq-flag mq-flag-${l.flag}`}>{l.value}</td>
                <td>
                  <span className={`mq-flagtag mq-flag-${l.flag}`}>{l.flag}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mq-card">
        <h3>Clinician notes on last visit</h3>
        <p className="mq-note">{p.lastNote || <span className="mq-dim">No note yet.</span>}</p>
        {!!p.notes?.length && (
          <>
            <h3 className="mq-gap">Note history</h3>
            {p.notes.map((n, i) => (
              <div key={i} className="mq-hist">
                <span className="mq-dim mq-small">
                  {n.type} · {fmtTime(n.at)} · {n.by}
                </span>
                <p className="mq-note">{n.text}</p>
              </div>
            ))}
          </>
        )}
      </section>
    </article>
  )
}

// ---------------------------------------------------------------------------

function Rooms({ s, onPatient }: { s: State; onPatient: (id: string) => void }) {
  const units = [...new Set(s.rooms.map((r) => r.unit))]
  const who = (id: string | null) => s.patients.find((p) => p.id === id)
  return (
    <div className="mq-rooms">
      <div className="mq-legend">
        {['occupied', 'available', 'cleaning', 'maintenance'].map((k) => (
          <span key={k} className={`mq-room-dot mq-room-${k}`}>{k}</span>
        ))}
      </div>
      {units.map((u) => (
        <section key={u}>
          <h3>{u}</h3>
          <div className="mq-room-grid">
            {s.rooms
              .filter((r) => r.unit === u)
              .map((r) => {
                const p = who(r.patientId)
                return (
                  <div
                    key={r.number}
                    className={`mq-room mq-room-${r.status} ${p ? 'mq-click' : ''}`}
                    onClick={() => p && onPatient(p.id)}
                  >
                    <span className="mq-room-no">{r.number}</span>
                    <span className="mq-dim mq-small">{r.type}</span>
                    {p ? (
                      <>
                        <span className="mq-room-who">{p.name}</span>
                        <span className={`mq-risk mq-risk-${p.admission?.riskLevel.toLowerCase()}`}>{p.admission?.riskLevel} risk</span>
                      </>
                    ) : (
                      <span className="mq-room-who mq-dim">{r.status}</span>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Medications({ s, onPatient }: { s: State; onPatient: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [openRow, setOpenRow] = useState<string | null>(null)
  const list = s.medications.filter((m) => `${m.name} ${m.class} ${m.indication}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="mq-meds">
      <input className="mq-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drug, class or indication…" />
      <table className="mq-table mq-medtable">
        <thead>
          <tr>
            <th>Medication</th>
            <th>Class</th>
            <th>Indication</th>
            <th>Patients</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const on = s.patients.filter((p) => p.medications.some((x) => x.name === m.name))
            const isOpen = openRow === m.name
            return [
              <tr key={m.name} className="mq-click" onClick={() => setOpenRow(isOpen ? null : m.name)}>
                <td>
                  <b>{m.name}</b>
                </td>
                <td className="mq-dim">{m.class}</td>
                <td>{m.indication}</td>
                <td>{on.length || <span className="mq-dim">—</span>}</td>
              </tr>,
              isOpen && (
                <tr key={`${m.name}-x`} className="mq-medx">
                  <td colSpan={4}>
                    <div className="mq-grid">
                      <Field k="Mechanism" v={m.mechanism} wide />
                      <Field k="Side effects" v={m.sideEffects} wide />
                      <Field k="Clinical monitoring" v={m.monitoring} wide />
                      <Field
                        k="Interactions"
                        wide
                        v={
                          m.interacts.length ? (
                            <ul className="mq-ilist">
                              {m.interacts.map((i) => (
                                <li key={i.with}>
                                  <b>{i.with}</b> — {i.note}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            'None recorded in reference'
                          )
                        }
                      />
                      <Field
                        k="Patients on it"
                        wide
                        v={
                          on.length ? (
                            <span className="mq-chips">
                              {on.map((p) => (
                                <button key={p.id} className="mq-chip" onClick={() => onPatient(p.id)}>
                                  {p.name}
                                </button>
                              ))}
                            </span>
                          ) : null
                        }
                      />
                    </div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Payload({ c }: { c: Change }) {
  const p = c.payload
  if (c.kind === 'soap_note') {
    return (
      <dl className="mq-soap">
        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((k) => (
          <div key={k}>
            <dt>{k[0].toUpperCase()}</dt>
            <dd>{String(p[k] ?? '')}</dd>
          </div>
        ))}
      </dl>
    )
  }
  if (c.kind === 'visit_summary') return <p className="mq-note">{String(p.summary ?? '')}</p>
  return (
    <dl className="mq-kv">
      {Object.entries(p).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function Pending({ s }: { s: State }) {
  const who = s.clinician
  return (
    <div className="mq-pending">
      <p className="mq-dim mq-lede">
        Nothing MEDIQ drafts reaches the record until a signed-in clinician confirms it here. Every decision is written to
        the audit log under the confirming clinician’s name.
      </p>
      {!who && <div className="mq-banner">Sign in (top right) to confirm or reject changes.</div>}
      {s.pending.length === 0 && <div className="mq-empty">No changes awaiting review.</div>}
      {s.pending.map((c) => {
        const can = allowed(who, c.kind)
        return (
          <section key={c.id} className="mq-card mq-change">
            <header>
              <span className="mq-pill mq-pill-warn">{c.kind.replace(/_/g, ' ')}</span>
              <span className="mq-dim mq-small mq-mono">
                {c.id} · drafted {fmtTime(c.createdAt)} · for {c.draftedFor}
              </span>
            </header>
            <h4>{c.summary}</h4>
            {c.rationale && <p className="mq-dim">Rationale: {c.rationale}</p>}
            {c.warnings.map((w, i) => (
              <div key={i} className={`mq-alertline mq-alertline-${w.severity === 'contraindicated' ? 'hot' : w.type}`}>
                <b>{w.type}</b>
                <span>{w.note}</span>
              </div>
            ))}
            <Payload c={c} />
            <footer>
              <button className="mq-reject" disabled={!who} onClick={() => void sendMediq({ op: 'decide', id: c.id, decision: 'reject' })}>
                Reject
              </button>
              <button
                className="mq-confirm"
                disabled={!can}
                title={!who ? 'Sign in first' : !can ? `${who.role}s cannot confirm this change` : 'Commit to the permanent record'}
                onClick={() => void sendMediq({ op: 'decide', id: c.id, decision: 'confirm' })}
              >
                Confirm &amp; save
              </button>
            </footer>
          </section>
        )
      })}
    </div>
  )
}

function Audit({ s }: { s: State }) {
  return (
    <div className="mq-audit">
      <table className="mq-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {s.audit.map((a, i) => (
            <tr key={i}>
              <td className="mq-mono mq-nowrap">{fmtTime(a.at)}</td>
              <td className="mq-nowrap">{a.by}</td>
              <td>{a.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
