import 'dotenv/config'
import { createApp } from './app'
import { providerStatuses } from './aiService'

const port = Number(process.env.MEDIQ_API_PORT ?? (process.env.NODE_ENV === 'production' ? 5173 : 8787))
// Loopback only by default: the API holds provider credentials.
const host = process.env.MEDIQ_HOST ?? '127.0.0.1'

for (const leaked of Object.keys(process.env).filter((k) => /^VITE_.*(KEY|SECRET|TOKEN)/i.test(k))) {
  console.warn(`[mediq] WARNING: ${leaked} looks like a secret with a VITE_ prefix — Vite would expose it to the browser. Rename it without VITE_.`)
}

createApp().listen(port, host, () => {
  const status = providerStatuses()
    .map((p) => `${p.label}: ${p.configured ? `configured (${p.model})` : 'not configured'}`)
    .join(' · ')
  console.log(`[mediq] API listening on http://${host}:${port}`)
  console.log(`[mediq] ${status}`)
  console.log('[mediq] Missing providers are fine — MEDIQ falls back to labelled local rules.')
})
