/**
 * Touchless hand control. Webcam frames are processed locally by MediaPipe
 * HandLandmarker (both hands); no video is uploaded or stored. The camera is
 * requested only when the user enables gestures, and every track, frame
 * callback and model instance is released on disable or unmount.
 *
 * Pipeline per camera frame:
 *   HandLandmarker → HandTracker (identity, 1€ smoothing, pinch hysteresis,
 *   held poses, mirrored viewport mapping) → PointerBridge (synthetic pointer
 *   events at the element under each hand) → panel two-hand resize, peace
 *   scroll, fist-hold close → overlay drawing.
 *
 * Gestures act like a mouse on the workspace and floating reports. They never
 * grant privileges: presses are refused inside modal dialogs and
 * `data-no-gesture` areas, and a thumbs-up only confirms a dialog that allows
 * it after the review box was ticked (confirmBus).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { useToast } from '../state/ToastContext'
import { useData } from '../state/DataContext'
import { confirmBus } from '../state/confirmBus'
import { usePanels, panelIdOf } from '../reports/PanelContext'
import { useVoice } from '../voice/VoiceContext'
import { GestureEngine, type GestureEvent } from './classifier'
import { handSignals } from './handSignals'
import { HandTracker, twoHandPinch, type RawHand, type TrackedHand } from './handTracker'
import { patchPointerCapture, PointerBridge, type BridgeEvent } from './pointerBridge'
import { closestScrollable, ScrollGesture } from './scrollGesture'

export type GestureStatus = 'off' | 'starting' | 'tracking' | 'no-hand' | 'error'

/** Hold a fist over a report this long to close it. */
export const FIST_CLOSE_MS = 900

export interface OverlayFrame {
  hands: TrackedHand[]
  /** Fist-hold close progress (0..1) per hand id. */
  closing: Map<number, number>
  /** Hand ids currently driving a two-hand resize. */
  resizing: boolean
  /** Hand id → time a press was refused (blocked area), for a brief cue. */
  blocked: Map<number, number>
}

interface GestureApi {
  status: GestureStatus
  error: string | null
  handCount: number
  /** e.g. "L point · R pinch" */
  poses: string
  lastEvent: { text: string; at: number } | null
  enable: () => Promise<void>
  disable: () => void
  videoRef: React.RefObject<HTMLVideoElement>
  frame: React.MutableRefObject<OverlayFrame>
  guideOpen: boolean
  setGuideOpen: (open: boolean) => void
}

const Ctx = createContext<GestureApi | null>(null)

