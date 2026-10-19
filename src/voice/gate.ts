/**
 * The single rule between speech and action: a spoken command runs only when
 * a fresh sample of the speaker's voice was verified AND that speaker holds an
 * active grant. Verification unavailable, a poor sample, or any non-accepted
 * decision fails closed. Recognition (what was said) never decides identity.
 */
import type { QualityReport } from './quality'
import type { Decision } from './verification'

export type AcceptedDecision = Extract<Decision, { outcome: 'accepted' }>

export type Gate =
  | { allowed: true; decision: AcceptedDecision }
  | { allowed: false; reason: 'unavailable'; error: string }
  | { allowed: false; reason: 'poor-sample'; quality: QualityReport }
  | { allowed: false; reason: 'rejected'; decision: Exclude<Decision, { outcome: 'accepted' }> }

export function gateVoiceCommand(v: { decision: Decision | null; quality: QualityReport; error: string | null }): Gate {
  if (v.error) return { allowed: false, reason: 'unavailable', error: v.error }
  if (!v.decision) return { allowed: false, reason: 'poor-sample', quality: v.quality }
  if (v.decision.outcome !== 'accepted') return { allowed: false, reason: 'rejected', decision: v.decision }
  return { allowed: true, decision: v.decision }
}
