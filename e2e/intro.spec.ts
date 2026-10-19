import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('mediq-synthetic'); q.onsuccess = q.onerror = q.onblocked = () => r() }))
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
})

test('opening sequence: gate → music → checks → hand-off to the workspace', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const intro = page.getByRole('dialog', { name: 'MEDIQ start-up' })
  await expect(intro).toBeVisible()
  // Onboarding waits until the intro is done.
  await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0)
  const music = page.waitForRequest((r) => r.url().endsWith('/audio/boot-music.mp3'))
  await page.getByRole('button', { name: 'Initialise MEDIQ' }).click()
  await music
  await expect(intro.getByRole('heading', { name: 'MEDIQ' })).toBeVisible({ timeout: 5000 })
  await expect(intro.getByText('5 synthetic records')).toBeVisible({ timeout: 8000 })
  await expect(intro.getByText('Armed · enrolment required')).toBeVisible()
  // Ends by itself (speech end or the hard stop) and hands over.
  await expect(intro).toHaveCount(0, { timeout: 16_000 })
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByRole('heading', { name: 'Clinical overview' })).toBeVisible()
  // Not replayed when moving between screens, nor on reload in the same tab.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Patients' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Overview' }).click()
  await expect(intro).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Clinical overview' })).toBeVisible()
  await expect(intro).toHaveCount(0)
  expect(errors).toEqual([])
})

test('skip at any time (Esc), and replay from the menu', async ({ page }) => {
  const intro = page.getByRole('dialog', { name: 'MEDIQ start-up' })
  await page.getByRole('button', { name: 'Initialise MEDIQ' }).click()
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
  await expect(intro).toHaveCount(0)
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Replay intro' }).click()
  await expect(intro).toBeVisible()
  await intro.getByRole('button', { name: /Skip intro/ }).click()
  await expect(intro).toHaveCount(0)
})
