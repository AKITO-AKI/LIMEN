import type { Skeleton, SkeletonFrame } from './types'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function sliceSkeleton(input: Skeleton, startSec: number, endSec: number): Skeleton {
  const s = Math.max(0, startSec)
  const e = Math.max(s, endSec)
  const frames = (input.frames ?? []).filter((f) => f.t >= s && f.t <= e)

  // If nothing falls inside, fall back to nearest frames.
  let use = frames
  if (use.length === 0 && input.frames.length > 0) {
    // pick closest to s and e
    const sorted = [...input.frames].sort((a, b) => a.t - b.t)
    let a = sorted[0]
    let b = sorted[sorted.length - 1]
    for (const f of sorted) {
      if (f.t <= s) a = f
      if (f.t <= e) b = f
    }
    use = [a, b].filter((x, i, arr) => arr.findIndex((y) => y.t === x.t) === i)
  }

  const baseT = use.length > 0 ? use[0]!.t : s
  const outFrames: SkeletonFrame[] = use.map((f) => ({ ...f, t: Math.max(0, f.t - baseT) }))

  return {
    ...input,
    frames: outFrames,
    meta: {
      ...(input.meta ?? {}),
      clip: { startSec: s, endSec: e, baseT }
    }
  }
}

function poseKey(name: string) {
  return `POSE_${name}`
}

function v3(j?: { x: number; y: number; z?: number }) {
  if (!j) return null
  const z = typeof j.z === 'number' && Number.isFinite(j.z) ? j.z : 0
  // Convert to y-up, z-forward (rough)
  return { x: j.x, y: 1 - j.y, z: -z }
}

function sub(a: any, b: any) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function len(a: any) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

export function estimateClipParams(clip: Skeleton): {
  direction: { x: number; y: number; z: number }
  intensity: number
  tempo: number
} {
  const frames = clip.frames ?? []
  if (frames.length < 2) {
    return { direction: { x: 0, y: 0, z: 0 }, intensity: 0.2, tempo: 0.2 }
  }

  // Use dominant wrist movement as proxy.
  let dir = { x: 0, y: 0, z: 0 }
  let speedSum = 0
  let speedN = 0

  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!
    const b = frames[i]!
    const dt = Math.max(1e-3, (b.t ?? 0) - (a.t ?? 0))

    const arw = v3(a.joints[poseKey('RIGHT_WRIST')])
    const brw = v3(b.joints[poseKey('RIGHT_WRIST')])
    const alw = v3(a.joints[poseKey('LEFT_WRIST')])
    const blw = v3(b.joints[poseKey('LEFT_WRIST')])

    const dR = arw && brw ? sub(brw, arw) : null
    const dL = alw && blw ? sub(blw, alw) : null

    let d = dR
    if (dR && dL) {
      d = len(dL) > len(dR) ? dL : dR
    } else if (!dR) {
      d = dL
    }

    if (!d) continue

    dir.x += d.x
    dir.y += d.y
    dir.z += d.z

    const spd = len(d) / dt
    if (Number.isFinite(spd)) {
      speedSum += spd
      speedN += 1
    }
  }

  const dirLen = len(dir)
  const direction = dirLen > 1e-6 ? { x: dir.x / dirLen, y: dir.y / dirLen, z: dir.z / dirLen } : { x: 0, y: 0, z: 0 }

  const avgSpeed = speedN > 0 ? speedSum / speedN : 0

  // Heuristics: map speed to 0..1.
  const intensity = clamp(avgSpeed / 3.0, 0, 1)
  const tempo = clamp(avgSpeed / 4.5, 0, 1)

  return { direction, intensity, tempo }
}

export function pickPoseKeyframes(clip: Skeleton, count = 3): Array<{ t: number; joints: Record<string, any> }> {
  const frames = clip.frames ?? []
  if (frames.length === 0) return []
  const n = Math.max(1, count)

  const out: Array<{ t: number; joints: Record<string, any> }> = []
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (frames.length - 1)) / Math.max(1, n - 1))
    const f = frames[clamp(idx, 0, frames.length - 1)]!

    const poseOnly: Record<string, any> = {}
    for (const k of Object.keys(f.joints)) {
      if (k.startsWith('POSE_')) poseOnly[k] = f.joints[k]
    }
    out.push({ t: f.t, joints: poseOnly })
  }
  return out
}
