/**
 * Live voice-pipeline test with REAL recorded speech.
 *
 * Everything in MEDIQ's pipeline is real (Web Audio capture, resampling,
 * quality checks, fbank, ONNX speaker embedding, verification decision,
 * authorization, routing). Two browser inputs are replaced by test doubles:
 *   - getUserMedia returns a stream playing a chosen WAV file (no physical mic);
 *   - SpeechRecognition returns a scripted transcript (headless Chromium has
 *     no speech service). Transcripts only decide WHAT command runs — WHO is
 *     speaking is decided solely by the audio.
 *
 * Audio: the public multi-speaker set github.com/csukuangfj/sr-data (not
 * redistributed here). Run with:
 *   git clone --depth 1 https://github.com/csukuangfj/sr-data /tmp/sr-data
 *   MEDIQ_E2E_AUDIO_DIR=/tmp/sr-data npx playwright test e2e/voice-live.spec.ts
 * Enrollment uses enroll/*.wav; verification uses DIFFERENT recordings (test/*.wav).
 */
import { expect, test, type Page } from '@playwright/test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.MEDIQ_E2E_AUDIO_DIR ?? ''
test.skip(!DIR || !existsSync(join(DIR, 'enroll')), 'Set MEDIQ_E2E_AUDIO_DIR to a clone of csukuangfj/sr-data')
test.setTimeout(240_000)

/** Concatenates 16-bit mono WAV files into one WAV buffer. */
function concatWav(files: string[]): Buffer {
  const pcm: Buffer[] = []
  let rate = 16000
  for (const f of files) {
    const b = readFileSync(f)
    rate = b.readUInt32LE(24)
    let off = 12
    while (off < b.length) {
      const id = b.toString('ascii', off, off + 4)
      const size = b.readUInt32LE(off + 4)
      if (id === 'data') {
        pcm.push(b.subarray(off + 8, off + 8 + size))
        break
      }
      off += 8 + size
    }
  }
  const data = Buffer.concat(pcm)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

const clips = (sub: string, speaker: string) =>
  existsSync(join(DIR, sub)) ? readdirSync(join(DIR, sub)).filter((f) => f.startsWith(`${speaker}-`) && f.endsWith('.wav')).sort().map((f) => join(DIR, sub, f)) : []

async function setup(page: Page) {
  await page.route('**/__e2e/audio/*.wav', (route) => {
    const [speaker, set] = route.request().url().split('/').pop()!.replace('.wav', '').split('.')
    return route.fulfill({ body: concatWav(clips(set, speaker)), contentType: 'audio/wav' })
  })
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__voice = 'leijun.enroll'
    w.__transcript = ''
    // Test double: microphone = looping WAV of the selected speaker.
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext()
      const buf = await ctx.decodeAudioData(await (await fetch(`/__e2e/audio/${w.__voice}.wav`)).arrayBuffer())
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const dest = ctx.createMediaStreamDestination()
      src.connect(dest)
      src.start()
      const stream = dest.stream
      const track = stream.getAudioTracks()[0]
      const stop = track.stop.bind(track)
      track.stop = () => {
        stop()
        src.stop()
        void ctx.close()
      }
      return stream
    }
    // Test double: speech recogniser returning a scripted transcript.
    class FakeRecognition {
      lang = 'en-US'
      continuous = false
      interimResults = true
      maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onspeechstart: (() => void) | null = null
      private timer: number | undefined
      private emit() {
        const text = String(w.__transcript)
        this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text, confidence: 0.9 } } } })
      }
      start() {
        if (!this.continuous) this.timer = window.setTimeout(() => { this.emit(); this.onend?.() }, 2600)
      }
      stop() {
        window.clearTimeout(this.timer)
        if (this.continuous) this.emit()
        this.onend?.()
      }
      abort() {
        window.clearTimeout(this.timer)
      }
    }
    w.webkitSpeechRecognition = FakeRecognition
    w.SpeechRecognition = FakeRecognition
  })
}

const as = (page: Page, voice: string, transcript = '') => page.evaluate(([v, t]) => Object.assign(window, { __voice: v, __transcript: t }), [voice, transcript])
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click()

async function recordSamples(page: Page) {
  const dialog = page.getByRole('dialog')
  for (let i = 0; i < 3; i++) {
    await dialog.getByRole('button', { name: 'Record' }).first().click()
    await page.waitForTimeout(4500)
    await dialog.getByRole('button', { name: 'Stop' }).click()
    await expect(dialog.getByText(/dB · accepted/)).toHaveCount(i + 1, { timeout: 30_000 })
  }
  await expect(dialog.getByText('Quality, consistency and duplicate checks passed.')).toBeVisible()
}

