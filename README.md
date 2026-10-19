# MEDIQ — Medical Intelligence & Voice-Biometric Touchless Co-Pilot

A browser-based clinical co-pilot prototype built for **Hack Day Guelph (Hacktoberfest × GDG on Campus)**. It combines:
- a clinical dashboard over synthetic records;
- doctor voice verification before any voice command runs;
- touchless hand-gesture navigation;
- AI-structured visit notes with an independent safety audit;
- a mandatory human-confirmation step before anything is saved.

> ⚠️ **Hackathon prototype. Synthetic data only. Not a medical device.** MEDIQ never diagnoses, prescribes or changes treatment. Every AI output and safety flag requires qualified clinician review. Browser storage and client-side voice profiles are **not** production authentication.

## Quick start

Requires **Node.js ≥ 20.11** and **Chrome or Edge**.

```bash
git clone https://github.com/GurkiratA/Mediq.git && cd Mediq
npm install          # also copies WASM runtimes into public/vendor (postinstall)
npm run dev          # web app + local API together
```

Open **http://localhost:5173**. No API keys are needed: without them, MEDIQ runs on clearly labelled local deterministic fallbacks.

### 🐳 Run Anywhere with Docker (Single Command)

To run on any teammate's laptop without needing Node.js or dependency setup:

```bash
docker compose up --build
```

Open **http://localhost:5173**. Both the frontend SPA and backend API run together on port 5173.

| Task | Command |
|---|---|
| Dev (web :5173 + API :8787) | `npm run dev` |
| Unit/component tests | `npm test` |
| End-to-end tests | `npm run test:e2e` (Playwright, Chromium) |
| Lint / typecheck | `npm run lint` · `npm run typecheck` |
| Production build | `npm run build` |
| Serve the production build + API | `npm start` → http://localhost:5173 |
| Scan the bundle for secrets | `npm run check:secrets` (after build) |
| Re-download/verify on-device models | `npm run setup:models` |

On Windows, use the same commands in PowerShell.

## Optional AI configuration

Copy `.env.example` to `.env` (git-ignored) and restart `npm run dev`:

```bash
GEMINI_API_KEY=...                 # Model B — safety auditor
GEMINI_MODEL=gemini-flash-latest   # gemini-2.0-flash was shut down 2026-06-01
DO_HERMES_BASE_URL=...             # Model A — OpenAI-compatible DigitalOcean endpoint
DO_HERMES_API_KEY=...
DO_HERMES_MODEL=NousResearch/Hermes-3-Llama-3.1-8B
```

Then open **AI Provider Settings → Test connection**. Full instructions, including Hermes 3 on a DigitalOcean 1-Click GPU Droplet versus DigitalOcean Serverless Inference, are in [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md).

**Secrets never reach the browser.** Keys are read only by the Node server (`server/`). There are no `VITE_` secrets, and the browser calls only same-origin `/api/*`. `npm run check:secrets` confirms the production bundle contains no keys. It was verified clean, and verified to catch a planted fake key.

## Features

- **Clinical dashboard:** patient, admission and room KPIs; occupancy meters; recent records and visits; pending reviews; medication safety alerts; voice-verification and allocation activity; current AI provider and fallback status.
- **Separate synthetic databases** in IndexedDB object stores behind a validated repository:
  - patients (with structured allergies, vitals, labs, injuries and imaging);
  - rooms;
  - admissions;
  - medications;
  - medication effects;
  - visits;
  - doctor profiles;
  - authorizations;
  - activity.

  See [`docs/DATABASES.md`](docs/DATABASES.md).
- **Rooms & admissions:** assign, transfer and discharge, each with a reviewed confirmation. Double-booking, over-capacity and out-of-service rooms are blocked, and the rules are re-checked inside the write transaction.
- **Medication records:** values shown only as documented ("Not documented" otherwise). Effects are categorised as beneficial, adverse, patient-reported, flagged interaction or not yet assessed. Potential-conflict checks use the WHO ATC drug-class table.
- **Voice assistant:**
  - push-to-talk (button or **Alt+V**) with a live transcript;
  - a deterministic command router (no LLM for navigation);
  - an experimental "Hey MEDIQ" wake phrase;
  - typed fallback, help, and speech output.
- **Doctor-only voice verification:** an on-device **WeSpeaker ResNet34** speaker-embedding model (ONNX, WASM), validated against real speech.
  - Owner enrollment with quality, consistency and duplicate checks.
  - The owner authorizes additional doctors and can rename, re-enroll, revoke or remove them, each after owner voice re-verification with a random challenge phrase.
  - Unknown, revoked or ambiguous speakers are rejected; the gate fails closed when nobody is enrolled.

  See [`docs/SPEAKER_VERIFICATION.md`](docs/SPEAKER_VERIFICATION.md).
- **Demo Quick-Sim:** scripted, clearly labelled scenarios (authorized, unknown, revoked, penicillin dictation) for noisy venues. They never touch real enrollment.
- **Touchless gestures:** MediaPipe HandLandmarker, processed locally, with a picture-in-picture skeleton preview.
  - **Open palm** pauses listening.
  - **Swipe** moves through Overview → Vitals → Labs → Visit Notes.
  - **Pinch** activates the focused control (never inside dialogs).
  - **Thumbs-up** confirms a dialog only after the review box is ticked.

  Dwell, release-to-rearm and cooldowns prevent repeat triggers.
