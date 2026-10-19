/**
 * Tiny bridge between an open ConfirmDialog and the gesture controller.
 * A thumbs-up gesture may confirm ONLY when a dialog that allows gesture
 * confirmation is open AND the user has ticked "I have reviewed this exact
 * change". Profile-management dialogs never allow gestures.
 */
export interface PendingConfirmation {
  id: string
  title: string
  gestureAllowed: boolean
  reviewed: boolean
  confirm: () => void
}

let pending: PendingConfirmation | null = null
const listeners = new Set<() => void>()

export const confirmBus = {
  set(p: PendingConfirmation | null) {
    pending = p
    listeners.forEach((l) => l())
  },
  update(id: string, patch: Partial<PendingConfirmation>) {
    if (pending?.id === id) {
      pending = { ...pending, ...patch }
      listeners.forEach((l) => l())
    }
  },
  clear(id: string) {
    if (pending?.id === id) confirmBus.set(null)
  },
  get: () => pending,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  /** Called by the gesture controller. Returns a human-readable outcome. */
  tryGestureConfirm(): 'confirmed' | 'no-dialog' | 'not-allowed' | 'not-reviewed' {
    if (!pending) return 'no-dialog'
    if (!pending.gestureAllowed) return 'not-allowed'
    if (!pending.reviewed) return 'not-reviewed'
    pending.confirm()
    return 'confirmed'
  },
}
