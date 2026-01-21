import React, { useEffect, useMemo, useRef, useState } from 'react'
import { detectHands, detectPose, getLandmarkers } from '../lib/mediapipe'
import {
  HAND_LANDMARK_NAMES,
  POSE_LANDMARK_NAMES,
  edgesForJointSet,
  leftHandJointKey,
  poseJointKey,
  rightHandJointKey
} from '../lib/joints'
import type { Joint, Skeleton, SkeletonFrame } from '../lib/types'

type Props = {
  sourceLanguage: 'JSL' | 'ASL' | 'CSL'
  targetLanguage: 'JSL' | 'ASL' | 'CSL'
  apiBase: string
  onRecorded?: (skeleton: Skeleton | null) => void
}

function nowISO() {
  return new Date().toISOString()
}

function uuid8() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

export function InputCapture(props: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState<string>('Camera: idle')
  const [frames, setFrames] = useState<SkeletonFrame[]>([])
  const [durationSec, setDurationSec] = useState(0)
  const [busy, setBusy] = useState(false)

  const jointSet = 'mediapipe_pose_hands_v1' as const
  const edges = useMemo(() => edgesForJointSet(jointSet), [])

  // Recording timing
  const startTimeRef = useRef<number>(0)
  const lastSampleRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  const recordedSkeleton: Skeleton | null = useMemo(() => {
    if (frames.length === 0) return null
    return {
      schemaVersion: '0.1.0',
      jointSet,
      coordinateSpace: 'normalized',
      fps: 15,
      meta: { note: 'Stage1 recorded skeleton (pose + hands)' },
      frames
    }
  }, [frames])

  useEffect(() => {
    props.onRecorded?.(recordedSkeleton)
  }, [recordedSkeleton])

  async function enableCamera() {
    if (cameraEnabled) return
    setBusy(true)
    setStatus('Requesting camera permission...')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('Video element missing')
      video.srcObject = stream
      await video.play()

      setCameraEnabled(true)
      setStatus('Camera: ready')
    } catch (e: any) {
      setStatus(`Camera error: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function stopCamera() {
    setCameraEnabled(false)
    setRecording(false)
    setStatus('Camera: stopped')

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    streamRef.current = null

    const video = videoRef.current
    if (video) video.srcObject = null
  }

  function startRecording() {
    if (!cameraEnabled) return
    setFrames([])
    setDurationSec(0)
    setRecording(true)
    setStatus('REC')
    startTimeRef.current = performance.now()
    lastSampleRef.current = 0
  }

  function stopRecording() {
    setRecording(false)
    setStatus('Stopped')
  }

  async function saveSession() {
    if (!recordedSkeleton) return
    setBusy(true)
    setStatus('Saving session...')
    try {
      const payload = {
        schemaVersion: '0.1.0',
        sessionId: uuid8().slice(0, 16),
        createdAt: nowISO(),
        sourceLanguage: props.sourceLanguage,
        targetLanguage: props.targetLanguage,
        inputSkeleton: recordedSkeleton
      }

      const res = await fetch(`${props.apiBase}/session/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const data = (await res.json()) as { sessionId: string }
      setStatus(`Saved: ${data.sessionId}`)
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // Render loop
  useEffect(() => {
    if (!cameraEnabled) return

    let mounted = true

    const run = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

      // HiDPI
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const { pose, hands } = await getLandmarkers()

      const drawFrame = () => {
        if (!mounted) return
        const ts = performance.now()
        const timestampMs = ts

        const poseResult = detectPose(pose, video, timestampMs)
        const handResult = detectHands(hands, video, timestampMs)

        const frame = toSkeletonFrame(poseResult, handResult, (ts - startTimeRef.current) / 1000)

        // Draw overlay
        drawOverlay(ctx, rect.width, rect.height, frame, edges)

        // Record sampling ~15fps (66ms)
        if (recording) {
          const elapsed = (ts - startTimeRef.current) / 1000
          setDurationSec(elapsed)
          if (lastSampleRef.current === 0 || ts - lastSampleRef.current >= 66) {
            lastSampleRef.current = ts
            setFrames((prev) => {
              // cap at ~20 seconds to avoid runaway (Stage1)
              const next = [...prev, frame]
              if (next.length > 15 * 20) return next.slice(next.length - 15 * 20)
              return next
            })
          }
        }

        rafRef.current = requestAnimationFrame(drawFrame)
      }

      rafRef.current = requestAnimationFrame(drawFrame)
    }

    run().catch((e) => {
      setStatus(`MediaPipe init failed: ${e?.message ?? String(e)}`)
    })

    return () => {
      mounted = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [cameraEnabled, recording])

  return (
    <div className="capture">
      <div className="capture-controls">
        {!cameraEnabled ? (
          <button className="primary" onClick={enableCamera} disabled={busy}>
            Enable Camera
          </button>
        ) : (
          <button onClick={stopCamera} disabled={busy}>
            Stop Camera
          </button>
        )}

        <button onClick={startRecording} disabled={busy || !cameraEnabled || recording}>
          Start
        </button>

        <button onClick={stopRecording} disabled={busy || !recording}>
          Stop
        </button>

        <button className="primary" onClick={saveSession} disabled={busy || !recordedSkeleton || recording}>
          Save Session
        </button>

        <div className="spacer" />

        <div className="chips">
          {recording ? <span className="chip rec">REC</span> : <span className="chip">IDLE</span>}
          <span className="chip">Frames: {frames.length}</span>
          <span className="chip">t: {durationSec.toFixed(1)}s</span>
        </div>
      </div>

      <div className="capture-stage">
        <video ref={videoRef} className="capture-video" playsInline muted />
        <canvas ref={canvasRef} className="capture-overlay" />
      </div>

      <div className="note">{status}</div>
    </div>
  )
}

function toSkeletonFrame(poseResult: any, handResult: any, t: number): SkeletonFrame {
  const joints: Record<string, Joint> = {}

  // Pose
  try {
    const landmarks = poseResult?.landmarks?.[0]
    if (Array.isArray(landmarks)) {
      for (let i = 0; i < Math.min(landmarks.length, POSE_LANDMARK_NAMES.length); i++) {
        const lm = landmarks[i]
        const name = POSE_LANDMARK_NAMES[i]!
        const key = poseJointKey(name)
        joints[key] = {
          x: clamp01(lm.x),
          y: clamp01(lm.y),
          z: typeof lm.z === 'number' ? lm.z : undefined,
          visibility: typeof lm.visibility === 'number' ? lm.visibility : undefined,
          confidence: typeof lm.visibility === 'number' ? clamp01(lm.visibility) : 1
        }
      }
    }
  } catch {
    // ignore
  }

  // Hands
  try {
    const lmsList = handResult?.landmarks
    if (Array.isArray(lmsList)) {
      // Determine which detected hand is left/right (best-effort)
      const handedness = handResult?.handedness
      for (let h = 0; h < lmsList.length; h++) {
        const lms = lmsList[h]
        const sideLabel = handedness?.[h]?.[0]?.categoryName
        const isRight = sideLabel === 'Right'
        const prefix = isRight ? 'RH' : 'LH'
        for (let i = 0; i < Math.min(lms.length, HAND_LANDMARK_NAMES.length); i++) {
          const lm = lms[i]
          const name = HAND_LANDMARK_NAMES[i]!
          const key = prefix === 'RH' ? rightHandJointKey(name) : leftHandJointKey(name)
          joints[key] = {
            x: clamp01(lm.x),
            y: clamp01(lm.y),
            z: typeof lm.z === 'number' ? lm.z : undefined,
            confidence: 1
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // overallConfidence (cheap): average of joint confidence
  const confs = Object.values(joints)
    .map((j) => (typeof j.confidence === 'number' ? j.confidence : 1))
    .filter((v) => Number.isFinite(v))

  const overallConfidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0

  return { t: Math.max(0, t), overallConfidence, joints }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: SkeletonFrame,
  edges: Array<[string, string]>
) {
  // clear
  ctx.save()
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const toXY = (key: string) => {
    const j = frame.joints[key]
    if (!j) return null
    return { x: j.x * w, y: j.y * h, c: j.confidence ?? 1 }
  }

  // edges
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(124,58,237,0.65)'
  for (const [a, b] of edges) {
    const pa = toXY(a)
    const pb = toXY(b)
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  // points (downsample for perf)
  ctx.fillStyle = 'rgba(124,58,237,0.9)'
  let i = 0
  for (const k of Object.keys(frame.joints)) {
    if ((i++ % 2) === 1) continue
    const p = toXY(k)
    if (!p) continue
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
