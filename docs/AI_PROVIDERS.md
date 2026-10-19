# AI providers: hybrid architecture and configuration

## Roles

| Role | Default provider | Responsibility | Never allowed to |
|---|---|---|---|
| **Model A — documentation** | Hermes 3 via a DigitalOcean OpenAI-compatible endpoint | Structure the note into SOAP sections and list the symptoms, history, medications, allergies, findings and follow-up the note states. Identify missing information and note-vs-record discrepancies. | Invent facts, diagnose, prescribe, recommend alternatives |
| **Model B — safety auditor** | Google Gemini (`@google/genai`) | Compare the note and the draft with the synthetic record independently. Flag allergy/class conflicts, contradictions, missing information and inconsistent medication details, with evidence and severity. | Same as above, plus resolving conflicts |
| **Local deterministic rules** | Always on | Baseline structuring and allergy/class rules (WHO ATC table), NSAID+asthma, duplicate anticoagulants, NKDA contradictions | — |

No model can save notes, change rooms, authorize speakers or take clinical actions. All model output is validated with Zod **on the server and again in the browser** (`shared/aiSchemas.ts`). Responses that fail validation are rejected after one retry.

### Modes (top-bar selector or AI Provider Settings)

| Mode | Model A | Model B | Local rules |
|---|---|---|---|
| Hybrid Consensus | Hermes/DO | Gemini | ✓ |
| Hermes 3 / DigitalOcean | Hermes/DO | — | ✓ |
| Gemini | Gemini | Gemini (separate call) | ✓ |
| Local Demo Fallback | local | — | ✓ |

If a provider is missing, times out (20 s on the server, 45 s in the browser), rate-limits, returns malformed JSON or errors:
- the UI shows which provider failed and why;
- Model A falls back to the **labelled** local draft;
- the audit panel shows "Gemini audit not available" while the local rules still run.

The UI never claims a provider produced a result that local code produced. Findings from different sources are shown side by side in a **consensus view** that records which sources raised each concern. If the AI auditor misses something the local rule caught, the banner says the auditors disagree.

## Gemini (Model B)

- **Model status (checked October 2026):** `gemini-2.0-flash` was **shut down on 2026-06-01** (Gemini API deprecations and release notes), so it cannot be used.
- **Default:** MEDIQ defaults to `GEMINI_MODEL=gemini-flash-latest`, Google's alias for the current Flash model. Search results indicate the current stable Flash IDs are in the `gemini-3.x-flash` range; pin one if you need reproducibility.
- **Not verified:** the official model pages could not be fetched from this build environment, and no live Gemini call with a valid key was made. Use **AI Provider Settings → Test connection**, which calls `models.get` on the configured model.
- **Verified:** a real request with an *invalid* key reached `generativelanguage.googleapis.com`, was rejected (HTTP 400 `API_KEY_INVALID`), and MEDIQ fell back correctly without echoing the key.
- **Implementation:** structured output via `responseMimeType: application/json` + `responseJsonSchema`, with an automatic retry without the schema if the model rejects it. The call uses `abortSignal` for timeouts.

```bash
# .env (git-ignored)
GEMINI_API_KEY=your-key            # https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-flash-latest   # or a pinned stable ID from ai.google.dev/gemini-api/docs/models
```

## DigitalOcean / Hermes 3 (Model A)

**Verified via search (October 2026):**
- **Hermes 3 is offered as a DigitalOcean 1-Click GPU Droplet** (HUGS: NousResearch Hermes 3 Llama 3.1 8B / 70B / 405B). It exposes an OpenAI-compatible `/v1/chat/completions` with a bearer token shown in the Droplet's MOTD.
- **DigitalOcean Serverless Inference** (`https://inference.do-ai.run/v1`, model access key) did **not** list Hermes in the catalog found. It lists other open-weight models (e.g. `llama3.3-70b-instruct`, `openai-gpt-oss-120b`).

MEDIQ therefore uses a generic OpenAI-compatible client, which works with either. The UI labels the provider by the **actual configured model ID**, and says so if it is not a Hermes model.

```bash
# Option A — Hermes 3 on a 1-Click GPU Droplet
DO_HERMES_BASE_URL=http://<droplet-ip>/v1
DO_HERMES_API_KEY=<token from the droplet MOTD>
DO_HERMES_MODEL=NousResearch/Hermes-3-Llama-3.1-8B   # confirm with Test connection (lists /v1/models)

# Option B — DigitalOcean Serverless Inference with a listed open-weight model
DO_HERMES_BASE_URL=https://inference.do-ai.run/v1
DO_HERMES_API_KEY=<model access key>
DO_HERMES_MODEL=llama3.3-70b-instruct
```

Not done: no live Hermes/DigitalOcean call was made (no credentials). Always check availability, pricing and model IDs in the DigitalOcean console. GPU Droplets bill hourly; destroy them after the demo.

**Open weights ≠ open source:** Hermes 3 and Llama 3.1 weights are downloadable under the Llama 3.1 Community License, which is not an OSI open-source licence. MEDIQ's own code is MIT.

## Session keys from the UI

AI Provider Settings can send keys to the **local server's memory**. The request must come from loopback, carry the `X-MEDIQ-Client` header and pass the same-origin check. Keys are never written to the browser, never returned by the API, and are redacted from error messages. Environment variables remain the preferred method. Never use `VITE_`-prefixed variables for secrets: the server warns at startup if it sees one.

## Translation

`/api/ai/translate` uses Gemini, or the DigitalOcean endpoint if Gemini is not configured. Output is labelled **AI-generated, requires human review, not certified medical interpretation**. Without a provider, the UI explains that it cannot translate. It offers only a **pre-written, labelled demo example** for one fixed sentence (French and Spanish); it never fakes a live translation.
