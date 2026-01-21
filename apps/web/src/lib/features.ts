import type { Joint, Skeleton, SkeletonFrame } from './types'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function getJoint(frame: SkeletonFrame, key: string): Joint | null {
  const j = frame.joints[key]
  if (!j) return null
  if (!Number.isFinite(j.x) || !Number.isFinite(j.y)) return null
  return j
}

function len2(dx: number, dy: number, dz: number) {
  return dx * dx + dy * dy + dz * dz
}

function dist(a: Joint, b: Joint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(len2(dx, dy, dz))
}

function mid(a: Joint, b: Joint): Joint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 }
}

function safeDelta(a: Joint | null, b: Joint | null): { dx: number; dy: number; dz: number; ok: boolean } {
  if (!a || !b) return { dx: 0, dy: 0, dz: 0, ok: false }
  return { dx: b.x - a.x, dy: b.y - a.y, dz: (b.z ?? 0) - (a.z ?? 0), ok: true }
}

export type FeatureSummary = {
  motion: {
    durationSec: number
    frames: number
    avgSpeed: number
    avgDisp: number
    speedNorm: number
    dispNorm: number
    netDisp: { x: number; y: number; z: number }
  }
  hands: {
    leftDetectedRatio: number
    rightDetectedRatio: number
    bothHandsRatio: number
  }
}

function poseKey(name: string) {
  return `POSE_${name}`
}

/**
 * Extract a fixed-length summary (D4-2).
 *
 * Notes:
 * - Works with coordinateSpace="normalized" (recommended).
 * - Uses wrists + hip center as a proxy for motion statistics.
 */
export function extractFeatures(input: Skeleton): FeatureSummary {
  const frames = [...(input.frames ?? [])].sort((a, b) => a.t - b.t)
  const n = frames.length
  const durationSec = n >= 2 ? Math.max(0, (frames[n - 1]!.t ?? 0) - (frames[0]!.t ?? 0)) : 0

  const keyLW = poseKey('LEFT_WRIST')
  const keyRW = poseKey('RIGHT_WRIST')
  const keyLH = poseKey('LEFT_HIP')
  const keyRH = poseKey('RIGHT_HIP')

  let leftOk = 0
  let rightOk = 0
  let bothOk = 0

  let speedSum = 0
  let speedCount = 0

  let dispSum = 0
  let dispCount = 0

  // net displacement using hip center (or shoulder center fallback)
  let root0: Joint | null = null
  let root1: Joint | null = null

  for (let i = 0; i < n; i++) {
    const f = frames[i]!
    const lw = getJoint(f, keyLW)
    const rw = getJoint(f, keyRW)
    if (lw) leftOk++
    if (rw) rightOk++
    if (lw && rw) bothOk++

    const lh = getJoint(f, keyLH)
    const rh = getJoint(f, keyRH)
    const root = lh && rh ? mid(lh, rh) : null
    if (i === 0) root0 = root
    if (i === n - 1) root1 = root

    if (i === 0) continue
    const prev = frames[i - 1]!
    const dt = Math.max(1e-3, (f.t ?? 0) - (prev.t ?? 0))

    // speed: average wrist displacement / dt
    const dl = safeDelta(getJoint(prev, keyLW), lw)
    const dr = safeDelta(getJoint(prev, keyRW), rw)

    let localDisp = 0
    let localCnt = 0
    if (dl.ok) {
      localDisp += Math.sqrt(len2(dl.dx, dl.dy, dl.dz))
      localCnt++
    }
    if (dr.ok) {
      localDisp += Math.sqrt(len2(dr.dx, dr.dy, dr.dz))
      localCnt++
    }

    if (localCnt > 0) {
      const avg = localDisp / localCnt
      speedSum += avg / dt
      speedCount++
      dispSum += avg
      dispCount++
    }
  }

  const avgSpeed = speedCount ? speedSum / speedCount : 0
  const avgDisp = dispCount ? dispSum / dispCount : 0

  // Normalizers (tuned for normalized coordinates).
  const speedNorm = clamp(avgSpeed / 1.2, 0, 1)
  const dispNorm = clamp(avgDisp / 0.08, 0, 1)

  const net = root0 && root1 ? { x: root1.x - root0.x, y: root1.y - root0.y, z: (root1.z ?? 0) - (root0.z ?? 0) } : { x: 0, y: 0, z: 0 }

  const leftDetectedRatio = n ? leftOk / n : 0
  const rightDetectedRatio = n ? rightOk / n : 0
  const bothHandsRatio = n ? bothOk / n : 0

  return {
    motion: {
      durationSec,
      frames: n,
      avgSpeed,
      avgDisp,
      speedNorm,
      dispNorm,
      netDisp: net
    },
    hands: {
      leftDetectedRatio,
      rightDetectedRatio,
      bothHandsRatio
    }
  }
}
