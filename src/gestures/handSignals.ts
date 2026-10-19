/**
 * Live, non-React hand state shared with interaction code that runs inside
 * pointer handlers (which must not wait for a React render).
 */
export const handSignals = {
  /** Both hands are pinching: single-hand drags freeze (re-anchor) instead of moving. */
  twoHandActive: false,
}
