# Databases

One IndexedDB database (`mediq-synthetic`) holds **separate object stores**, one per logical database. Each store sits behind the repository in `src/db/database.ts`. Every write is validated with the Zod schemas in `src/db/schema.ts`. Multi-store changes commit in **one transaction**: for example, a transfer writes the admission, the patient and an activity event together.

| Store | Key | Entity | Notes |
|---|---|---|---|
| `patients` | `id` (`"104"`…) | Patient | Personal info (fictional), plus nested structured entities that each carry an `id` and `patientId`: allergies (substance, class, reaction, severity, status, source), vitals (timestamped), lab results (value, unit, reference range, flag, status), injuries (area, severity, X-ray status, review status) and imaging (modality, request source, status, fictional report). Also history, visit status, documentation status and missing-information flags. |
| `rooms` | `id` | Room | Room number, building, ward, floor, type, beds, capacity (= number of beds), availability (`In service`/`Cleaning`/`Out of service`), features. **No occupant field.** |
| `admissions` | `id` | Admission | patient, room, bed, admitted/discharged times, `status` enum (`Active`/`Pending discharge`/`Discharged`), `riskCategory` enum, documented `emergency` flag, notes, responsible clinician, full **assignment history**. |
| `medications` | `id` | Medication | Linked to patient (and optionally a visit). Dose, route, frequency, dates and indication are stored **only as documented**; `null` renders as "Not documented". Also status, class, prescriber, source and safety flags. |
| `medicationEffects` | `id` | Effect | Linked to medication + patient (consistency enforced). Category is one of: Beneficial (documented), Adverse (documented), Patient-reported, Potential interaction/contraindication (flagged for review), Not yet assessed. Also severity, source, review and follow-up status. |
| `visits` | `id` | Visit note | The original text, the structured note (Model A), the safety audit, the **exact final note**, missing information, safety findings, discrepancies, review status, provenance (`documentation`/`audit` source) and the save-confirmation timestamp. |
| `doctors` | `id` | Doctor profile | Display name, synthetic clinician ID, role (Owner/Clinician), enrollment status, voice model type/version, **derived embedding only**, sample count, consistency, revocation and timestamps. |
| `authorizations` | `id` | Grant | profile, permissions (`voice-navigation`, `voice-dictation`, `manage-profiles`), granted by, active/revoked. |
| `activity` | `id` | Event | kind, category (security/clinical/allocation/ai/system), **mode (live/simulation)**, message, small scalar details. Never stores raw audio, transcripts or secrets. |
| `settings`, `meta` | key | — | Thresholds, provider mode, TTS preferences; seed version. |

## Consistency rules

- **Occupancy is derived** from active admissions (`roomOccupancy`), so rooms and admissions cannot disagree.
- `validatePlacement` rejects any of the following:
  - a nonexistent patient, room or bed;
  - a bed that is not in the chosen room;
  - a room that is not in service;
  - a bed already held by another active admission;
  - exceeding room capacity;
  - a second active admission for the same patient.
- `commitAllocation` re-validates **inside the write transaction** and then runs `checkConsistency` over the merged state, so a stale UI proposal or a second tab cannot double-book a bed.
- Admitting sets the patient to `Admitted`. Discharging sets `Discharged` and releases the bed. Every change is appended to the assignment history and the activity log.
- `saveConfirmedVisit` refuses any visit that is not `Saved (clinician-confirmed)` with a confirmation timestamp.
- Import is schema-validated and checked for referential consistency (medication → patient, effect → medication/patient, visit → patient, allocation) before any store is replaced.

## Seed and reset

- The seed is **deterministic** (`src/db/seed.ts`, `SEED_VERSION`): 5 synthetic patients (104–108), 10 rooms (2 not in service), 4 admissions (3 active, 1 discharged), 13 medications, 10 effects and 5 visits.
- Seeding happens only when the database has never been seeded. Reloading **never overwrites** notes or changes.
- **Reset Demo Data** (Activity Log page) shows exactly what it deletes:
  - It restores all clinical stores to the seed and clears the activity log. Saved notes made during the demo are lost.
  - It keeps settings.
  - It keeps voice profiles unless "also delete voice profiles" is ticked, which needs owner verification.
- **Export** writes synthetic clinical records only, with no voice profiles or settings.

Patient 104 (Marcus Vance, 42, male) has the following in the seed:
- documented **severe penicillin allergy with anaphylaxis**;
- Lisinopril 10 mg and Metformin 500 mg (the Metformin frequency is deliberately *not documented*, to demonstrate missing-information handling);
- latest vitals BP 138/88, HR 78, temperature 37.1 °C.
