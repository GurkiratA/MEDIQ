import { expect, test, type Page } from '@playwright/test'

const REQUIRED_WARNING =
  "CRITICAL SAFETY WARNING: The proposed amoxicillin entry conflicts with Patient 104's documented severe penicillin allergy and history of anaphylaxis. Do not treat this draft as an approved prescription. Qualified clinician review is required before any medication decision."

async function start(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByRole('heading', { name: 'Clinical overview' })).toBeVisible()
  return errors
}

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click()

test.beforeEach(async ({ page }) => {
  // The cinematic intro has its own test (intro.spec.ts); skip it here.
  await page.addInitScript(() => sessionStorage.setItem('mediq.introSeen', '1'))
  // Fresh synthetic database per test.
  await page.goto('/')
  await page.evaluate(() => new Promise<void>((r) => { const req = indexedDB.deleteDatabase('mediq-synthetic'); req.onsuccess = req.onerror = req.onblocked = () => r() }))
})

test('dashboard, search and Patient 104 record', async ({ page }) => {
  const errors = await start(page)
  await expect(page.getByText('Synthetic patients')).toBeVisible()
  await page.getByRole('combobox', { name: /Search synthetic patients/ }).fill('104')
  await page.getByRole('option').first().click()
  await expect(page.getByRole('heading', { name: /104 Marcus Vance/ })).toBeVisible()
  await expect(page.getByText('Documented severe allergy')).toBeVisible()
  await expect(page.getByText('Anaphylaxis').first()).toBeVisible()
  await expect(page.getByText('138/88 mmHg')).toBeVisible()
  await page.getByRole('tab', { name: /Medications/ }).click()
  await expect(page.getByRole('cell', { name: 'Lisinopril ACE inhibitor' })).toBeVisible()
  await page.getByRole('tab', { name: /Labs/ }).click()
  await expect(page.getByText('HbA1c')).toBeVisible()
  expect(errors).toEqual([])
})

test('room allocation requires review + confirmation and blocks double-booking', async ({ page }) => {
  await start(page)
  await nav(page, 'Rooms & Admissions')
  await page.getByRole('button', { name: 'Assign patient', exact: true }).click()
  await page.getByLabel('Patient', { exact: true }).selectOption('104')
  await page.getByLabel('Room (available only)').selectOption('R303')
  await page.getByRole('button', { name: 'Review proposed change' }).click()
  const confirm = page.getByRole('button', { name: 'Confirm admission' })
  await expect(confirm).toBeDisabled()
  await page.getByRole('checkbox', { name: /I have reviewed this exact change/ }).check()
  await confirm.click()
  await expect(page.getByText('Admission saved')).toBeVisible()
  // The bed is now taken and 104 can't be admitted twice.
  await page.getByRole('button', { name: 'Assign patient', exact: true }).click()
  await expect(page.getByLabel('Patient', { exact: true }).locator('option[value="104"]')).toHaveCount(0)
})

test('penicillin safety scenario: local rule, edit, explicit save, persists after refresh', async ({ page }) => {
  const errors = await start(page)
  await page.getByRole('button', { name: /Demo Quick-Sim/ }).click()
  await page.getByRole('menuitem', { name: /Simulate Clinical Dictation/ }).click()
  await expect(page.getByLabel('Original visit note text')).toHaveValue(/Amoxicillin 500 mg three times daily for 10 days/)
  await page.getByRole('button', { name: 'Generate structured draft' }).click()
  const banner = page.getByRole('alert').filter({ hasText: 'CRITICAL SAFETY WARNING' })
  await expect(banner).toContainText(REQUIRED_WARNING)
  await expect(banner).toContainText('Local Deterministic Safety Rule')
  // No API keys: never claims Gemini produced it.
  await expect(banner).not.toContainText('Google Gemini')
  await expect(page.getByText('Route not documented for Amoxicillin').first()).toBeVisible()

  const final = page.getByLabel('Final note text')
  await final.fill((await final.inputValue()) + '\nClinician edit: allergy conflict reviewed; no prescription approved (synthetic demo).')
  await page.getByRole('button', { name: /Review exact note & save/ }).click()
  const save = page.getByRole('button', { name: 'Confirm & save note' })
  await expect(save).toBeDisabled()
  await page.getByRole('checkbox', { name: /I have reviewed this exact change/ }).check()
  await save.click()
  await expect(page.getByText('Visit note saved')).toBeVisible()
  await expect(page.getByText(/Clinician edit: allergy conflict reviewed/)).toBeVisible()

  await page.reload()
  await page.getByRole('combobox', { name: /Search synthetic patients/ }).fill('104')
  await page.getByRole('option').first().click()
  await page.getByRole('tab', { name: /Visit Notes/ }).click()
  await expect(page.getByText(/Clinician edit: allergy conflict reviewed/)).toBeVisible()
  expect(errors).toEqual([])
})

