/**
 * Deterministic command router. Maps a parsed Command to UI navigation or a
 * draft-preparing action. It never saves, admits, transfers, enrolls or
 * authorizes anything — those always require an explicit confirmation dialog.
 */
import type { NavState } from '../state/NavContext'
import { describeCommand, requiresPatient, type Command } from './commands'
import { REPORT_TITLE, type ReportKind } from '../reports/reportKinds'

export interface RouterDeps {
  activePatientId: string | null
  navigate: (next: Partial<NavState>) => void
  back: () => boolean
  shiftPatientTab: (dir: 1 | -1) => void
  patientExists: (id: string) => boolean
  hasDraftText: (patientId: string) => boolean
  generateSummary: (patientId: string) => void
  latestSummary: (patientId: string) => string | null
  speak: (text: string) => void
  stopListening: () => void
  /** Floating report panels (optional so non-UI callers can omit them). */
  reports?: {
    open: (kind: ReportKind, patientId: string) => void
    hasOpen: () => boolean
    closeTop: () => boolean
    closeAll: () => void
    scaleTop: (factor: number) => boolean
    scrollTop: (dir: 'up' | 'down') => boolean
  }
}

/** Scale applied per "larger"/"smaller" command. */
export const RESIZE_STEP = 1.2

export interface RouteResult {
  executed: boolean
  message: string
  /** Short, non-sensitive spoken acknowledgement. */
  spoken: string | null
}

export function routeCommand(cmd: Command, d: RouterDeps): RouteResult {
  const pid = d.activePatientId
  if (requiresPatient(cmd) && !pid) {
    return { executed: false, message: 'No active patient. Select a patient first (for example, say “Open patient 104”).', spoken: 'Please select a patient first.' }
  }
  const ok = (message: string, spoken: string | null = 'Done.'): RouteResult => ({ executed: true, message, spoken })

  switch (cmd.type) {
    case 'show-dashboard':
      d.navigate({ view: 'overview' })
      return ok('Showing the dashboard.')
    case 'show-patients':
      d.navigate({ view: 'patients', patientId: null })
      return ok('Showing patients.')
    case 'open-patient':
      if (!d.patientExists(cmd.patientId)) return { executed: false, message: `Patient ${cmd.patientId} was not found in the synthetic database.`, spoken: 'Patient not found.' }
      d.navigate({ view: 'patients', patientId: cmd.patientId, patientTab: 'overview' })
      return ok(`Opened patient ${cmd.patientId}.`, 'Opening patient record.')
    case 'show-allergies':
      d.navigate({ view: 'patients', patientId: pid, patientTab: 'overview', focus: 'allergies' })
      return ok('Showing allergies.')
    case 'show-medications':
      if (pid) d.navigate({ view: 'patients', patientId: pid, patientTab: 'medications' })
      else d.navigate({ view: 'medications', medsTab: 'medications' })
      return ok('Showing medications.')
    case 'show-effects':
      d.navigate({ view: 'medications', medsTab: 'effects' })
      return ok('Showing documented medication effects.')
    case 'show-labs':
      d.navigate({ view: 'patients', patientId: pid, patientTab: 'labs' })
      return ok('Showing lab results.')
    case 'show-vitals':
      d.navigate({ view: 'patients', patientId: pid, patientTab: 'vitals' })
      return ok('Showing vital signs.')
    case 'show-rooms':
      d.navigate({ view: 'rooms', roomsTab: 'rooms', roomsFilter: cmd.filter })
      return ok(cmd.filter === 'all' ? 'Showing rooms.' : `Showing ${cmd.filter} rooms.`)
    case 'show-admissions':
      d.navigate({ view: 'rooms', roomsTab: 'admissions' })
      return ok('Showing admissions.')
    case 'start-note':
      d.navigate({ view: 'notes', patientId: pid })
      return ok(`Visit note workflow opened for patient ${pid}.`, 'Visit note ready.')
    case 'summarize':
      d.navigate({ view: 'notes', patientId: pid })
      if (!d.hasDraftText(pid!)) return { executed: false, message: 'There is no note text to summarise yet. Type or dictate the note first.', spoken: 'There is no note to summarise yet.' }
      d.generateSummary(pid!)
      return ok('Generating the structured draft. It will not be saved until you confirm.', 'Generating a draft for your review.')
    case 'read-summary': {
      const s = pid ? d.latestSummary(pid) : null
      if (!s) return { executed: false, message: 'No summary is available to read yet.', spoken: 'No summary is available yet.' }
      d.speak(s)
      return { executed: true, message: 'Reading the draft summary aloud.', spoken: null }
    }
    case 'stop-listening':
      d.stopListening()
      return ok('Stopped listening.', null)
    case 'go-back':
      return d.back() ? ok('Went back.', null) : { executed: false, message: 'Nothing to go back to.', spoken: null }
    case 'next-tab':
      d.shiftPatientTab(1)
      return ok('Next tab.', null)
    case 'previous-tab':
      d.shiftPatientTab(-1)
      return ok('Previous tab.', null)
    case 'help':
      d.navigate({ view: 'voice' })
      return ok('Available commands are listed in the Voice Assistant.', 'The available commands are on screen.')
    case 'open-report': {
      if (!d.reports) return { executed: false, message: 'Reports are not available here.', spoken: null }
      if (!d.patientExists(pid!)) return { executed: false, message: `Patient ${pid} was not found in the synthetic database.`, spoken: 'Patient not found.' }
      d.reports.open(cmd.report, pid!)
      return ok(`${REPORT_TITLE[cmd.report]} opened for patient ${pid}.`, `${REPORT_TITLE[cmd.report]}, patient ${pid}.`)
    }
    case 'close-report': {
      if (!d.reports?.hasOpen()) return { executed: false, message: 'No report is open.', spoken: 'No report is open.' }
      if (cmd.all) d.reports.closeAll()
      else d.reports.closeTop()
      return ok(cmd.all ? 'Closed all reports.' : 'Closed the report.', 'Closed.')
    }
    case 'resize-report': {
      if (!d.reports?.hasOpen()) return { executed: false, message: 'No report is open to resize.', spoken: 'No report is open.' }
      d.reports.scaleTop(cmd.direction === 'larger' ? RESIZE_STEP : 1 / RESIZE_STEP)
      return ok(cmd.direction === 'larger' ? 'Report enlarged.' : 'Report reduced.', null)
    }
    case 'scroll-report': {
      if (!d.reports?.hasOpen()) return { executed: false, message: 'No report is open to scroll.', spoken: 'No report is open.' }
      d.reports.scrollTop(cmd.direction)
      return ok(`Scrolled ${cmd.direction}.`, null)
    }
    case 'unknown':
      return { executed: false, message: `Command not recognised: “${cmd.text.slice(0, 80)}”. Say “help” for the list.`, spoken: 'Sorry, I did not recognise that command.' }
  }
}

export { describeCommand }
