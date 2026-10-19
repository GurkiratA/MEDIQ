import { getMic } from './audio'

/**
 * Recording a voice-enrollment clip.
 *
 * Uses the same shared microphone stream as VAD (audio.ts's getMic()) rather
 * than opening a second one — Chrome drops the earlier stream if you don't.
 * A MediaStreamTrack supports more than one consumer, so this runs fine
 * alongside VAD without stealing the mic from it.
 */

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Records `seconds` of microphone audio and hands it back base64-encoded,
 *  the same shape a camera frame travels back in. */
export async function recordEnrollment(seconds: number): Promise<{ data: string; mimeType: string }> {
  const stream = await getMic()
  const mime = pickMime()
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start()
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  if (recorder.state !== 'inactive') recorder.stop()
  await stopped

  const type = recorder.mimeType || mime || 'audio/webm'
  const blob = new Blob(chunks, { type })
  if (!blob.size) throw new Error('No audio was captured — check the microphone.')
  return { data: await blobToBase64(blob), mimeType: type }
}
