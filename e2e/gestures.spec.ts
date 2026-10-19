/**
 * Hand-gesture interaction, end to end in Chromium.
 *
 * Headless Chromium has no real hands, so these tests feed synthetic
 * MediaPipe-format landmark frames (src/gestures/synthetic.ts) into the SAME
 * per-frame pipeline the camera loop uses (dev-only `window.__mediqHands.feed`):
 * HandTracker → PointerBridge → real elementFromPoint hit-testing → the
 * floating panel's own pointer handlers. Only the camera + MediaPipe inference
 * are bypassed; the camera/model load path is covered in demo.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test'
import { synthHand, type SynthPose } from '../src/gestures/synthetic'

const VW = 1440
const VH = 900
type H = { x: number; y: number; pose?: SynthPose; side?: 'Left' | 'Right' }

class Hands {
  private now = 0
  constructor(private page: Page) {}
  async init() {
    this.now = await this.page.evaluate(() => performance.now())
  }
  /** Feeds `n` frames (33 ms apart) of the given hands. */
  async hold(hands: H[], n = 1) {
    const frames = []
    for (let i = 0; i < n; i++) {
      this.now += 33
      frames.push({ now: this.now, raw: hands.map((h) => synthHand(h.x, h.y, { pose: h.pose ?? 'point', side: h.side ?? 'Right', vw: VW, vh: VH })) })
    }
    return this.page.evaluate((fs) => {
      const api = (window as unknown as { __mediqHands: { feed: (r: unknown, n: number) => unknown } }).__mediqHands
      let last: unknown = null
      for (const f of fs) last = api.feed(f.raw, f.now)
      return last as { id: number; x: number; y: number; pinched: boolean; pose: string }[]
    }, frames)
  }
  /** Moves one hand from a to b over `steps` frames with a given pose. */
  async move(from: H, to: H, steps = 12, other: H[] = []) {
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      await this.hold([{ ...from, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, ...other])
    }
  }
  /** Settle in place, pinch, and confirm the pinch registered. */
  async pinchAt(h: H) {
    await this.hold([{ ...h, pose: 'point' }], 14)
    const r = await this.hold([{ ...h, pose: 'pinch' }], 6)
    expect(r[0].pinched).toBe(true)
  }
}

async function openSummary(page: Page) {
  await page.getByRole('button', { name: /^104 Marcus Vance/ }).click()
  await page.getByRole('button', { name: 'Open clinical summary for patient 104' }).click()
  const panel = page.getByRole('dialog', { name: 'Clinical summary' })
  await expect(panel).toBeVisible()
  await page.waitForTimeout(350) // open animation
  return panel
}

const box = async (page: Page) => (await page.getByRole('dialog', { name: 'Clinical summary' }).boundingBox())!

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('mediq.introSeen', '1'))
  await page.goto('/')
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mediq-synthetic'); q.onsuccess = q.onerror = q.onblocked = () => r() }))
  await page.reload()
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByRole('heading', { name: 'Clinical overview' })).toBeVisible()
})

test('pinch anywhere on the report body drags it; release drops it', async ({ page }) => {
  await openSummary(page)
  const hands = new Hands(page)
  await hands.init()
  const b0 = await box(page)
  // Grab deep inside the body (a table area), far from the header.
  const grab = { x: b0.x + b0.width * 0.5, y: b0.y + b0.height * 0.6 }
  await hands.pinchAt(grab)
  await hands.move({ ...grab, pose: 'pinch' }, { x: grab.x - 300, y: grab.y + 60, pose: 'pinch' }, 15)
  await hands.hold([{ x: grab.x - 300, y: grab.y + 60, pose: 'pinch' }], 10) // let the smoothed cursor arrive
  await hands.hold([{ x: grab.x - 300, y: grab.y + 60, pose: 'point' }], 6) // release
  const b1 = await box(page)
  expect(b1.x - b0.x).toBeGreaterThan(-320)
  expect(b1.x - b0.x).toBeLessThan(-270)
  expect(b1.y - b0.y).toBeGreaterThan(40)
  expect(b1.y - b0.y).toBeLessThan(80)
  // Moving after release does not move the panel (no stuck drag).
  await hands.move({ x: grab.x - 300, y: grab.y + 60 }, { x: 200, y: 700 }, 10)
  expect((await box(page)).x).toBeCloseTo(b1.x, 0)
  await expect(page.getByRole('dialog', { name: 'Clinical summary' })).toBeVisible() // a drag never clicks
})

