// Scans the production bundle (dist/) for anything that looks like a provider
// secret, and for the actual values of any keys configured in .env / the
// environment. Run after `npm run build`: `npm run check:secrets`.
import 'dotenv/config'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.')
  process.exit(2)
}

const files = []
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))))
walk(dist)

const patterns = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'OpenAI-style secret', re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'DigitalOcean token', re: /\bdop_v1_[a-f0-9]{40,}/ },
  { name: 'VITE_ secret variable name', re: /VITE_[A-Z_]*(KEY|SECRET|TOKEN)/ },
  { name: 'server env variable name', re: /\b(GEMINI_API_KEY|DO_HERMES_API_KEY)\b/ },
]
const literal = ['GEMINI_API_KEY', 'DO_HERMES_API_KEY'].map((k) => process.env[k]).filter((v) => v && v.length >= 8)

let problems = 0
for (const f of files.filter((f) => /\.(js|mjs|html|css|map|json|txt)$/.test(f))) {
  const text = readFileSync(f, 'utf8')
  for (const p of patterns) if (p.re.test(text)) (problems++, console.error(`✗ ${p.name} pattern in ${f}`))
  for (const v of literal) if (text.includes(v)) (problems++, console.error(`✗ a configured API key value appears in ${f}`))
}
if (problems) process.exit(1)
console.log(`✓ No secrets found in ${files.length} files under dist/ (checked ${patterns.length} patterns${literal.length ? ` + ${literal.length} configured key value(s)` : ''}).`)
