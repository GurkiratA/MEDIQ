import { WAKE, RECOGNITION_LANG } from './voice'

/**
 * "Hey Mediq" from the ignition screen.
 *
 * Mirrors clap.ts: a second way in, alongside the button and the clap, live
 * only while the ignition screen is showing. Uses the browser's own
 * SpeechRecognition directly rather than going through startVoice/vad — that
 * pair assumes the app is already booted (mode(), phase-aware handlers), and
 * pulling it in here for one regex test would be the tail wagging the dog.
 *
 * Deliberately silent about failure, same reasoning as clap.ts: this is an
 * alternative to the button, not a requirement, so a browser with no
 * SpeechRecognition (or a refused microphone) should quietly do without it
 * rather than report an error about a feature nobody asked for.
 */

export type WakeListener = { stop: () => void }

export function listenForWake(onWake: () => void): WakeListener {
  const Ctor =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  if (!Ctor) return { stop: () => {} }

  let stopped = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rec: any = null

  const spin = () => {
    if (stopped) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec = new (Ctor as any)()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = RECOGNITION_LANG
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript as string
        if (WAKE.test(text)) {
          stopped = true
          try {
            rec.abort()
          } catch {
            /* already gone */
          }
          onWake()
          return
        }
      }
    }
    rec.onerror = () => {
      /* the heartbeat below recovers; a refused mic just never fires onstart */
    }
    rec.onend = () => {
      if (!stopped) setTimeout(spin, 250)
    }
    try {
      rec.start()
    } catch {
      setTimeout(spin, 250)
    }
  }

  spin()

  return {
    stop: () => {
      stopped = true
      try {
        rec?.abort()
      } catch {
        /* already gone */
      }
    },
  }
}
