# Speaker verification in MEDIQ

MEDIQ separates three questions and never conflates them:

| Step | Question | Implementation | Runs where |
|---|---|---|---|
| Speech recognition | *What* was said? | Browser Web Speech API (`SpeechRecognition`) | Chrome/Edge send audio to the browser vendor's online service |
| Speaker verification | *Who* said it? | WeSpeaker ResNet34 speaker embeddings + cosine similarity | **On-device**, in the browser (onnxruntime-web, WASM) |
| Authorization | Is that person *allowed*? | Owner-granted permissions in IndexedDB; revocation | In the browser |

Recognising "Hey MEDIQ" or "open patient 104" says nothing about identity. A command is routed **only** after a fresh sample of the same utterance passes verification **and** authorization.

## Model choice and provenance

- **Model:** WeSpeaker `voxceleb_resnet34`, trained on VoxCeleb2 for speaker verification and exported to ONNX by k2-fsa/sherpa-onnx. Input: `feats [B, T, 80]` log-Mel filterbanks; output: `embs [B, 256]`. The ONNX metadata confirms `framework=wespeaker`, `sample_rate=16000`, `normalize_samples=0`.
- **Licence:** model weights CC BY 4.0 (inherited from VoxCeleb, per the WeSpeaker docs); WeSpeaker and sherpa-onnx code Apache-2.0. Details are in `public/models/MODELS.md`.
- **Size and runtime:** 26.5 MB. It runs in onnxruntime-web 1.30 on the single-threaded WASM CPU backend, at about 1.2–1.4 s per 4 s clip (measured in Node with the same WASM runtime).
- **Why not the JARVIS model?** The inspected JARVIS project (MIT) uses NeXt-TDNN from Hugging Face, which was a good reference design. This build environment could not reach Hugging Face (proxy policy), so that model could not be validated here. The WeSpeaker model was downloadable and **validated end to end**, so it was chosen.
- **Alternative considered:** WeSpeaker CAM++ is 4× faster (≈0.34 s per clip) but separates speakers less well on the test set (different-speaker maximum 0.532 vs 0.365). For a security gate, separation matters more.

## Front end (`src/voice/fbank.ts`)

This is a TypeScript re-implementation of `torchaudio.compliance.kaldi.fbank` with WeSpeaker's inference settings, confirmed against `wespeaker/bin/infer_onnx.py`:

- Samples ×32768.
- 25 ms frames with a 10 ms shift and `snip_edges`.
- DC removal, then 0.97 pre-emphasis.
- Hamming window, 512-point FFT and power spectrum.
- 80 Mel bins from 20 Hz to Nyquist, then log.
- Per-utterance mean normalisation (CMN, no variance normalisation).

**Validated** against `kaldi-native-fbank` on real speech: maximum absolute difference **1.2 × 10⁻⁴** and mean **5.7 × 10⁻⁶** over 398 × 80 features. The scripts are in `scripts/eval/compare-fbank.mts` and `scripts/eval/ref_fbank.py`.

## Validation of discrimination (small, honest)

The data is the public multi-speaker set `github.com/csukuangfj/sr-data`: 20 clips, 7 speakers, studio-like conditions. Scripts are in `scripts/eval/`.

| Test | Genuine (same speaker) | Impostor (different speaker) |
|---|---|---|
| ResNet34, all clip pairs (≤ 4 s) | min 0.556 · mean 0.671 | max 0.365 · mean 0.093 |
| ResNet34, 1.5 s clip vs 2–3-clip enrollment centroid | min 0.505 · mean 0.621 | max 0.321 |
| ResNet34, 2.0 s clip vs centroid | min 0.536 · mean 0.660 | max 0.342 |
| ResNet34, 1.0 s clip vs centroid | min 0.368 (FRR 21 % at 0.50) | max 0.287 |

**Default threshold: 0.50.** On this set it gave 0 % false accepts and 0 % false rejects for clips of 1.5 s or longer. Below about 1.2 s, genuine scores collapse, so the quality gate requires **at least 1.2 s of voiced audio** per command.

This is a tiny, clean dataset. **It is not a calibrated benchmark**, and the score is a model similarity, **not a probability of identity**. Venue noise, different microphones and related voices will shift scores. The owner can tune the threshold (0.40–0.85) and the ambiguity margin, and doing so requires owner re-verification.

**In-browser end-to-end measurement** (`e2e/voice-live.spec.ts`) uses real recordings piped through the real Web Audio pipeline. Enrollment and verification used different recordings.

