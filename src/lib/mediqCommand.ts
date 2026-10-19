/**
 * How a line typed into the MEDIQ command bar becomes a turn.
 *
 * App owns the conversation and registers the handler; the dashboard, rendered
 * deep inside the HUD, only calls it — so neither has to thread a prop through
 * the other.
 */
let runCommand: ((text: string) => void) | null = null

export function setMediqCommand(fn: (text: string) => void) {
  runCommand = fn
}

export function mediqCommand(text: string): boolean {
  if (!runCommand) return false
  runCommand(text)
  return true
}
