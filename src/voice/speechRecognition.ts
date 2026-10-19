/**
 * Thin wrapper around the Web Speech API's SpeechRecognition.
 * NOTE: in Chrome and Edge, recognition is performed by a browser-managed
 * (remote) service, so the spoken words may leave the device. This is
 * disclosed in the UI. Speaker verification is separate and fully local.
 */

interface SRAlternative {
  transcript: string
  confidence: number
}
interface SRResult {
  isFinal: boolean
  0: SRAlternative
  length: number
}
interface SREvent {
  resultIndex: number
  results: { length: number; [i: number]: SRResult }
}
interface SRErrorEvent {
  error: string
  message?: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type Ctor = new () => SpeechRecognitionLike

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechRecognitionSupported = () => getCtor() !== null

export interface RecognizerHandlers {
  onPartial?: (text: string) => void
  onFinal?: (text: string, confidence: number) => void
  onSpeechStart?: () => void
  onError?: (message: string, code: string) => void
  onEnd?: () => void
}

export function friendlyRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Speech recognition permission was denied.'
    case 'no-speech':
      return 'No speech was heard. Try again a little closer to the microphone.'
    case 'audio-capture':
      return 'No microphone is available for speech recognition.'
    case 'network':
      return 'Speech recognition needs the browser’s online service and the network is unavailable. Use typed commands.'
    case 'aborted':
      return 'Listening stopped.'
    default:
      return `Speech recognition error (${code}).`
  }
}

export class Recognizer {
  private rec: SpeechRecognitionLike | null = null

  start(opts: { lang: string; continuous: boolean }, h: RecognizerHandlers) {
    const C = getCtor()
    if (!C) {
      h.onError?.('Speech recognition is not supported in this browser (use Chrome or Edge), or type the command.', 'unsupported')
      return
    }
    this.abort()
    const rec = new C()
    rec.lang = opts.lang
    rec.continuous = opts.continuous
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onspeechstart = () => h.onSpeechStart?.()
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) h.onFinal?.(r[0].transcript.trim(), r[0].confidence)
        else interim += r[0].transcript
      }
      if (interim) h.onPartial?.(interim.trim())
    }
    rec.onerror = (e) => h.onError?.(friendlyRecognitionError(e.error), e.error)
    rec.onend = () => {
      if (this.rec === rec) this.rec = null
      h.onEnd?.()
    }
    this.rec = rec
    try {
      rec.start()
    } catch (err) {
      h.onError?.(`Could not start speech recognition: ${err instanceof Error ? err.message : String(err)}`, 'start-failed')
    }
  }

  stop() {
    this.rec?.stop()
  }

  abort() {
    const r = this.rec
    this.rec = null
    if (r) {
      r.onend = null
      r.onresult = null
      r.onerror = null
      try {
        r.abort()
      } catch {
        /* ignore */
      }
    }
  }

  get active() {
    return this.rec !== null
  }
}
