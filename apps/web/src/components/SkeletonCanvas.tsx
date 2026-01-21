import React, { useEffect, useMemo, useRef } from 'react'
import type { Skeleton } from '../lib/types'
import { edgesForJointSet } from '../lib/joints'

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

const DEFAULT_SIZE = 360

export function SkeletonCanvas(props: { skeleton: Skeleton; label?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  const frames = props.skeleton.frames
  const duration = useMemo(() => {
    if (frames.length < 2) return 1
    const last = frames[frames.length - 1]?.t ?? 1
    return Math.max(0.2, last)
  }, [frames])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const size = DEFAULT_SIZE
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size * dpr)
    canvas.height = Math.floor(size * dpr)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const start = performance.now()
    let raf = 0

    const toXY = (frameIndex: number, jointName: string) => {
      const f = frames[frameIndex]
      if (!f) return null
      const j = f.joints[jointName]
      if (!j) return null

      // Stage0 assumes normalized coordinateSpace in the dummy data.
      // Stage1 will formalize mapping for pixel/world inputs.
      const x = clamp01(j.x) * size
      const y = clamp01(j.y) * size
      return { x, y, c: j.confidence ?? f.overallConfidence ?? 0.8 }
    }

    const edges = edgesForJointSet(props.skeleton.jointSet)

    const pick = (frameIndex: number, candidates: string[]) => {
      for (const c of candidates) {
        const p = toXY(frameIndex, c)
        if (p) return p
      }
      return null
    }

    const draw = () => {
      const now = performance.now()
      const tSec = ((now - start) / 1000) % duration

      // pick nearest frame by time
      let idx = 0
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].t <= tSec) idx = i
      }

      // background
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)

      // grid (light)
      ctx.strokeStyle = 'rgba(229,231,235,0.95)'
      ctx.lineWidth = 1
      for (let i = 1; i < 6; i++) {
        const x = (size * i) / 6
        const y = (size * i) / 6
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(size, y)
        ctx.stroke()
      }

      // edges if known
      ctx.strokeStyle = 'rgba(124,58,237,0.55)'
      ctx.lineWidth = 2
      for (const [a, b] of edges) {
        const pa = toXY(idx, a)
        const pb = toXY(idx, b)
        if (!pa || !pb) continue
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
      }

      // points
      ctx.fillStyle = 'rgba(124,58,237,0.9)'
      const f = frames[idx]
      if (f) {
        let i = 0
        for (const k of Object.keys(f.joints)) {
          // downsample a bit for performance
          if ((i++ % 2) === 1) continue
          const p = toXY(idx, k)
          if (!p) continue
          ctx.beginPath()
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // fallback highlight
      const nose = pick(idx, ['POSE_NOSE', 'NOSE'])
      const lw = pick(idx, ['POSE_LEFT_WRIST', 'LEFT_WRIST', 'LH_WRIST'])
      const rw = pick(idx, ['POSE_RIGHT_WRIST', 'RIGHT_WRIST', 'RH_WRIST'])
      const dot = (p: any) => {
        if (!p) return
        ctx.fillStyle = 'rgba(124,58,237,0.95)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.10)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      dot(nose)
      dot(lw)
      dot(rw)

      if (props.label) {
        ctx.fillStyle = 'rgba(107,114,128,0.95)'
        ctx.font = '12px system-ui'
        ctx.fillText(props.label, 10, size - 12)
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frames, duration, props.label])

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  )
}
