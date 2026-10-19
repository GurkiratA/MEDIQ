/**
 * Text-to-speech via the browser's speechSynthesis. Never speaks record
 * content unless the user explicitly asks (button press or voice command).
 */
import { useEffect, useState } from 'react'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

export interface SpeakOptions {
  voiceURI?: string | null
  rate?: number
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
  const byUri = opts.voiceURI ? voices.find((v) => v.voiceURI === opts.voiceURI) : undefined
  const byLang = opts.lang ? voices.find((v) => v.lang.startsWith(opts.lang!.slice(0, 2))) : undefined
  const voice = byUri ?? byLang
  if (voice) u.voice = voice
  if (opts.lang) u.lang = voice?.lang ?? opts.lang
  u.rate = opts.rate ?? 1
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