export function GestureProvider({ children }: { children: ReactNode }) {
  const voice = useVoice()
  const panels = usePanels()
  const toast = useToast()
  const { log } = useData()
  const [status, setStatus] = useState<GestureStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [handCount, setHandCount] = useState(0)
  const [poses, setPoses] = useState('')
  const [lastEvent, setLastEvent] = useState<GestureApi['lastEvent']>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null!)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const runningRef = useRef(false)
  const genRef = useRef(0)
  const trackerRef = useRef(new HandTracker())
  const engineRef = useRef(new GestureEngine({ enableSwipe: false }))
  const scrollRef = useRef(new ScrollGesture())
  const fistRef = useRef(new Map<number, { since: number; panelId: string | null; done: boolean }>())
  const frame = useRef<OverlayFrame>({ hands: [], closing: new Map(), resizing: false, blocked: new Map() })
  const uiRef = useRef({ count: -1, poses: '' })

  const panelsRef = useRef(panels)
  panelsRef.current = panels
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  const note = useCallback((text: string) => setLastEvent({ text, at: Date.now() }), [])

  const bridgeRef = useRef<PointerBridge | null>(null)
  if (!bridgeRef.current) {
    bridgeRef.current = new PointerBridge({
      onEvent: (e: BridgeEvent) => {
        if (e.type === 'blocked') {
          frame.current.blocked.set(e.id, performance.now())
          note('Hand press ignored here — use mouse or keyboard for this control')
        }
      },
    })
  }

  const handleDiscrete = useCallback(
    (event: GestureEvent) => {
      if (event.type === 'pause') {
        // Only meaningful while the microphone is live; otherwise an open hand is just an open hand.
        if (voiceRef.current.status === 'listening' || voiceRef.current.wakeMode) {
          voiceRef.current.pauseListening('Open-palm gesture')
          note('Listening paused (open palm)')
        }
      } else if (event.type === 'thumbs-up') {
        const r = confirmBus.tryGestureConfirm()
        if (r === 'no-dialog') return
        const text =
          r === 'confirmed' ? 'Thumbs-up confirmed the reviewed action' : r === 'not-reviewed' ? 'Thumbs-up ignored: tick “I have reviewed…” first' : 'Thumbs-up cannot confirm this action (button required)'
        note(text)
        toast({ tone: r === 'confirmed' ? 'ok' : 'info', title: 'Gesture', body: text })
        if (r === 'confirmed') void log({ kind: 'system', category: 'clinical', mode: 'live', message: 'Reviewed action confirmed with thumbs-up gesture after explicit review checkbox.' })
      }
    },
    [toast, log, note],
  )

  /** One frame of hand data → interaction. Shared by the camera loop and the dev test hook. */
  const process = useCallback(
    (raw: RawHand[], now: number) => {
      const tracker = trackerRef.current
      const bridge = bridgeRef.current!
      const { hands, lost } = tracker.update(raw, { w: window.innerWidth, h: window.innerHeight }, now)
      for (const l of lost) {
        scrollRef.current.end(l.id)
        fistRef.current.delete(l.id)
      }

      // Two hands pinching = resize; must be known before the bridge moves any drag.
      const two = twoHandPinch(hands)
      handSignals.twoHandActive = !!two
      bridge.sync(hands, lost)
      frame.current.resizing = panelsRef.current.handResize(two?.span ?? null, hands.map((h) => bridge.pressTarget(h.id)))

      for (const h of hands) {
        // Peace (index + middle up), moved vertically: scroll whatever is under the hand.
        if (h.pose === 'peace' && !h.pinched) {
          scrollRef.current.step(h.id, h.y, () => closestScrollable(document.elementFromPoint(h.x, h.y)))
        } else scrollRef.current.end(h.id)

        // Fist held over a report: close it after FIST_CLOSE_MS (progress ring shown).
        if (h.pose === 'fist' && !h.pinched) {
          let f = fistRef.current.get(h.id)
          if (!f) {
            f = { since: now, panelId: panelIdOf(document.elementFromPoint(h.aimX, h.aimY)), done: false }
            fistRef.current.set(h.id, f)
          }
          if (f.panelId && !f.done) {
            const p = Math.min(1, (now - f.since) / FIST_CLOSE_MS)
            frame.current.closing.set(h.id, p)
            if (p >= 1) {
              f.done = true
              frame.current.closing.delete(h.id)
              panelsRef.current.close(f.panelId)
              note('Report closed (fist hold)')
            }
          }
        } else {
          fistRef.current.delete(h.id)
          frame.current.closing.delete(h.id)
        }
      }

      // Thumbs-up confirm / open-palm pause from the existing static-pose engine (one hand).
      const primary = raw[0]?.landmarks?.length === 21 ? raw[0].landmarks : null
      const ev = engineRef.current.update(primary, now)
      if (ev) handleDiscrete(ev)

      frame.current.hands = hands
      const summary = hands.map((h) => `${h.side === 'right' ? 'R' : 'L'} ${h.pose}`).join(' · ')
      if (hands.length !== uiRef.current.count) {
        uiRef.current.count = hands.length
        setHandCount(hands.length)
      }
      if (summary !== uiRef.current.poses) {
        uiRef.current.poses = summary
        setPoses(summary)
      }
      return hands
    },
    [handleDiscrete, note],
  )

  const stopTracking = useCallback(() => {
    const lost = trackerRef.current.reset()
    bridgeRef.current?.sync([], lost)
    bridgeRef.current?.releaseAll()
    handSignals.twoHandActive = false
    panelsRef.current.handResize(null, [])
    scrollRef.current.reset()
    fistRef.current.clear()
    engineRef.current.reset()
    frame.current = { hands: [], closing: new Map(), resizing: false, blocked: new Map() }
    uiRef.current = { count: 0, poses: '' }
    setHandCount(0)
    setPoses('')
  }, [])

  const disable = useCallback(() => {
    runningRef.current = false
    genRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    try {
      landmarkerRef.current?.close()
    } catch {
      /* already closed */
    }
    landmarkerRef.current = null
    stopTracking()
    setStatus('off')
    setGuideOpen(false)
  }, [stopTracking])

  const enable = useCallback(async () => {
    if (runningRef.current || streamRef.current) return
    const gen = ++genRef.current
    setError(null)
    setStatus('starting')
    patchPointerCapture()
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Camera access is not supported in this browser.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setStatus('error')
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera permission was denied. Mouse and keyboard remain available.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found. Mouse and keyboard remain available.'
            : `Camera unavailable: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    if (gen !== genRef.current) return stream.getTracks().forEach((t) => t.stop())
    streamRef.current = stream
    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe')
      const make = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
      landmarkerRef.current = await make('GPU').catch(() => make('CPU'))
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setStatus('error')
      setError(`Hand-tracking model failed to load: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (gen !== genRef.current || !streamRef.current) {
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      return
    }
    const video = videoRef.current
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play().catch(() => {})
    runningRef.current = true
    setStatus('no-hand')
    setGuideOpen(true)

    let lastStamp = 0
    let lastVideoTime = -1
    let lastStatus: GestureStatus = 'no-hand'
    const tick = () => {
      if (!runningRef.current || gen !== genRef.current) return
      const lmk = landmarkerRef.current
      if (lmk && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        if (video.videoWidth && video.videoHeight) trackerRef.current.setFrameAspect(video.videoWidth / video.videoHeight)
        // VIDEO mode requires strictly increasing timestamps.
        const now = Math.max(performance.now(), lastStamp + 1)
        lastStamp = now
        let raw: RawHand[] = []
        try {
          const r = lmk.detectForVideo(video, now)
          raw = r.landmarks.map((landmarks, i) => ({ landmarks, handedness: r.handedness[i]?.[0]?.categoryName }))
        } catch {
          raw = []
        }
        const hands = process(raw, now)
        const st: GestureStatus = hands.length ? 'tracking' : 'no-hand'
        if (st !== lastStatus) setStatus((lastStatus = st))
      }
      schedule()
    }
    // requestVideoFrameCallback runs once per decoded camera frame (no duplicate inference); rAF is the fallback.
    const schedule = () => {
      if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(tick)
      else requestAnimationFrame(tick)
    }
    schedule()
  }, [process])

  // Tracking lost when the tab is hidden: release presses so nothing stays grabbed.
  useEffect(() => {
    const onHide = () => document.hidden && stopTracking()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [stopTracking])

  useEffect(() => () => disable(), [disable])

  // Development/test hook: feed synthetic landmark frames through the exact same
  // pipeline (used by the Playwright gesture tests). Not present in production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__mediqHands = {
      feed: (raw: RawHand[], now?: number) => process(raw, now ?? performance.now()).map((h) => ({ id: h.id, x: h.x, y: h.y, pinched: h.pinched, pose: h.pose })),
      reset: stopTracking,
    }
    return () => {
      delete w.__mediqHands
    }
  }, [process, stopTracking])

  const value = useMemo(
    () => ({ status, error, handCount, poses, lastEvent, enable, disable, videoRef, frame, guideOpen, setGuideOpen }),
    [status, error, handCount, poses, lastEvent, enable, disable, guideOpen],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGestures() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGestures outside GestureProvider')
  return v
}