- **Dual-AI clinical documentation:**
  - Model A (Hermes 3 / DigitalOcean) produces a structured SOAP draft.
  - Model B (Google Gemini) runs an independent safety audit.
  - Local deterministic rules always run as a baseline.

  Results appear side by side with a consensus view, missing information, discrepancies and record-derived context. You can then edit, review the exact final note, and **explicitly confirm** the save. Every output is Zod-validated.
- **Penicillin safety showcase (Patient 104):** a draft proposing amoxicillin produces the required **CRITICAL SAFETY WARNING** with evidence. It is attributed truthfully to Gemini and/or the "Local Deterministic Safety Rule", and no alternative drug or dose is suggested.
- **Text-to-speech and translator:** read summaries, identifiers or warnings only on request; choose voice and rate; pause and stop. AI translations are labelled and require review.
- **Activity log and data:** live and simulation events kept separate; reset with confirmation (explains what is deleted); export/import of synthetic records.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the diagram. Summary:

```
Browser (React 18 · Vite · TS · Tailwind)                 Local Node API (Express, 127.0.0.1)
 ├─ IndexedDB stores (synthetic)                           ├─ /api/ai/document → Hermes 3 / DO (OpenAI-compatible)
 ├─ Voice: Web Speech (what) + WeSpeaker ONNX (who)        ├─ /api/ai/audit    → Gemini (@google/genai)
 │        + authorization → deterministic router           ├─ /api/ai/translate, /check, /session-config
 ├─ Gestures: MediaPipe HandLandmarker (local)             └─ Zod validation · timeouts · retry · key redaction
 ├─ Local deterministic engine (always on)
 └─ ConfirmDialog — mandatory human review for sensitive actions
```

## Demo

Follow [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). The whole workflow runs without API keys.

## Test results

See [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md). On the final code:

| Check | Result |
|---|---|
| ESLint | 0 problems |
| TypeScript | 0 errors |
| Vitest | **93 passed** |
| Build | succeeds |
| Secret scan | clean |
| Playwright | **8 passed** |

The Playwright suite includes a live-voice test that pushes **real recorded speech** through the real browser pipeline: owner accepted at 0.57, unknown speaker rejected at 0.35, revoked doctor rejected.

**Automated vs physical testing:** no physical microphone or webcam exists in the build environment. Gesture logic is tested with landmark fixtures and Chromium's synthetic camera. Voice uses injected recordings with a scripted speech-recognition stand-in. **Real-room microphone and hand-gesture behaviour must be checked on the demo laptop.** No successful Gemini or Hermes call was made, because no credentials were available; the failure and fallback paths were tested against Google's real endpoint.

## Known limitations

- **Speaker verification:**
  - No anti-spoofing: recordings or synthetic voices of an enrolled person may pass, and MEDIQ makes no replay or deepfake-resistance claims.
  - Noise, microphone changes and similar voices affect scores.
  - The threshold (0.50) was calibrated on a tiny public dataset; the score is not a probability.
- **Local storage:** IndexedDB profiles, roles and records can be read or altered by anyone with access to the browser profile. It is not tamper-proof.
- **Speech recognition:** Chrome and Edge use an online service for speech-to-text, so the spoken words may leave the device. It is not supported in Firefox; use typed commands there. The wake phrase is experimental.
- **Translation:** AI translation is not certified medical interpretation and needs human review. Without a provider, only a labelled pre-written example exists.
- **Clinical validity:** none. The local rules cover a handful of demo drug classes, and the absence of a flag is not clearance. AI outputs are unverified drafts.
- **Hackathon requirements:** official judging criteria and prize terms could not be verified online from the build environment; check with the organisers. Gemini model names change frequently, so use **Test connection**.

## Prioritised next steps

1. Measure real-room false accept/reject rates on the demo laptop's microphone and tune the threshold. Add per-profile score-normalisation cohorts.
2. Add a voice anti-spoofing / liveness model, such as an AASIST-style countermeasure, and evaluate it.
3. Move profiles, authorization and audit logs to a server with real identity (OIDC/SSO), signed audit logs and encryption at rest.
4. Offer on-device speech-to-text (for example Whisper via WebGPU) so transcripts never leave the device.
5. Use FHIR-based data models and a vetted drug-interaction knowledge source in place of the demo ATC table.
6. Run a usability study with clinicians, plus gesture-reliability testing with gloves and in sterile settings.
7. Pursue compliance work (privacy impact assessment, PHIPA/HIPAA, regulatory classification) before any real use.

## Prior work: JARVIS

[GurkiratA/JARVIS](https://github.com/GurkiratA/jarvis) (MIT) was inspected. MEDIQ adopts several of its ideas:
- verify each utterance's speaker embedding **before** routing;
- average windowed embeddings for enrollment;
- choose a conservative threshold over the model's generic default;
- require explicit owner intent to add a second voice.

**No JARVIS code was copied.** MEDIQ differs in these ways:
- It runs verification **in the browser** rather than in a Node bridge.
- It **fails closed** when nobody is enrolled, whereas JARVIS accepts everyone.
- It mechanically requires owner voice re-verification for profile changes, where JARVIS relies on a conversational confirmation.
- It uses a different, locally validated model, because Hugging Face (where the JARVIS model is hosted) was unreachable from the build environment.

## Licences

MEDIQ source code: **MIT** ([LICENSE](LICENSE)). Bundled models keep their own licences; see [`public/models/MODELS.md`](public/models/MODELS.md):
- WeSpeaker ResNet34: CC BY 4.0.
- MediaPipe hand landmarker: Apache-2.0.

Key dependencies: React, Vite, Tailwind CSS, lucide-react, onnxruntime-web, @mediapipe/tasks-vision, @google/genai, Express, Zod, idb (MIT/Apache-2.0).
