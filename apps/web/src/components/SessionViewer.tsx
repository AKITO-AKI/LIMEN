import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Skeleton, SkeletonFrame } from '../lib/types'
import { Skeleton3View } from './Skeleton3View'
import { skeletonToBVH } from '../lib/bvh'

function pickFrame(frames: SkeletonFrame[], timeSec: number): SkeletonFrame | null {
  if (frames.length === 0) return null
  let idx = 0
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t <= timeSec) idx = i
  }
  return frames[idx] ?? frames[0]
}

function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SessionViewer(props: {
  title: string
  sessionId?: string
  skeleton: Skeleton | null
  filenameStem?: string
}) {
  const sk = props.skeleton
  const frames = sk?.frames ?? []

  const duration = useMemo(() => {
    if (frames.length < 2) return 0
    const last = frames[frames.length - 1]?.t ?? 0
    return Math.max(0, last)
  }, [frames])

  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)

  useEffect(() => {
    // reset on skeleton change
    setT(0)
    setPlaying(false)
  }, [sk?.frames])

  useEffect(() => {
    if (!playing) return
    if (!sk || duration <= 0) return

    const loop = (now: number) => {
      if (!lastRef.current) lastRef.current = now
      const dt = (now - lastRef.current) / 1000
      lastRef.current = now

      setT((prev) => {
        const next = prev + dt
        if (next >= duration) {
          // stop at end
          setPlaying(false)
          return duration
        }
        return next
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastRef.current = 0
    }
  }, [playing, sk, duration])

  const frame = useMemo(() => {
    return pickFrame(frames, t)
  }, [frames, t])

  const overallConf = frame?.overallConfidence

  const stem = props.filenameStem ?? props.sessionId ?? 'session'

  const onExportBVH = () => {
    if (!sk) return
    try {
      const bvh = skeletonToBVH(sk, { fps: sk.fps ?? 15, scale: 200 })
      downloadText(`${stem}.bvh`, bvh, 'text/plain')
    } catch (e: any) {
      alert(`BVH export failed: ${e?.message ?? String(e)}`)
    }
  }

  const onExportJSON = () => {
    if (!sk) return
    downloadText(`${stem}.json`, JSON.stringify(sk, null, 2), 'application/json')
  }

  return (
    <div className="session-viewer">
      <div className="session-viewer-header">
        <div className="session-viewer-title">{props.title}</div>
        <div className="spacer" />
        <div className="chips">
          {props.sessionId ? <span className="chip mono">{props.sessionId.slice(0, 8)}…</span> : null}
          {sk ? <span className="chip">{frames.length}f</span> : <span className="chip">0f</span>}
          <span className="chip">dur: {duration.toFixed(1)}s</span>
          <span className="chip">t: {t.toFixed(2)}s</span>
          {typeof overallConf === 'number' ? <span className="chip">conf: {overallConf.toFixed(2)}</span> : null}
        </div>
      </div>

      {!sk ? (
        <div className="note">No skeleton selected yet.</div>
      ) : (
        <>
          <Skeleton3View skeleton={sk} timeSec={t} />

          <div className="playback">
            <button onClick={() => setPlaying((p) => !p)} disabled={duration <= 0}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => {
                setPlaying(false)
                setT(0)
              }}
              disabled={duration <= 0}
            >
              Reset
            </button>

            <input
              className="slider"
              type="range"
              min={0}
              max={Math.max(0, duration)}
              step={0.01}
              value={t}
              onChange={(e) => {
                setPlaying(false)
                setT(parseFloat(e.target.value))
              }}
              disabled={duration <= 0}
            />

            <div className="spacer" />

            <button onClick={onExportBVH} disabled={!sk}>
              Export BVH
            </button>
            <button onClick={onExportJSON} disabled={!sk}>
              Export JSON
            </button>
          </div>

          <div className="helper">
            3-view is fixed (Front/Side/Top). BVH export is a minimal MediaPipe-based rig (MVP). Hands/fingers are included
            using MediaPipe hand landmarks.
          </div>
        </>
      )}
    </div>
  )
}