| Attempt | Score | Outcome |
|---|---|---|
| Owner (different recordings) | 0.566 | accepted |
| Unknown speaker | 0.35 | rejected |
| Second authorized doctor | 0.744 | accepted |
| Same doctor after revocation | 0.76 | recognised and **rejected (revoked)** |

The owner's margin over the threshold was modest (0.566 vs 0.50). Expect occasional false rejections in noisy rooms; retrying is the intended remedy.

## Enrollment

1. **Owner first:** on first launch the owner enters a display name, reads the explanation, consents, and records **at least 3 prompted phrases** of about 4 s each. More phrases can be added.
2. **Quality gate per sample** (`src/voice/quality.ts`). A sample is rejected if any of these hold:
   - silence, or a peak below 1 %;
   - less than 2.0 s of voiced audio;
   - speech level below −45 dBFS;
   - clipping above 1 %;
   - estimated SNR below 10 dB.

   Rejected samples can be retried.
3. **Embeddings:** each accepted sample is trimmed of silence and embedded **on-device**. The raw audio is then discarded.
4. **Consistency check:** the mean pairwise similarity must be at least 0.40. Otherwise the worst sample is highlighted for re-recording, which catches a second speaker or noisy audio.
5. **Duplicate check:** the new centroid may not match an existing profile at or above the threshold.
6. **Stored data:** only the **L2-normalised centroid** (256 numbers), the sample count, a consistency score and model metadata. **No raw audio is ever stored.**

### Adding another doctor (owner-controlled)

1. The owner chooses **Add authorized doctor**.
2. **Owner re-verification:** the owner speaks a fresh random challenge phrase, for example "MEDIQ owner check: copper falcon river, 3 8 1". It must verify against the owner profile, and when a transcript is available it must contain the challenge words.
3. The new person consents and records prompted phrases. The same quality, consistency and duplicate checks apply.
4. The owner explicitly confirms the authorization in a dialog. **Gestures cannot confirm this.**
5. The new profile receives `voice-navigation` and `voice-dictation`. Only the owner holds `manage-profiles`.

An unknown speaker cannot enroll themselves, because every profile action requires the owner's voice. Rename, re-enroll, revoke, remove, threshold changes and deleting voice profiles during a reset all require owner re-verification and an explicit confirmation.

## Command gate (`src/voice/VoiceContext.tsx`, `src/voice/verification.ts`)

1. Push-to-talk opens the microphone and the speech recogniser **together**, so the verified audio is the very utterance that carries the command.
2. If no authorized profile exists, the gate **fails closed** ("Voice commands are locked"). Unlike JARVIS, MEDIQ never waves everyone through when nobody is enrolled.
3. The quality gate runs (at least 1.2 s voiced, plus level, clipping and SNR checks), then the clip is embedded.
4. The embedding is compared with **every** profile, including revoked ones, so a revoked voice is explicitly rejected and logged rather than treated as unknown.
5. The attempt is rejected for any of these reasons:
   - the best score is below the threshold;
   - **ambiguous**: two profiles pass within the margin;
   - the profile is revoked;
   - there is no active grant with the required permission;
   - the profile was enrolled with a different model version.
6. Only after acceptance is the transcript parsed by the **deterministic** router. No LLM is used for navigation.
7. The status shows **Verification Pending** while verification runs. Commands are never executed in that state.
8. Unknown or revoked speakers see "**Voice Not Verified: Access Denied.**" No enrolled names are disclosed. The event is logged without audio or transcript, and a retry is allowed.

## Demo Quick-Sim vs live

Quick-Sim scenarios are **scripted** and labelled SIMULATION everywhere:
- They use no microphone and no model.
- They are logged with `mode: simulation`.
- They never set the real status to "Verified".
- They never change enrollment or grant privileges.

The "authorized" scenario performs navigation only, which any user can already do by clicking.

## Security limitations (read before demoing)

- **No anti-spoofing.** A recording or synthetic voice of an enrolled person may pass. Prompted challenge phrases make naive replay harder for owner actions, but this is **not** liveness detection. MEDIQ makes **no replay-resistance or AI-voice-spoofing claims**.
- Similar or related voices, noise, and microphone or channel changes affect results. Enroll and verify with the same microphone.
- **Client-side storage is not tamper-proof.** Anyone with access to the browser profile or machine can read, alter or delete profiles and roles, for example by clearing site data and enrolling as a new owner. This is prototype-level access control, not production authentication.
- Speech recognition in Chrome and Edge uses an online service, so the words spoken may leave the device. Speaker verification does not.
