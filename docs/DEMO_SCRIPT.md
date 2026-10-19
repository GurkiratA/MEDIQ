# MEDIQ demo script (≈ 6–8 minutes)

**Setup (before judges arrive):**
1. Run `npm install` and `npm run dev`, then open **http://localhost:5173** in **Chrome or Edge**. Use a real browser window: embedded previews block the microphone.
2. Optional: put `GEMINI_API_KEY` and/or the `DO_HERMES_*` variables in `.env`, restart, and press **Test connection** under AI Provider Settings.
3. Test the room's noise. If it is very noisy, rely on **Demo Quick-Sim** for the voice-rejection beats and say clearly that they are simulations.
4. To start fresh: Activity Log → **Reset demo data**.

| # | Do | Say |
|---|---|---|
| 1 | Show the dashboard | "Every record here is synthetic. MEDIQ is a prototype, not a medical device." |
| 2 | Point at the top bar: provider mode and *Local fallback* / *Live* badge | "Model A drafts, Model B audits independently, and local rules always run. With no keys it still works, and every result says where it came from." |
| 3 | Search **104** and open Marcus Vance | Severe penicillin allergy with anaphylaxis; Lisinopril and Metformin (Metformin frequency *not documented*); BP 138/88, HR 78, 37.1 °C. |
| 4 | Rooms & Admissions, then Medication Records → Documented effects | "Separate databases. Occupancy is derived from admissions, so they can't disagree." |
| 5 | **Enroll the owner**: Authorized Doctors → Set up owner, read 3 phrases | "Only a 256-number voiceprint is stored on this device. Raw audio is discarded." |
| 6 | **Add a second doctor**: owner speaks the challenge phrase, the second person records, owner confirms | "Unknown speakers can never enroll themselves." |
| 7 | Press **Talk** (or Alt+V): "Open patient 104" | Status moves Listening → Verification Pending → **Verified**, then the record opens. |
| 8 | A teammate who is *not* enrolled presses Talk and says the same | "**Voice Not Verified: Access Denied.**" Show the Activity Log entry. (Noisy room: Quick-Sim → *Unknown Speaker*, and say it is a simulation.) |
| 9 | Revoke the second doctor (owner check), then that doctor speaks a command | Rejected as revoked. (Or Quick-Sim → *Revoked Doctor*.) |
| 10 | Click **Gestures off** to turn on the camera | Local-only PiP preview with the landmark skeleton. |
| 11 | Hold an **open palm** | Listening pauses. |
| 12 | Open Patient 104, then **swipe** left/right | Overview → Vitals → Labs → Visit Notes. |
| 13 | Rooms & Admissions → *Assign patient* → review → tick → *(optional thumbs-up)* → confirm | "Gestures can confirm only after you've ticked the review box. The button always works." |
| 14 | Visit Notes for 104 → **Load demo scenario** (or dictate it) → **Generate structured draft** | The note: "acute bacterial sinusitis… Amoxicillin 500 mg three times daily for 10 days". |
| 15 | Show the **CRITICAL SAFETY WARNING** banner, side-by-side panels and consensus view | "Gemini found it" *only if the Gemini tag is shown*; otherwise "the **Local Deterministic Safety Rule** found it". No alternative drug is suggested. |
| 16 | Show the missing information (route not documented) and the discrepancy panel | "Not documented is never treated as a negative finding." |
| 17 | Edit the final note → **Review exact note & save** → tick → Confirm | "Nothing saves without explicit confirmation, and saving never touches the medication list." |
| 18 | Patient 104 → Visit Notes, then **refresh** | The note persists (IndexedDB). |
| 19 | Read the summary aloud; Voice Assistant → translator | Translations are labelled AI-generated and need review. Without a key, a pre-written example is clearly labelled. |
| 20 | Close | "Works without any API keys. Honest about what is AI, what is a rule, and what is a simulation." |

**Voice tips:** speak the full command (about 1.5 s or more). Keep the same microphone and distance as at enrollment. If rejected, retry; the threshold is deliberately conservative.