test('two hands pinching resize the report about its centre', async ({ page }) => {
  await openSummary(page)
  const hands = new Hands(page)
  await hands.init()
  const b0 = await box(page)
  const cy = b0.y + b0.height / 2
  const L = { x: b0.x + 60, y: cy, side: 'Left' as const }
  const R = { x: b0.x + b0.width - 60, y: cy, side: 'Right' as const }
  await hands.hold([{ ...L, pose: 'point' }, { ...R, pose: 'point' }], 14)
  await hands.hold([{ ...L, pose: 'pinch' }, { ...R, pose: 'pinch' }], 6)
  // Pull apart symmetrically: 120 px each side.
  for (let i = 1; i <= 15; i++) await hands.hold([{ ...L, x: L.x - i * 8, pose: 'pinch' }, { ...R, x: R.x + i * 8, pose: 'pinch' }])
  await hands.hold([{ ...L, x: L.x - 120, pose: 'pinch' }, { ...R, x: R.x + 120, pose: 'pinch' }], 12)
  const big = await box(page)
  expect(big.width).toBeGreaterThan(b0.width * 1.2)
  expect(big.height).toBeGreaterThan(b0.height * 1.05)
  // Centre preserved (within clamping): the panel did not drift with either hand.
  expect(Math.abs(big.x + big.width / 2 - (b0.x + b0.width / 2))).toBeLessThan(60)

  // Bring hands together → smaller.
  for (let i = 1; i <= 20; i++) await hands.hold([{ ...L, x: L.x - 120 + i * 14, pose: 'pinch' }, { ...R, x: R.x + 120 - i * 14, pose: 'pinch' }])
  await hands.hold([{ ...L, x: L.x + 160, pose: 'pinch' }, { ...R, x: R.x - 160, pose: 'pinch' }], 12)
  await hands.hold([{ ...L, x: L.x + 160, pose: 'point' }, { ...R, x: R.x - 160, pose: 'point' }], 6)
  const small = await box(page)
  expect(small.width).toBeLessThan(b0.width)
  await expect(page.getByRole('dialog', { name: 'Clinical summary' })).toBeVisible()
})

test('two-finger pose over the report scrolls it (and does not drag)', async ({ page }) => {
  const panel = await openSummary(page)
  const hands = new Hands(page)
  await hands.init()
  const b0 = await box(page)
  const scroller = panel.locator('[data-panel-scroll]')
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  const at = { x: b0.x + b0.width / 2, y: b0.y + b0.height * 0.75 }
  await hands.hold([{ ...at, pose: 'peace' }], 12)
  await hands.move({ ...at, pose: 'peace' }, { x: at.x, y: at.y - 200, pose: 'peace' }, 20)
  const top = await scroller.evaluate((el) => el.scrollTop)
  expect(top).toBeGreaterThan(150)
  // Hand down → back up the report.
  await hands.move({ x: at.x, y: at.y - 200, pose: 'peace' }, { x: at.x, y: at.y - 100, pose: 'peace' }, 10)
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(top)
  const b1 = await box(page)
  expect(b1.x).toBeCloseTo(b0.x, 0)
  expect(b1.y).toBeCloseTo(b0.y, 0)
})

