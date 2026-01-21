import type { Joint, Meaning, MeaningParams, Skeleton, SkeletonFrame } from './types'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function get(frame: SkeletonFrame, key: string): Joint | null {
  const j = frame.joints[key]
  if (!j) return null
  if (!Number.isFinite(j.x) || !Number.isFinite(j.y)) return null
  return j
}

function mid(a: Joint, b: Joint): Joint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 }
}

function poseKey(name: string) {
  return `POSE_${name}`
}

function rootOf(frame: SkeletonFrame): Joint {
  const lh = get(frame, poseKey('LEFT_HIP'))
  const rh = get(frame, poseKey('RIGHT_HIP'))
  if (lh && rh) return mid(lh, rh)
  const ls = get(frame, poseKey('LEFT_SHOULDER'))
  const rs = get(frame, poseKey('RIGHT_SHOULDER'))
  if (ls && rs) return mid(ls, rs)
  // fallback: first joint
  const any = Object.values(frame.joints)[0]
  if (any && Number.isFinite(any.x) && Number.isFinite(any.y)) return any
  return { x: 0.5, y: 0.5, z: 0 }
}

function rotate2D(p: Joint, origin: Joint, angleRad: number): Joint {
  const s = Math.sin(angleRad)
  const c = Math.cos(angleRad)
  const x = p.x - origin.x
  const y = p.y - origin.y
  return { x: origin.x + x * c - y * s, y: origin.y + x * s + y * c, z: p.z }
}

function resampleSkeleton(input: Skeleton, fpsOut: number): Skeleton {
  const frames = [...(input.frames ?? [])].sort((a, b) => a.t - b.t)
  if (frames.length === 0) return { ...input, fps: fpsOut, frames: [] }

  const t0 = frames[0]!.t ?? 0
  const t1 = frames[frames.length - 1]!.t ?? 0
  const dur = Math.max(0, t1 - t0)
  const count = Math.max(1, Math.floor(dur * fpsOut) + 1)
  const keys = Object.keys(frames[0]!.joints ?? {})

  // pointer for linear search
  let j = 0
  const out: SkeletonFrame[] = []
  for (let i = 0; i < count; i++) {
    const t = t0 + (i / (count - 1)) * dur
    while (j + 1 < frames.length && (frames[j + 1]!.t ?? 0) < t) j++
    const a = frames[j]!
    const b = frames[Math.min(j + 1, frames.length - 1)]!
    const ta = a.t ?? 0
    const tb = b.t ?? ta
    const w = tb > ta ? (t - ta) / (tb - ta) : 0

    const joints: Record<string, Joint> = {}
    for (const k of keys) {
      const ja = a.joints[k]
      const jb = b.joints[k]
      if (!ja || !jb) continue
      joints[k] = {
        x: ja.x + (jb.x - ja.x) * w,
        y: ja.y + (jb.y - ja.y) * w,
        z: (ja.z ?? 0) + ((jb.z ?? 0) - (ja.z ?? 0)) * w
      }
    }

    out.push({ t, joints })
  }

  return { ...input, fps: fpsOut, frames: out }
}

export type ReconstructResult = {
  skeleton: Skeleton
  tempoFactor: number
  intensityFactor: number
  rotationRad: number
  shift: { x: number; y: number; z: number }
}

/**
 * Stage5: reconstruct an output skeleton by taking a template clip and applying Meaning params.
 *
 * This is intentionally simple & deterministic for MVP.
 */
export function reconstructFromTemplate(templateClip: Skeleton, params: MeaningParams): ReconstructResult {
  const fpsOut = 30

  // Tempo: map [0..1] to [0.6..1.4]. Higher tempo => faster => shorter duration.
  const tempoFactor = lerp(0.6, 1.4, clamp(params.tempo, 0, 1))

  // Intensity: scale joint offsets from per-frame root.
  const intensityFactor = lerp(0.7, 1.35, clamp(params.intensity, 0, 1))

  // Direction: small rotation + translation.
  const dx = params.direction?.x ?? 0
  const dy = params.direction?.y ?? 0
  const rotationRad = clamp(dx, -1, 1) * 0.25
  const shift = {
    x: clamp(dx, -0.2, 0.2) * 0.08,
    y: clamp(dy, -0.2, 0.2) * 0.08,
    z: 0
  }

  const frames0 = [...(templateClip.frames ?? [])].sort((a, b) => a.t - b.t)
  if (frames0.length === 0) {
    return { skeleton: { ...templateClip, fps: fpsOut, frames: [] }, tempoFactor, intensityFactor, rotationRad, shift }
  }

  // Apply intensity/rotation/shift per frame.
  const frames1: SkeletonFrame[] = frames0.map((f) => {
    const r = rootOf(f)
    const joints: Record<string, Joint> = {}
    for (const [k, j] of Object.entries(f.joints ?? {})) {
      const p = { x: j.x, y: j.y, z: j.z }
      const scaled = {
        x: r.x + (p.x - r.x) * intensityFactor,
        y: r.y + (p.y - r.y) * intensityFactor,
        z: p.z
      }
      const rotated = rotate2D(scaled, r, rotationRad)
      joints[k] = {
        x: rotated.x + shift.x,
        y: rotated.y + shift.y,
        z: rotated.z
      }
    }
    return { ...f, joints }
  })

  // Tempo: scale time axis then resample to stable FPS.
  const t0 = frames1[0]!.t ?? 0
  const frames2: SkeletonFrame[] = frames1.map((f) => ({ ...f, t: t0 + ((f.t ?? 0) - t0) / tempoFactor }))

  const out = resampleSkeleton({ ...templateClip, frames: frames2 }, fpsOut)
  return { skeleton: out, tempoFactor, intensityFactor, rotationRad, shift }
}

export function canProceedMeaning(m: Meaning | null, minConfidence = 0.55) {
  if (!m) return false
  if (m.intent === 'unknown') return false
  return Number.isFinite(m.confidence) && m.confidence >= minConfidence
}
