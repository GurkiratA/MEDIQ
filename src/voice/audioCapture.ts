/**
 * Microphone capture to mono Float32 PCM at 16 kHz (Web Audio API).
 * Audio stays in memory only long enough to compute an embedding; it is
 * never stored or uploaded. Always call close() to release the microphone.
 */
import { SAMPLE_RATE } from './quality'

const WORKLET = `
class MediqCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('mediq-capture', MediqCapture)
`

export class MicPermissionError extends Error {}

export async function resampleTo16k(input: Float32Array, fromRate: number): Promise<Float32Array> {
  if (fromRate === SAMPLE_RATE || input.length === 0) return input
  const length = Math.max(1, Math.ceil((input.length * SAMPLE_RATE) / fromRate))
  const OAC = window.OfflineAudioContext
  const ctx = new OAC(1, length, SAMPLE_RATE)
  const buf = ctx.createBuffer(1, input.length, fromRate)
  buf.copyToChannel(new Float32Array(input), 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  const out = await ctx.startRendering()
  return out.getChannelData(0).slice()
}

export class MicCapture {
  private chunks: Float32Array[] = []
  private recording = false
  /** Ring buffer of recent audio (for the experimental wake phrase). */
  private ring: Float32Array[] = []
  private ringSamples = 0
  private readonly ringMax: number
  private analyser: AnalyserNode
  private levelBuf: Float32Array<ArrayBuffer>

  private constructor(
    private readonly stream: MediaStream,
    private readonly ctx: AudioContext,
    private readonly node: AudioNode,
    analyser: AnalyserNode,
  ) {
    this.analyser = analyser
    this.levelBuf = new Float32Array(analyser.fftSize)
    this.ringMax = ctx.sampleRate * 10
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined'
  }

  static async open(): Promise<MicCapture> {
    if (!MicCapture.supported()) throw new MicPermissionError('This browser does not support microphone capture.')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicPermissionError('Microphone permission was denied. Allow it in the browser’s site settings, or use typed commands.')
      if (name === 'NotFoundError') throw new MicPermissionError('No microphone was found.')
      throw new MicPermissionError(`Microphone unavailable: ${err instanceof Error ? err.message : String(err)}`)
    }
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    let capture: MicCapture
    const onChunk = (data: Float32Array) => capture.push(data)
    let node: AudioNode
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      const w = new AudioWorkletNode(ctx, 'mediq-capture')
      w.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data)
      node = w
    } catch {
      // Fallback for browsers without AudioWorklet support.
      const sp = ctx.createScriptProcessor(4096, 1, 1)
      sp.onaudioprocess = (e) => onChunk(e.inputBuffer.getChannelData(0).slice())
      node = sp
    }
    source.connect(node)
    // Keep the graph pulling audio without playing it back.
    const mute = ctx.createGain()
    mute.gain.value = 0
    node.connect(mute).connect(ctx.destination)
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    capture = new MicCapture(stream, ctx, node, analyser)
    return capture
  }

  get sampleRate() {
    return this.ctx.sampleRate
  }

  private push(data: Float32Array) {
    if (this.recording) this.chunks.push(data)
    this.ring.push(data)
    this.ringSamples += data.length
    while (this.ringSamples > this.ringMax && this.ring.length > 1) this.ringSamples -= this.ring.shift()!.length
  }

  start() {
    this.chunks = []
    this.recording = true
  }

  /** Stops recording and returns the take resampled to 16 kHz. */
  async stop(): Promise<Float32Array> {
    this.recording = false
    const merged = concat(this.chunks)
    this.chunks = []
    return resampleTo16k(merged, this.ctx.sampleRate)
  }

  /** Last `seconds` of audio from the ring buffer, resampled to 16 kHz. */
  async recent(seconds: number): Promise<Float32Array> {
    const all = concat(this.ring)
    const n = Math.min(all.length, Math.round(seconds * this.ctx.sampleRate))
    return resampleTo16k(all.slice(all.length - n), this.ctx.sampleRate)
  }

  /** Current input level 0..1 (for meters). */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.levelBuf)
    let s = 0
    for (const x of this.levelBuf) s += x * x
    return Math.min(1, Math.sqrt(s / this.levelBuf.length) * 4)
  }

  close() {
    this.recording = false
    this.chunks = []
    this.ring = []
    try {
      this.node.disconnect()
    } catch {
      /* already disconnected */
    }
    this.stream.getTracks().forEach((t) => t.stop())
    void this.ctx.close().catch(() => {})
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Float32Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}
