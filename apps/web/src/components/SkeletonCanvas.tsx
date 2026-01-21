import React, { useEffect, useMemo, useRef } from 'react'
import { edgesForJointSet } from '../lib/joints'
import type { Joint, Skeleton, SkeletonFrame } from '../lib/types'

export type ViewMode = 'front' | 'side' | 'top'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function safeNum(v: unknown, fallback: number) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function pickFrame(frames: SkeletonFrame[], timeSec: number): SkeletonFrame | null {
  if (frames.length === 0) return null
  let idx = 0
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t <= timeSec) idx = i
  }
  return frames[idx] ?? frames[0]
}

function computeBoundsNormalized(joints: Record<string, Joint>) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const j of Object.values(joints)) {
    if (!Number.isFinite(j.x) || !Number.isFinite(j.y)) continue
    minX = Math.min(minX, j.x)
    maxX = Math.max(maxX, j.x)
    minY = Math.min(minY, j.y)
    maxY = Math.max(maxY, j.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY === maxY) {
    return { minX, maxX, minY: 0, maxY: 1 }
  }
  return { minX, maxX, minY, maxY }
}

export function SkeletonCanvas(props: {
  skeleton: Skeleton
  label?: string
  view?: ViewMode
  timeSec?: number
  showGrid?: boolean
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  const frames = props.skeleton.frames
  const view: ViewMode = props.view ?? 'front'
  const showGrid = props.showGrid ?? true

  const duration = useMemo(() => {
    if (frames.length < 2) return 0
    const last = frames[frames.length - 1]?.t ?? 0
    return Math.max(0, last)
  }, [frames])

  const edges = useMemo(() => edgesForJointSet(props.skeleton.jointSet), [props.skeleton.jointSet])

  const zRange = useMemo(() => {
    let zMin = Infinity
    let zMax = -Infinity
    for (const f of frames) {
      for (const j of Object.values(f.joints)) {
        if (typeof j.z !== 'number' || !Number.isFinite(j.z)) continue
        zMin = Math.min(zMin, j.z)
        zMax = Math.max(zMax, j.z)
      }
    }
    if (!Number.isFinite(zMin) || !Number.isFinite(zMax) || zMin === zMax) {
      return { zMin: -0.5, zMax: 0.5 }
    }
    // Add a tiny padding for stability.
    const pad = (zMax - zMin) * 0.05
    return { zMin: zMin - pad, zMax: zMax + pad }
  }, [frames])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const cssSize = 240
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(cssSize * dpr)
    canvas.height = Math.floor(cssSize * dpr)
    canvas.style.width = `${cssSize}px`
    canvas.style.height = `${cssSize}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    const started = performance.now()

    const drawOnce = (timeSec: number) => {
      const frame = pickFrame(frames, timeSec) ?? frames[0]
      if (!frame) return

      ctx.clearRect(0, 0, cssSize, cssSize)

      // background
      ctx.fillStyle = '#0b0f19'
      ctx.fillRect(0, 0, cssSize, cssSize)

      // grid
      if (showGrid) {
        ctx.strokeStyle = 'rgba(148,163,184,0.12)'
        ctx.lineWidth = 1
        for (let i = 1; i < 6; i++) {
          const x = (cssSize * i) / 6
          const y = (cssSize * i) / 6
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, cssSize)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(cssSize, y)
          ctx.stroke()
        }
      }

      // bounds (for pixel/world fallback)
      const bounds = computeBoundsNormalized(frame.joints)

      const zMin = zRange.zMin
      const zMax = zRange.zMax
      const zDen = zMax - zMin

      const toNorm = (key: string) => {
        const j = frame.joints[key]
        if (!j) return null

        // If coordinateSpace isn't normalized, normalize by bounds.
        const x0 = props.skeleton.coordinateSpace === 'normalized' ? j.x : (j.x - bounds.minX) / (bounds.maxX - bounds.minX)
        const y0 = props.skeleton.coordinateSpace === 'normalized' ? j.y : (j.y - bounds.minY) / (bounds.maxY - bounds.minY)

        const z0 = typeof j.z === 'number' && Number.isFinite(j.z) ? (j.z - zMin) / zDen : 0.5

        let x = clamp(x0, 0, 1)
        let y = clamp(y0, 0, 1)
        const z = clamp(z0, 0, 1)

        if (view === 'side') {
          x = z
        } else if (view === 'top') {
          y = 1 - z
        }

        return { x, y, z, c: safeNum(j.confidence, safeNum(j.visibility, 1)) }
      }

      const pad = 14
      const sx = (v: number) => pad + v * (cssSize - pad * 2)
      const sy = (v: number) => pad + v * (cssSize - pad * 2)

      // edges
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(124,58,237,0.75)'
      for (const [a, b] of edges) {
        const pa = toNorm(a)
        const pb = toNorm(b)
        if (!pa || !pb) continue
        ctx.beginPath()
        ctx.moveTo(sx(pa.x), sy(pa.y))
        ctx.lineTo(sx(pb.x), sy(pb.y))
        ctx.stroke()
      }

      // points (downsample slightly for perf)
      ctx.fillStyle = 'rgba(199,210,254,0.95)'
      let i = 0
      for (const k of Object.keys(frame.joints)) {
        if ((i++ % 2) === 1) continue
        const p = toNorm(k)
        if (!p) continue
        const r = p.c < 0.3 ? 1.5 : 2.4
        ctx.beginPath()
        ctx.arc(sx(p.x), sy(p.y), r, 0, Math.PI * 2)
        ctx.fill()
      }

      // label
      if (props.label) {
        ctx.fillStyle = 'rgba(226,232,240,0.9)'
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText(props.label, 10, cssSize - 10)
      }
    }

    if (typeof props.timeSec === 'number') {
      drawOnce(Math.max(0, props.timeSec))
      return
    }

    const loop = () => {
      const now = performance.now()
      const tSec = duration > 0 ? ((now - started) / 1000) % duration : 0
      drawOnce(tSec)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(raf)
  }, [frames, duration, edges, zRange, props.label, props.timeSec, props.skeleton.coordinateSpace, view, showGrid])

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  )
}
