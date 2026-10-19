/**
 * Records one short clip (enrollment phrase, owner challenge, dictation)
 * with an optional parallel transcript. The microphone is opened for the
 * clip and released immediately afterwards. Audio is returned in memory only.
 */
import { MicCapture } from './audioCapture'
import { Recognizer, speechRecognitionSupported } from './speechRecognition'

export interface ClipResult {
  pcm: Float32Array
  transcript: string
  transcriptAvailable: boolean
}

export interface RecordOptions {
  maxSeconds: number
  signal: AbortSignal
  onLevel?: (level: number) => void
  onPartial?: (text: string) => void
  transcribe?: { lang: string }
}

export async function recordClip(opts: RecordOptions): Promise<ClipResult> {
  const mic = await MicCapture.open()
  const rec = new Recognizer()
  const finals: string[] = []
  const useSr = !!opts.transcribe && speechRecognitionSupported()
  let raf = 0
  try {
    mic.start()
    if (useSr)
      rec.start(
        { lang: opts.transcribe!.lang, continuous: true },
        {
          onPartial: (t) => opts.onPartial?.([...finals, t].join(' ')),
          onFinal: (t) => {
            finals.push(t)
            opts.onPartial?.(finals.join(' '))
          },
        },
      )
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, opts.maxSeconds * 1000)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      if (opts.signal.aborted) done()
      opts.signal.addEventListener('abort', done, { once: true })
      const tick = () => {
        opts.onLevel?.(mic.level())
        raf = requestAnimationFrame(tick)
      }
      if (opts.onLevel) raf = requestAnimationFrame(tick)
    })
    if (useSr) {
      rec.stop()
      // Give the recogniser a moment to deliver its last final result.
      await new Promise((r) => setTimeout(r, 700))
    }
    const pcm = await mic.stop()
    return { pcm, transcript: finals.join(' ').trim(), transcriptAvailable: useSr }
  } finally {
    cancelAnimationFrame(raf)
    rec.abort()
    mic.close()
    opts.onLevel?.(0)
  }
}
