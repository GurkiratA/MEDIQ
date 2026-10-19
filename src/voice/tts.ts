/**
 * Text-to-speech via the browser's speechSynthesis. Never speaks record
 * content unless the user explicitly asks (button press or voice command).
 */
import { useEffect, useState } from 'react'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/**
 * MEDIQ's spoken persona is a calm British voice. Browsers only expose the
 * voices installed on the machine, so this ranks what is available (approach
 * adapted from the JARVIS reference project) and falls back gracefully; it
 * cannot guarantee a particular voice exists.
 */
export function britishScore(v: Pick<SpeechSynthesisVoice, 'name' | 'lang'>): number {
  const n = v.name.toLowerCase()
  let s = 0
  if (n.startsWith('daniel')) s += 100
  else if (n.includes('google uk english male')) s += 90
  else if (/\b(oliver|arthur|george|ryan|thomas|alfie|lewis|malcolm|jamie)\b/.test(n)) s += 80
  else if (n.includes('google uk english female')) s += 60
  else if (/\b(serena|kate|libby|sonia|maisie|hazel|stephanie|martha)\b/.test(n)) s += 55
  if (n.includes('premium')) s += 30
  else if (n.includes('enhanced') || n.includes('neural') || n.includes('natural')) s += 20
  if (/en[-_]gb/i.test(v.lang)) s += 40
  else if (/^en/i.test(v.lang)) s += 2
  else s -= 500
  if (/grandma|grandpa|bubbles|jester|bells|boing|whisper|zarvox|superstar|trinoids|wobble|bahh|organ|cellos|bad news|good news|albert|fred|junior/.test(n)) s -= 300
  return s
}

/** Best British-English voice installed, or null if there is none. */
export function pickBritishVoice<V extends Pick<SpeechSynthesisVoice, 'name' | 'lang'>>(voices: V[]): V | null {
  const ranked = voices.map((v) => ({ v, s: britishScore(v) })).filter((x) => x.s >= 40).sort((a, b) => b.s - a.s)
  return ranked[0]?.v ?? null
}

/** Resolves once the browser has loaded its voice list (or after `ms`). */
export function voicesReady(ms = 1200): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([])
  const now = window.speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done)
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', done)
    window.setTimeout(done, ms)
  })
}

export interface SpeakOptions {
  voiceURI?: string | null
  rate?: number
  pitch?: number
  lang?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (msg: string) => void
}

type Listener = (s: { speaking: boolean; paused: boolean; text: string | null }) => void
const listeners = new Set<Listener>()
let current: { speaking: boolean; paused: boolean; text: string | null } = { speaking: false, paused: false, text: null }
const emit = (patch: Partial<typeof current>) => {
  current = { ...current, ...patch }
  listeners.forEach((l) => l(current))
}

export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!ttsSupported() || !text.trim()) {
    opts.onError?.('Text-to-speech is not supported in this browser.')
    return false
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voices = synth.getVoices()
  // An explicit choice in Voice settings wins; otherwise the British persona; then any voice in the language.
  const byUri = opts.voiceURI ? voices.find((v) => v.voiceURI === opts.voiceURI) : undefined
  const british = byUri ? null : pickBritishVoice(voices)
  const byLang = opts.lang ? voices.find((v) => v.lang.startsWith(opts.lang!.slice(0, 2))) : undefined
  const voice = byUri ?? british ?? byLang
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? (british ? 'en-GB' : (opts.lang ?? 'en-GB'))
  u.rate = (opts.rate ?? 1) * (byUri ? 1 : 0.96)
  u.pitch = opts.pitch ?? (byUri ? 1 : 0.95)
  u.onstart = () => {
    emit({ speaking: true, paused: false, text })
    opts.onStart?.()
  }
  u.onend = () => {
    emit({ speaking: false, paused: false, text: null })
    opts.onEnd?.()
  }
  u.onerror = (e) => {
    emit({ speaking: false, paused: false, text: null })
    if (e.error !== 'canceled' && e.error !== 'interrupted') opts.onError?.(`Speech output failed (${e.error}).`)
  }
  emit({ speaking: true, paused: false, text })
  synth.speak(u)
  return true
}

export function pauseSpeech() {
  if (!ttsSupported()) return
  window.speechSynthesis.pause()
  emit({ paused: true })
}
export function resumeSpeech() {
  if (!ttsSupported()) return
  window.speechSynthesis.resume()
  emit({ paused: false })
}
export function stopSpeech() {
  if (!ttsSupported()) return
  window.speechSynthesis.cancel()
  emit({ speaking: false, paused: false, text: null })
}

export function useSpeechState() {
  const [s, setS] = useState(current)
  useEffect(() => {
    listeners.add(setS)
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return s
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (ttsSupported() ? window.speechSynthesis.getVoices() : []))
  useEffect(() => {
    if (!ttsSupported()) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}