test('Quick-Sim scenarios are labelled and gate correctly', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: /Demo Quick-Sim/ }).click()
  await page.getByRole('menuitem', { name: /Simulate Unknown Speaker/ }).click()
  await expect(page.getByText(/Voice Not Verified: Access Denied \(simulated\)/)).toBeVisible()
  await page.getByRole('button', { name: /Demo Quick-Sim/ }).click()
  await page.getByRole('menuitem', { name: /Simulate Revoked Doctor/ }).click()
  await expect(page.getByText(/Simulate Revoked Doctor · Voice Not Verified/)).toBeVisible()
  await page.getByRole('button', { name: /Demo Quick-Sim/ }).click()
  await page.getByRole('menuitem', { name: /Simulate Authorized Doctor/ }).click()
  await expect(page.getByRole('heading', { name: /104 Marcus Vance/ })).toBeVisible()
  // Simulation never shows the real "Verified" status.
  await expect(page.getByRole('button', { name: /Voice verification status: Verified/ })).toHaveCount(0)
  await nav(page, 'Activity Log')
  await expect(page.getByText('[SIMULATION] Scripted unknown-speaker scenario rejected.')).toBeVisible()
})

test('voice commands fail closed with no enrolled doctor; typed commands navigate', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: /Push to talk/ }).click()
  await nav(page, 'Voice Assistant')
  await expect(page.getByText('Voice commands are locked.').first()).toBeVisible()
  await page.getByLabel('Type a command').fill('show available rooms')
  await page.getByRole('button', { name: 'Run typed command' }).click()
  await expect(page.getByRole('heading', { name: 'Rooms & Admissions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'available' })).toHaveAttribute('aria-pressed', 'true')
})

test('on-device speaker model and hand tracker load in the browser', async ({ page }) => {
  await start(page)
  await nav(page, 'Voice Assistant')
  await page.getByRole('button', { name: 'Preload model' }).click()
  await expect(page.getByText('Voice model: ready')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /Enable camera gesture control/ }).click()
  await expect(page.getByText(/No hand detected|Hand tracked/)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Turn off camera and gestures' }).click()
  await expect(page.getByRole('button', { name: /Enable camera gesture control/ })).toBeVisible()
})

test('a failing Gemini provider falls back to labelled local rules (key held in server memory only)', async ({ page }) => {
  await start(page)
  await nav(page, 'AI Provider Settings')
  await page.getByLabel('Gemini API key').fill('AIzaSyINVALID-e2e-key-not-real-000000000')
  await page.getByRole('button', { name: 'Send to local server memory' }).click()
  await expect(page.getByText('Sent to local server memory')).toBeVisible()
  await expect(page.getByLabel('Gemini API key')).toHaveValue('')
  try {
    // Key must not be persisted anywhere in the browser.
    const stored = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))
    expect(stored).not.toContain('AIzaSyINVALID')
    await page.getByRole('button', { name: /Demo Quick-Sim/ }).click()
    await page.getByRole('menuitem', { name: /Simulate Clinical Dictation/ }).click()
    await page.getByRole('button', { name: 'Generate structured draft' }).click()
    await expect(page.getByText('Gemini audit not available')).toBeVisible({ timeout: 60_000 })
    const banner = page.getByRole('alert').filter({ hasText: 'CRITICAL SAFETY WARNING' })
    await expect(banner).toContainText('Local Deterministic Safety Rule')
    await expect(banner).not.toContainText('Google Gemini')
    await expect(page.getByText(/AIzaSyINVALID/)).toHaveCount(0)
  } finally {
    await nav(page, 'AI Provider Settings')
    await page.getByRole('button', { name: 'Clear session credentials' }).click()
  }
})

test('typing name with spaces in enrollment wizard maintains focus without stealing', async ({ page }) => {
  await page.goto('/')
  if (await page.getByRole('button', { name: 'Initialise MEDIQ' }).isVisible()) {
    await page.keyboard.press('Escape')
  }
  const enrollBtn = page.getByRole('button', { name: 'Enroll owner voice' })
  if (await enrollBtn.isVisible()) {
    await enrollBtn.click()
  }
  const nameInput = page.getByLabel('Display name')
  await expect(nameInput).toBeVisible()
  await nameInput.click()
  await nameInput.pressSequentially('Dr. Sarah Connor MD', { delay: 20 })
  await expect(nameInput).toHaveValue('Dr. Sarah Connor MD')
  await expect(nameInput).toBeFocused()
})
