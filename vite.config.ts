import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

/**
 * Put MediaPipe's WebAssembly where the page can actually load it.
 *
 * Hand tracking needs a WASM runtime served from our own origin — a CDN copy is
 * blocked by the page's CSP (`script-src 'self'`), and would be a live
 * supply-chain dependency besides. It used to be copied by scripts/start.mjs,
 * which meant `npm run dev` on its own served a page with no runtime: gesture
 * control failed to start with nothing obviously wrong. Doing it here covers
 * every way Vite is started — dev, build, preview, and `npm start`.
 *
 * Stamped with the package version and recopied when that changes, so an
 * upgrade of @mediapipe/tasks-vision never pairs the new JS with old WASM.
 */
function vendorMediapipe(): Plugin {
  const run = () => {
    const pkg = 'node_modules/@mediapipe/tasks-vision'
    const to = 'public/mediapipe'
    if (!existsSync(`${pkg}/wasm`)) return // gesture control is optional
    const version = JSON.parse(readFileSync(`${pkg}/package.json`, 'utf8')).version as string
    const stamp = `${to}/.version`
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return
    try {
      rmSync(to, { recursive: true, force: true })
      mkdirSync(to, { recursive: true })
      cpSync(`${pkg}/wasm`, to, { recursive: true })
      writeFileSync(stamp, version)
      console.log(`  vendored the hand-tracking runtime (${version}) into public/mediapipe.`)
    } catch (err) {
      console.warn(`  could not vendor the hand-tracking runtime: ${(err as Error).message}`)
    }
  }
  return { name: 'mediq-vendor-mediapipe', buildStart: run, configureServer: run }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vendorMediapipe(), react()],
  server: {
    // Honour PORT so a second instance can run alongside the first. The bridge
    // only accepts sockets from localhost:5173-5199, so stay inside that range
    // or set MEDIQ_ALLOWED_ORIGINS to match.
    port: Number(process.env.PORT) || 5173,
  },
  optimizeDeps: {
    // kokoro-js pulls in `phonemizer`, which carries espeak-ng as inline WASM.
    // Vite's dependency pre-bundler rewrites that initialisation and the
    // language table ends up empty — the symptom is
    // `Invalid language identifier: "en". Should be one of: .` at generate()
    // time, long after the model has loaded successfully. Serving these
    // untouched fixes it.
    exclude: ['kokoro-js', 'phonemizer', '@huggingface/transformers'],
  },
})
