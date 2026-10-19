/**
 * Touchless gesture control. Webcam frames are processed locally by
 * MediaPipe HandLandmarker; no video is uploaded or stored. The camera is
 * requested only when the user enables gestures, and every track, animation
 * frame and model instance is released on disable or unmount.
 *
 * Gestures only navigate or confirm an already-reviewed dialog; they never
 * grant privileges, enroll/revoke doctors or bypass voice verification.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { useNav } from '../state/NavContext'
import { useToast } from '../state/ToastContext'
import { useData } from '../state/DataContext'
import { confirmBus } from '../state/confirmBus'
import { useVoice } from '../voice/VoiceContext'
import { GestureEngine, HAND_CONNECTIONS, type GestureEvent, type Landmark, type Pose } from './classifier'

export type GestureStatus = 'off' | 'starting' | 'tracking' | 'no-hand' | 'error'

interface GestureApi {
  status: GestureStatus
  error: string | null
  pose: Pose
  lastEvent: { event: GestureEvent; at: number; result: string } | null
  enable: () => Promise<void>
  disable: () => void
  videoRef: React.RefObject<HTMLVideoElement>
  canvasRef: React.RefObject<HTMLCanvasElement>
}

const Ctx = createContext<GestureApi | null>(null)

export function GestureProvider({ children }: { children: ReactNode }) {
  const nav = useNav()
  const voice = useVoice()
  const toast = useToast()
  const { log } = useData()
  const [status, setStatus] = useState<GestureStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [pose, setPose] = useState<Pose>('unknown')
  const [lastEvent, setLastEvent] = useState<GestureApi['lastEvent']>(null)

  const videoRef = useRef<HTMLVideoElement>(null!)
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef(0)
  const engineRef = useRef(new GestureEngine())
  const runningRef = useRef(false)

  const navRef = useRef(nav)
  navRef.current = nav
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  const handleEvent = useCallback(
    (event: GestureEvent) => {
      let result = ''
      if (event.type === 'pause') {
        voiceRef.current.pauseListening('Open-palm gesture')
        result = 'Voice listening paused (open palm)'
      } else if (event.type === 'swipe') {
        const n = navRef.current
        if (n.view === 'patients' && n.patientId) {
          n.shiftPatientTab(event.direction === 'left' ? 1 : -1)
          result = `Swipe ${event.direction}: ${event.direction === 'left' ? 'next' : 'previous'} patient tab`
        } else result = 'Swipe ignored — open a patient workspace to swipe between tabs'
      } else if (event.type === 'pinch') {
        const el = document.activeElement as HTMLElement | null
        const clickable = el && el !== document.body && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'tab')
        if (!clickable) result = 'Pinch: no focused control (use Tab to focus one)'
        else if (el.closest('[role="dialog"]') || el.closest('[data-no-gesture]')) result = 'Pinch ignored inside dialogs and sensitive controls'
        else {
          el.click()
          result = `Pinch selected “${(el.getAttribute('aria-label') ?? el.textContent ?? 'control').trim().slice(0, 40)}”`
        }
      } else if (event.type === 'thumbs-up') {
        const r = confirmBus.tryGestureConfirm()
        result =
          r === 'confirmed'
            ? 'Thumbs-up confirmed the reviewed action'
            : r === 'not-reviewed'
              ? 'Thumbs-up ignored: tick “I have reviewed…” first'
              : r === 'not-allowed'
                ? 'Thumbs-up cannot confirm this action (button required)'
                : 'Thumbs-up: nothing to confirm'
        if (r === 'confirmed') void log({ kind: 'system', category: 'clinical', mode: 'live', message: 'Reviewed action confirmed with thumbs-up gesture after explicit review checkbox.' })
      }
      setLastEvent({ event, at: Date.now(), result })
      toast({ tone: 'info', title: 'Gesture', body: result })
    },
    [toast, log],
  )

  const draw = useCallback((lm: Landmark[] | null) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const w = (canvas.width = video.videoWidth || 320)
    const h = (canvas.height = video.videoHeight || 240)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    if (!lm) return
    ctx.lineWidth = Math.max(2, w / 160)
    ctx.strokeStyle = '#06B6D4'
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath()
      ctx.moveTo(lm[a].x * w, lm[a].y * h)
      ctx.lineTo(lm[b].x * w, lm[b].y * h)
      ctx.stroke()
    }
    ctx.fillStyle = '#14B8A6'
    for (const p of lm) {
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 110), 0, Math.PI * 2)
      ctx.fill()
    }
  }, [])

  const disable = useCallback(() => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    try {
      landmarkerRef.current?.close()
    } catch {
      /* already closed */
    }
    landmarkerRef.current = null
    engineRef.current.reset()
    setPose('unknown')
    setStatus('off')
  }, [])

  const enable = useCallback(async () => {
    if (runningRef.current) return
    setError(null)
    setStatus('starting')
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Camera access is not supported in this browser.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setStatus('error')
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera permission was denied. Manual controls remain available.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found. Manual controls remain available.'
            : `Camera unavailable: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    streamRef.current = stream
    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe')
      const make = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
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
    if (!streamRef.current) return // disabled while loading
    const video = videoRef.current
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play().catch(() => {})
    runningRef.current = true
    setStatus('no-hand')
    let lastVideoTime = -1
    let lastPose: Pose = 'unknown'
    let lastStatus: GestureStatus = 'no-hand'
    const loop = () => {
      if (!runningRef.current) return
      const lmk = landmarkerRef.current
      if (lmk && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        const now = performance.now()
        let hand: Landmark[] | null = null
        try {
          hand = (lmk.detectForVideo(video, now).landmarks[0] as Landmark[] | undefined) ?? null
        } catch {
          hand = null
        }
        draw(hand)
        const ev = engineRef.current.update(hand, now)
        const p = engineRef.current.currentPose
        if (p !== lastPose) setPose((lastPose = p))
        const st: GestureStatus = hand ? 'tracking' : 'no-hand'
        if (st !== lastStatus) setStatus((lastStatus = st))
        if (ev) handleEvent(ev)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, handleEvent])

  useEffect(() => () => disable(), [disable])

  const value = useMemo(() => ({ status, error, pose, lastEvent, enable, disable, videoRef, canvasRef }), [status, error, pose, lastEvent, enable, disable])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGestures() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGestures outside GestureProvider')
  return v
}
