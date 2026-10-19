# Test results

These are actual results from the build environment: Linux, Node 22.22, headless Chromium 141 via Playwright 1.56. All commands were run on the final code.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 problems |
| Type check | `npm run typecheck` | 0 errors |
| Unit and component tests | `npm test` | **93 passed** in 7 files |
| Production build | `npm run build` | succeeded |
| Bundle secret scan | `npm run check:secrets` | no secrets in `dist/`. Positive control: a planted fake `AIza…` key **was detected** |
| End-to-end, demo path | `npm run test:e2e` | **7 passed** |
| End-to-end, live voice with real speech | `MEDIQ_E2E_AUDIO_DIR=… npx playwright test e2e/voice-live.spec.ts` | **1 passed** |
| Production server | `npm run build && npm start` | SPA, deep links, models and `/api/*` served |

## Unit and component coverage (Vitest)

- **Data layer (20 tests)**
  - Seed integrity: five patients 104–108; Marcus Vance's allergy, medications and vitals.
  - Every medication and effect links to the correct patient.
  - Allocation rules: no bed double-booking, no allocation beyond capacity, no rooms out of service, one active admission per patient, missing entities rejected.
  - Transfer, discharge and bed release.
  - Reopening the database does not reseed.
  - Notes are refused without explicit confirmation.
  - Reset restores the seed while keeping voice profiles.
  - Export/import round-trips, and inconsistent imports are rejected.
- **Local clinical engine (8 tests)**
  - Output is schema-valid.
  - The seeded amoxicillin/penicillin conflict produces the **exact required critical warning text**, with evidence.
  - No alternative drug or dose is ever suggested.
  - Missing route is flagged, not inferred.
  - No conflict is raised for a patient without the allergy.
  - Nothing is invented from an empty note.
  - Explicit negatives are handled; NKDA contradictions are flagged.
- **Voice (35 tests)**
  - The command parser covers every required command, including spoken numbers.
  - Unknown commands are not guessed.
  - The router asks for a patient instead of guessing, and "summarize" never saves.
  - The verification gate: fails closed with no profiles; accepts an authorized match; rejects unknown speakers without revealing names; rejects revoked profiles, missing grants, ambiguous matches and model mismatches.
  - Centroid and consistency calculations.
  - Quality gate rejects silence, short clips and clipped audio.
  - Challenge phrases are fresh each time.
- **Gestures (16 tests, landmark fixtures)**
  - Classifies open palm, fist, thumbs-up, pinch and point; translation-invariant.
  - Dwell before firing; fires once while held; re-arms only after release.
  - A stationary hand never swipes; fast swipes fire once with mirrored direction; slow drift is ignored.
  - Pinch and thumbs-up fire once each, with cooldowns.
- **Server (10 tests)**
  - Schema-valid output is accepted, including inside code fences.
  - Malformed output is rejected after one retry.
  - Transient errors are retried once; missing configuration is not retried.
  - Secrets are redacted.
  - Startup works without credentials.
  - Translation returns 503 when unconfigured; invalid bodies get 400.
  - Session keys are never echoed back, and the local-client guard blocks unauthorised requests.
- **ConfirmDialog (4 tests)**
  - Cannot confirm until the reviewer ticks the review box; gestures cannot confirm before review either.
  - Shows the exact content, and Cancel always works.
  - Gestures can never confirm profile changes.
  - Save failures are shown to the user.

## End-to-end (Playwright, headless Chromium)

1. Dashboard → search "104" → Marcus Vance shows the severe allergy banner, anaphylaxis, BP 138/88, medications and labs. No page errors.
2. Room assignment: the form leads to a proposal; Confirm stays disabled until review is ticked; then it saves. Patient 104 cannot then be admitted twice.
3. **Penicillin scenario:**
   - Quick-Sim dictation, then Generate, shows the exact critical warning labelled **Local Deterministic Safety Rule**. With no keys it does not mention Gemini. "Route not documented" is flagged.
   - The note is edited, then saved through explicit confirmation.
   - After a **page reload** the saved note is still present.
4. Quick-Sim unknown, revoked and authorized scenarios: correct outcomes, labelled SIMULATION, never shown as "Verified", logged as simulation.
5. Voice fails closed with no enrolled doctor. Typed commands navigate.
6. The **speaker model (ONNX/WASM) and the MediaPipe hand tracker load in the browser**. With Chromium's synthetic camera, tracking starts and reports "No hand detected", and the camera turns off cleanly.
7. **A real Gemini failure path:** an invalid key is entered in settings and sent to server memory. Generation calls Google, which rejects the key. The UI shows "Gemini audit not available" and the local rule still produces the warning. The key appears nowhere in browser storage or the UI. Session keys are cleared afterwards.
8. **Live voice pipeline with real speech** (public set `csukuangfj/sr-data`; enrollment and verification use *different* recordings; only the microphone source and the speech recogniser are test doubles):

   | Step | Score | Outcome |
   |---|---|---|
   | Owner enrolls with 3 samples (quality gate passed), then a verified command | 0.566 / 0.575 (two runs) | command executed |
   | Unknown speaker | 0.35 | rejected, no navigation |
   | Owner re-verifies with a challenge phrase, then a second doctor is authorized | 0.744 / 0.757 | the doctor's command executed |
   | Owner re-verifies and revokes that doctor | 0.76 | recognised and **rejected as revoked** |

   The activity log contains enrollment, authorization, success, rejection and revocation events.

## Speaker-model validation (offline scripts, `scripts/eval/`)

- The fbank front end matches `kaldi-native-fbank`: maximum absolute difference 1.2e-4.
- ResNet34 on 20 clips from 7 speakers: same-speaker minimum 0.556, different-speaker maximum 0.365.
- With a threshold of 0.50 on clips of 1.5 s or longer: 0 % FAR and 0 % FRR on this small set.

See `SPEAKER_VERIFICATION.md`. **This is not a calibrated benchmark.**

## Not tested here (requires physical hardware or credentials)

- **Physical microphone and webcam.** No real devices exist in the build container. Real-world voice accuracy in a noisy venue and real hand-gesture reliability (swipe/pinch/thumbs-up with a live hand) were **not** measured. Gesture logic is covered by landmark fixtures; camera start/stop by Chromium's synthetic camera.
- **Chrome's real speech recognition service** (replaced by a test double; headless Chromium has none).
- **Successful calls to Gemini or Hermes/DigitalOcean.** No credentials were available. Only the failure and fallback paths, prompts and validation were exercised.
- Firefox and Safari. Chrome or Edge is the intended demo browser.
- Text-to-speech audio output (API wiring only).