async function ownerCheck(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Owner verification required' })
  await expect(dialog).toBeVisible()
  const phrase = (await dialog.locator('p.text-lg').innerText()).replace(/[“”]/g, '')
  await as(page, 'leijun.test', phrase)
  await dialog.getByRole('button', { name: 'Record challenge' }).click()
  await page.waitForTimeout(4500)
  await dialog.getByRole('button', { name: 'Stop & verify' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

async function talk(page: Page, voice: string, transcript: string) {
  await as(page, voice, transcript)
  await page.getByRole('button', { name: /Push to talk/ }).click()
  await expect(page.getByRole('button', { name: /Push to talk/ })).toBeEnabled({ timeout: 30_000 })
  await page.waitForTimeout(300)
}

test('enroll owner, verify, reject unknown, authorize + revoke second doctor', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('mediq.introSeen', '1'))
  await setup(page)
  await page.goto('/')
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mediq-synthetic'); q.onsuccess = q.onerror = q.onblocked = () => r() }))
  await page.reload()

  // 1. Owner enrollment (speaker "leijun", enrollment recordings).
  await page.getByRole('button', { name: 'Enroll owner voice' }).click()
  await page.getByLabel('Display name').fill('Dr. Owner (demo)')
  await page.getByRole('checkbox', { name: /consents/ }).check()
  await page.getByRole('button', { name: 'Continue to recording' }).click()
  await as(page, 'leijun.enroll')
  await recordSamples(page)
  await page.getByRole('button', { name: /Review & save/ }).click()
  await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Owner enrolled')).toBeVisible()

  // 2. Owner's DIFFERENT recordings → command executes after verification.
  await nav(page, 'Overview')
  await talk(page, 'leijun.test', 'open patient 104')
  await expect(page.getByRole('heading', { name: /104 Marcus Vance/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Voice verification status: Verified/ })).toBeVisible()

  // 2b. Floating reports by verified voice; an unknown speaker cannot close them.
  await talk(page, 'leijun.test', 'MEDIQ, show me the patient report')
  const report = page.getByRole('dialog', { name: 'Clinical summary' })
  await expect(report).toBeVisible()
  await expect(report).toContainText('Documented severe allergy')
  await talk(page, 'fangjun.test', 'close the report')
  await expect(page.getByRole('button', { name: /Voice verification status: (Unknown Speaker|Access Denied)/ })).toBeVisible()
  await expect(report).toBeVisible()
  await talk(page, 'leijun.test', 'close the report')
  await expect(report).toHaveCount(0)

  // 3. Unknown speaker → rejected, no navigation.
  await nav(page, 'Overview')
  await talk(page, 'fangjun.test', 'open patient 105')
  await expect(page.getByRole('heading', { name: 'Clinical overview' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Voice verification status: (Unknown Speaker|Access Denied)/ })).toBeVisible()

  // 4. Owner authorizes a second doctor ("liudehua").
  await nav(page, 'Authorized Doctors & Voiceprints')
  await page.getByRole('button', { name: 'Add authorized doctor' }).click()
  await ownerCheck(page)
  await page.getByLabel('Display name').fill('Dr. Second (demo)')
  await page.getByRole('checkbox', { name: /consents/ }).check()
  await page.getByRole('button', { name: 'Continue to recording' }).click()
  await as(page, 'liudehua.enroll')
  await recordSamples(page)
  await page.getByRole('button', { name: /Review & authorize/ }).click()
  await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
  await page.getByRole('button', { name: 'Authorize this doctor' }).click()
  await expect(page.getByText('Doctor authorized')).toBeVisible()

  await nav(page, 'Overview')
  await talk(page, 'liudehua.test', 'show rooms')
  await expect(page.getByRole('heading', { name: 'Rooms & Admissions' })).toBeVisible()

  // 5. Owner revokes the second doctor → their commands are rejected.
  await nav(page, 'Authorized Doctors & Voiceprints')
  await page.getByRole('row', { name: /Dr. Second/ }).getByRole('button', { name: 'Revoke' }).click()
  await ownerCheck(page)
  await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
  await page.getByRole('button', { name: 'Revoke access' }).click()
  await expect(page.getByText('Access revoked')).toBeVisible()
  await nav(page, 'Overview')
  await talk(page, 'liudehua.test', 'show rooms')
  await expect(page.getByRole('heading', { name: 'Clinical overview' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Voice verification status: Access Denied/ })).toBeVisible()

  await nav(page, 'Activity Log')
  for (const t of ['Owner voice profile enrolled', 'Live speaker verification succeeded', 'Live speaker verification rejected', 'explicitly authorized by the owner', 'revoked by owner', 'The matching profile has been revoked'])
    await expect(page.getByText(new RegExp(t)).first()).toBeVisible()

  // Report measured scores (for docs/TEST_RESULTS.md).
  const scores = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('mediq-synthetic')
        open.onsuccess = () => {
          const req = open.result.transaction('activity').objectStore('activity').getAll()
          req.onsuccess = () =>
            resolve(
              (req.result as { at: string; kind: string; details: Record<string, unknown> }[])
                .filter((e) => typeof e.details.score === 'number')
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((e) => `${e.kind} score=${e.details.score} intent=${e.details.intent}`),
            )
        }
      }),
  )
  console.log('MEASURED SCORES\n' + scores.join('\n'))
})
