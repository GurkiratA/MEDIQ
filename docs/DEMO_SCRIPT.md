# MEDIQ demo script

**Setup (before judges arrive):**
1. Run `npm install` and `npm run dev`, then open **http://localhost:5173** in **Chrome or Edge**. Use a real browser window: embedded previews block the microphone.
2. Optional: put `GEMINI_API_KEY` and/or the `DO_HERMES_*` variables in `.env`, restart, and press **Test connection** under AI Provider Settings.
3. Test the room's noise. If it is very noisy, rely on **Demo Quick-Sim** for the voice-rejection beats and say clearly that they are simulations.
4. To start fresh: Activity Log → **Reset demo data**. To replay the intro: *More (⋯) → Replay intro*, or open `http://localhost:5173/?intro`.
5. Check speech output: macOS has *Daniel* (British); Chrome also offers *Google UK English Male*. MEDIQ picks the best installed British voice automatically; Voice → Text-to-speech can override it.

## Fast judges' script (≈ 4 minutes)

| # | Do | Say |
|---|---|---|
| 1 | Fresh tab → **Initialise MEDIQ** | Music, ECG and biometric rings; MEDIQ resolves; readiness checks come from live state; British greeting. "Every record here is synthetic. MEDIQ is a prototype, not a medical device." |
| 2 | Dashboard → pick **104 Marcus Vance** | Patient in focus: severe penicillin allergy, vitals, report launchers. |
| 3 | Press the mic (Alt+V): "**MEDIQ, show me the patient report**" | Listening → Verifying → **Verified** → the clinical summary floats in. Allergy and review flags first. |
| 4 | "**Display the latest visit note**", then "**Make this report larger**", "**Scroll down**" | Second panel; resizes; scrolls. All deterministic — no LLM decides actions. |
| 5 | A non-enrolled teammate: "**Close the report**" | **Voice Not Verified: Access Denied** — the report stays. (Noisy room: Quick-Sim → *Unknown Speaker*, and say it is a simulation.) |
| 6 | Hands pill → camera on; raise a hand | Local-only tile; cursor ring on the fingertip; *?* shows the controls. |
| 7 | Pinch anywhere on the summary and move; release | Drags from the body, not just a title bar. |
| 8 | Both hands pinch on it, pull apart / together | Resizes about its centre. |
| 9 | Two fingers up over the report, move hand up | Scrolls the report under your hand. |
| 10 | Pinch the × (or hold a fist ~1 s) | Closes. "Gestures never confirm saves or access changes — those need review + the button." |
| 11 | Visit Notes → penicillin scenario → **Generate structured draft** | CRITICAL SAFETY WARNING, attributed truthfully; explicit review before save. |

Requires an enrolled owner for steps 3–5 (Access → set up owner, ~1 minute). Without one, voice fails closed; use typed commands (Voice view) or Quick-Sim and say so.

## Full script (≈ 6–8 minutes)

| # | Do | Say |
|---|---|---|
| 1 | Show the dashboard | "Every record here is synthetic. MEDIQ is a prototype, not a medical device." |
| 2 | Point at the top bar: provider mode pill and status dot | "Model A drafts, Model B audits independently, and local rules always run. With no keys it still works, and every result says where it came from." |
| 3 | Search **104** and open Marcus Vance | Severe penicillin allergy with anaphylaxis; Lisinopril and Metformin (Metformin frequency *not documented*); BP 138/88, HR 78, 37.1 °C. Launch the **Summary** report. |
| 4 | Rooms & Admissions, then Medication Records → Documented effects | "Separate databases. Occupancy is derived from admissions, so they can't disagree." |
| 5 | **Enroll the owner**: Access → Set up owner, read 3 phrases | "Only a 256-number voiceprint is stored on this device. Raw audio is discarded." |
| 6 | **Add a second doctor**: owner speaks the challenge phrase, the second person records, owner confirms | "Unknown speakers can never enroll themselves." |
| 7 | Press the mic (or Alt+V): "Open patient 104", then "Show me the patient report" | Status moves Listening → Verification Pending → **Verified**, then the record and report open. |
| 8 | A teammate who is *not* enrolled says "Close the report" | "**Voice Not Verified: Access Denied.**" Show the Activity Log entry. (Noisy room: Quick-Sim → *Unknown Speaker*, and say it is a simulation.) |
| 9 | Revoke the second doctor (owner check), then that doctor speaks a command | Rejected as revoked. (Or Quick-Sim → *Revoked Doctor*.) |
| 10 | Turn on hands | Local-only camera tile; cursor ring per hand. |
| 11 | Drag, two-hand resize, two-finger scroll, pinch × to close a report | See [`GESTURES.md`](GESTURES.md). |
| 12 | Rooms & Admissions → *Assign patient* → review → tick → *(optional thumbs-up)* → confirm | "Hands can't press inside confirmations. Thumbs-up confirms only after you've ticked the review box. The button always works." |
| 13 | Visit Notes for 104 → **Load demo scenario** (or dictate it) → **Generate structured draft** | The note: "acute bacterial sinusitis… Amoxicillin 500 mg three times daily for 10 days". |
| 14 | Show the **CRITICAL SAFETY WARNING** banner, side-by-side panels and consensus view | "Gemini found it" *only if the Gemini tag is shown*; otherwise "the **Local Deterministic Safety Rule** found it". No alternative drug is suggested. |
| 15 | Show the missing information (route not documented) and the discrepancy panel | "Not documented is never treated as a negative finding." |
| 16 | Edit the final note → **Review exact note & save** → tick → Confirm | "Nothing saves without explicit confirmation, and saving never touches the medication list." |
| 17 | Patient 104 → Visit Notes, then **refresh** | The note persists (IndexedDB). The intro does not replay in the same tab. |
| 18 | Read the summary aloud; Voice Assistant → translator | Translations are labelled AI-generated and need review. Without a key, a pre-written example is clearly labelled. |
| 19 | Close | "Works without any API keys. Honest about what is AI, what is a rule, and what is a simulation." |

**Voice tips:** speak the full command (about 1.5 s or more). Keep the same microphone and distance as at enrollment. If rejected, retry; the threshold is deliberately conservative.