test('pinch-click on controls: launch a second report and close one with ×', async ({ page }) => {
  await openSummary(page)
  const hands = new Hands(page)
  await hands.init()
  // Hand-click the "Visit note" launcher on the dashboard.
  const launcher = (await page.getByRole('button', { name: 'Open latest visit note for patient 104' }).boundingBox())!
  const l = { x: launcher.x + launcher.width / 2, y: launcher.y + launcher.height / 2 }
  await hands.pinchAt(l)
  await hands.hold([{ ...l, pose: 'point' }], 6)
  await expect(page.getByRole('dialog', { name: 'Latest visit note' })).toBeVisible()
  await page.waitForTimeout(300)

  const close = (await page.getByRole('dialog', { name: 'Latest visit note' }).getByRole('button', { name: 'Close report' }).boundingBox())!
  const c = { x: close.x + close.width / 2, y: close.y + close.height / 2 }
  await hands.pinchAt(c)
  await hands.hold([{ ...c, pose: 'point' }], 6)
  await expect(page.getByRole('dialog', { name: 'Latest visit note' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Clinical summary' })).toBeVisible()
})

test('holding a fist over a report closes it; a brief fist does not', async ({ page }) => {
  await openSummary(page)
  const hands = new Hands(page)
  await hands.init()
  const b = await box(page)
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  await hands.hold([{ ...at, pose: 'point' }], 10)
  await hands.hold([{ ...at, pose: 'fist' }], 12) // ~0.4 s, incl. pose hold
  await hands.hold([{ ...at, pose: 'point' }], 10)
  await expect(page.getByRole('dialog', { name: 'Clinical summary' })).toBeVisible()
  await hands.hold([{ ...at, pose: 'fist' }], 40) // ~1.3 s
  await expect(page.getByRole('dialog', { name: 'Clinical summary' })).toHaveCount(0)
})

test('losing the hand mid-drag releases the panel; a returning hand does not drag it', async ({ page }) => {
  await openSummary(page)
  const hands = new Hands(page)
  await hands.init()
  const b0 = await box(page)
  const grab = { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }
  await hands.pinchAt(grab)
  await hands.move({ ...grab, pose: 'pinch' }, { x: grab.x - 150, y: grab.y, pose: 'pinch' }, 10)
  await hands.hold([], 3) // tracking lost
  const b1 = await box(page)
  await hands.hold([{ x: grab.x - 150, y: grab.y, pose: 'pinch' }], 3) // comes back already pinched
  await hands.move({ x: grab.x - 150, y: grab.y, pose: 'pinch' }, { x: grab.x - 400, y: grab.y + 100, pose: 'pinch' }, 10)
  const b2 = await box(page)
  expect(b2.x).toBeCloseTo(b1.x, 0)
  expect(b2.y).toBeCloseTo(b1.y, 0)
})

test('hand presses are refused inside confirmation dialogs', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Rooms & Admissions' }).click()
  await page.getByRole('button', { name: 'Assign patient', exact: true }).click()
  await page.getByLabel('Patient', { exact: true }).selectOption('104')
  await page.getByLabel('Room (available only)').selectOption('R303')
  await page.getByRole('button', { name: 'Review proposed change' }).click()
  const box2 = (await page.getByRole('checkbox', { name: /I have reviewed this exact change/ }).boundingBox())!
  const hands = new Hands(page)
  await hands.init()
  const at = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }
  await hands.pinchAt(at)
  await hands.hold([{ ...at, pose: 'point' }], 6)
  await expect(page.getByRole('checkbox', { name: /I have reviewed this exact change/ })).not.toBeChecked()
})

test('mouse fallback: drag by header, resize by grip, Esc closes', async ({ page }) => {
  const panel = await openSummary(page)
  const b0 = await box(page)
  await page.mouse.move(b0.x + 200, b0.y + 22)
  await page.mouse.down()
  await page.mouse.move(b0.x + 50, b0.y + 80, { steps: 8 })
  await page.mouse.up()
  const b1 = await box(page)
  expect(b1.x - b0.x).toBeCloseTo(-150, 0)
  expect(b1.y - b0.y).toBeCloseTo(58, 0)

  const grip = (await panel.locator('.fpanel-grip').boundingBox())!
  await page.mouse.move(grip.x + 10, grip.y + 10)
  await page.mouse.down()
  await page.mouse.move(grip.x - 90, grip.y - 60, { steps: 8 })
  await page.mouse.up()
  const b2 = await box(page)
  expect(b2.width).toBeCloseTo(b1.width - 100, 0)

  // Selecting text in the body does not move the panel.
  await page.mouse.move(b2.x + 40, b2.y + 200)
  await page.mouse.down()
  await page.mouse.move(b2.x + 300, b2.y + 260, { steps: 5 })
  await page.mouse.up()
  expect((await box(page)).x).toBeCloseTo(b2.x, 0)

  await panel.getByRole('button', { name: 'Make report larger' }).click()
  expect((await box(page)).width).toBeGreaterThan(b2.width)
  await panel.locator('[data-panel-scroll]').focus()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('typed report commands open, resize, scroll and close panels', async ({ page }) => {
  await page.getByRole('button', { name: /^104 Marcus Vance/ }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Voice Assistant' }).click()
  const run = async (t: string) => {
    // Enter submits; the floating report may legitimately cover the button.
    await page.getByLabel('Type a command').fill(t)
    await page.getByLabel('Type a command').press('Enter')
  }
  await run('bring up the medication report')
  const panel = page.getByRole('dialog', { name: 'Medication report' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Lisinopril')
  const w0 = (await panel.boundingBox())!.width
  await run('make this report larger')
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(w0)
  await run('close the report')
  await expect(panel).toHaveCount(0)

  await run('show me the patient report')
  const summary = page.getByRole('dialog', { name: 'Clinical summary' })
  await expect(summary).toBeVisible()
  await run('scroll down')
  await expect.poll(() => summary.locator('[data-panel-scroll]').evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  await run('close all reports')
  await expect(summary).toHaveCount(0)
})
