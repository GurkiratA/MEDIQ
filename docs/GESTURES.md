# Hand control

Turn it on with the **hand / camera pill** in the top bar (or *Hands* on the dashboard). The camera stays off until then; frames are processed locally by MediaPipe and never stored or sent. A small tile bottom-left shows the camera, tracking status and **?** for this guide.

## Controls (either hand, or both)

| Gesture | Does |
|---|---|
| ☝ Point (index up) | Moves that hand's cursor (ring at the fingertip) |
| 🤏 Pinch, release in place | Clicks the control under the cursor (buttons, tabs, launchers, × on a report) |
| 🤏 Pinch + move | Drags a report from **anywhere on it** (header, body, tables). Release to drop. A press must travel 12 px before it becomes a drag, so a still pinch is a click |
| 🤏🤏 Both hands pinch, pull apart / together | Resizes the report either hand pressed on (else the front report) about its centre. A one-hand drag in progress freezes while both hands pinch, and resumes without jumping |
| ✌ Index + middle up, move hand up/down | Scrolls whatever is under the hand (report body or page). Hand up = content moves up |
| ✊ Fist held ~1 s over a report | Closes it. An amber→red ring shows progress; opening the hand cancels |
| 👍 Thumbs-up | Confirms a dialog **only** if it allows gestures and "I have reviewed…" is ticked |
| 🖐 Open palm | Pauses the microphone if it is listening |

Mouse and touch always work too: drag a report by its header, resize from the bottom-right grip or the −/+ buttons, scroll with the wheel, close with × or **Esc**. Mouse drags start only from the header so report text stays selectable.

Hand presses are **refused** inside modal dialogs (`aria-modal`) and areas marked `data-no-gesture` (enrollment, authorization, revocation, save confirmations). The cursor flashes red; use mouse/keyboard there.

## Why it failed before, and what changed

| Before | Now |
|---|---|
| Pinch clicked `document.activeElement` — nothing happened unless a control had been Tab-focused | Each hand is a pointer: events are dispatched at the element under the cursor (`elementFromPoint`), so anything a mouse can use, a hand can use |
| `numHands: 1` | Two hands, each with a stable identity (continuity first, handedness only for new hands; one-frame label flips are ignored) |
| Raw landmarks; 600 ms still-hand dwell; one tight pinch threshold | 1€ filter on joints and cursor; pinch = thumb–index gap / hand span with hysteresis (0.46 on / 0.66 off), 55 ms confirmation and a 160 ms settle after pose changes |
| Fast hand movement fired swipes (tab changes) | Swipes are disabled while the hand drives a pointer |
| No drag/resize/scroll existed | Drag anywhere, two-hand resize, two-finger scroll, fist-hold close |
| Lost tracking could leave state behind | Lost hand → `pointerup` + `pointercancel`; a hand that re-enters already pinched cannot press until it opens; tab hidden or camera off releases everything |

Other details: frames are scheduled with `requestVideoFrameCallback` (one inference per camera frame, rAF fallback) with strictly increasing timestamps; the mirrored camera image is mapped to the viewport with a 10%/12% inset so screen edges are reachable without leaving the frame; pinch geometry is measured in isotropic camera space so the stretch to the screen cannot bias it; `setPointerCapture` failures are swallowed only for synthetic hand pointer ids; the overlay canvas is `pointer-events: none`.

## Code

| File | Role |
|---|---|
| `src/gestures/handTracker.ts` | Pure per-frame state: identity, smoothing, pinch, poses, aim point, viewport mapping |
| `src/gestures/pointerBridge.ts` | Hands → `pointerdown/move/up/cancel` + click; safety blocking; hover outline |
| `src/gestures/GestureContext.tsx` | Camera + MediaPipe loop; wires tracker, bridge, two-hand resize, scroll, fist close, thumbs-up |
| `src/gestures/scrollGesture.ts` | Two-finger scroll with latched target and dead zone |
| `src/gestures/HandOverlay.tsx` | Skeleton + cursor rings (non-interactive canvas) |
| `src/reports/PanelLayer.tsx`, `panelStore.ts` | Floating report windows: drag (hand anywhere / mouse header), grip, clamping, `TwoHandResizer` |

Tuning lives in `DEFAULT_TRACKER` (`handTracker.ts`), `DEFAULT_SCROLL` (`scrollGesture.ts`), `HAND_DRAG_SLOP` (`PanelLayer.tsx`) and `FIST_CLOSE_MS` (`GestureContext.tsx`).

## Testing

- Unit (Vitest): tracker transitions (confirmation, hysteresis, settle window, re-arm, identity under label flips, loss), bridge event sequences (click vs drag, aim point, blocking, loss → cancel, two pointers), panel store/resizer, scroll, and the real `PanelLayer` driven by bridge events.
- End to end (Playwright, `e2e/gestures.spec.ts`): synthetic MediaPipe-format landmark frames are fed through the same pipeline the camera uses (dev-only `window.__mediqHands.feed`, absent from production builds) to drag from the body, two-hand resize, scroll, pinch-click launchers and ×, fist-close, recover from tracking loss, and verify refusal inside a confirmation dialog.
- Not automated: a physical webcam and real hands.

## Manual webcam checklist (demo laptop)

1. Chrome/Edge, real window, good front lighting; sit 50–80 cm from the camera.
2. Turn hands on → tile says *Hand tracked · R point* when you raise a hand; the ring follows your index fingertip without shivering when still.
3. Open the clinical summary. Pinch on a table inside it, move, release → it moves and drops. Repeat with the other hand.
4. Pinch on the × without moving → it closes. Pinch on a launcher → a report opens.
5. Both hands pinch on the report, pull apart → it grows about its centre; bring them together → it shrinks.
6. Two fingers up over the report, move hand up/down → it scrolls; the report does not move.
7. Hold a fist over a report ~1 s → ring fills, report closes. A quick fist does not close it.
8. Mid-drag, drop your hand out of view → the report stays where it was; bring the hand back pinched → nothing moves until you open and pinch again.
9. Rooms → Assign patient → review: pinching the review checkbox does nothing (cursor flashes red). Tick it with the mouse, then thumbs-up confirms.
10. Mouse still works throughout with the camera on.

If pinches feel hard to trigger, raise `pinchOn` (e.g. 0.5); if they trigger by accident, lower it or raise `pinchConfirmMs`.
