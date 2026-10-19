import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

/**
 * Decode whatever compressed audio the browser recorded (webm/opus, ogg,
 * mp4 — whichever MediaRecorder picked) into raw mono float32 PCM in [-1, 1]
 * at a given sample rate. voiceauth.mjs's speaker-model.mjs is the consumer:
 * it needs samples in the same range Web Audio's decodeAudioData would
 * produce, not the ~48kHz stereo/opus the browser actually sends.
 *
 * Reuses the same ffmpeg binary screen-native.mjs already bundles — no new
 * dependency, and it's the one tool already proven to handle this machine's
 * media reliably.
 */
export function decodeToFloat32(buffer, sampleRate) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegPath,
      ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ar', String(sampleRate), '-ac', '1', '-f', 'f32le', 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const chunks = []
    let stderr = ''
    proc.stdout.on('data', (d) => chunks.push(d))
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 2000) stderr = stderr.slice(-2000)
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
        return
      }
      const buf = Buffer.concat(chunks)
      // Read sample-by-sample rather than aliasing the Buffer's own
      // ArrayBuffer as a Float32Array view — Buffer.concat's result can sit
      // at a non-4-byte-aligned offset inside a pooled ArrayBuffer, and
      // Float32Array requires 4-byte alignment. Correct regardless of
      // pooling, at a cost that's irrelevant for a few seconds of audio.
      const n = buf.length >> 2
      const pcm = new Float32Array(n)
      for (let i = 0; i < n; i++) pcm[i] = buf.readFloatLE(i * 4)
      resolve(pcm)
    })
    proc.stdin.on('error', () => {
      /* ffmpeg closing stdin early on a decode error is expected, not a bug */
    })
    proc.stdin.end(buffer)
  })
}
