import type { Joint, Skeleton, SkeletonFrame } from './types'

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

function v(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function len(a: Vec3) {
  return Math.sqrt(dot(a, a))
}

function norm(a: Vec3): Vec3 {
  const l = len(a)
  if (!Number.isFinite(l) || l < 1e-8) return v(0, 0, 0)
  return mul(a, 1 / l)
}

function q(x = 0, y = 0, z = 0, w = 1): Quat {
  return { x, y, z, w }
}

function qNormalize(q0: Quat): Quat {
  const l = Math.sqrt(q0.x * q0.x + q0.y * q0.y + q0.z * q0.z + q0.w * q0.w)
  if (!Number.isFinite(l) || l < 1e-8) return q(0, 0, 0, 1)
  return { x: q0.x / l, y: q0.y / l, z: q0.z / l, w: q0.w / l }
}

function qMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  }
}

function qInv(a: Quat): Quat {
  // unit quaternion inverse = conjugate
  return { x: -a.x, y: -a.y, z: -a.z, w: a.w }
}

function qRotate(a: Quat, p: Vec3): Vec3 {
  const pQuat = { x: p.x, y: p.y, z: p.z, w: 0 }
  const r = qMul(qMul(a, pQuat), qInv(a))
  return { x: r.x, y: r.y, z: r.z }
}

function quatFromTwoVectors(a0: Vec3, b0: Vec3): Quat {
  const a = norm(a0)
  const b = norm(b0)
  const d = dot(a, b)
  if (d > 0.999999) return q(0, 0, 0, 1)
  if (d < -0.999999) {
    // 180°: pick an orthogonal axis
    const axis = norm(Math.abs(a.x) < 0.1 ? cross(a, v(1, 0, 0)) : cross(a, v(0, 1, 0)))
    return qNormalize({ x: axis.x, y: axis.y, z: axis.z, w: 0 })
  }
  const axis = cross(a, b)
  return qNormalize({ x: axis.x, y: axis.y, z: axis.z, w: 1 + d })
}

// Euler (degrees) for BVH channels order: Zrotation Xrotation Yrotation
function quatToEulerZXY(q0: Quat): Vec3 {
  const qn = qNormalize(q0)
  const x = qn.x,
    y = qn.y,
    z = qn.z,
    w = qn.w

  // Convert quaternion -> rotation matrix
  const m00 = 1 - 2 * (y * y + z * z)
  const m01 = 2 * (x * y - z * w)
  const m02 = 2 * (x * z + y * w)

  const m10 = 2 * (x * y + z * w)
  const m11 = 1 - 2 * (x * x + z * z)
  const m12 = 2 * (y * z - x * w)

  const m20 = 2 * (x * z - y * w)
  const m21 = 2 * (y * z + x * w)
  const m22 = 1 - 2 * (x * x + y * y)

  // ZXY decomposition
  // ref: R = Rz(z) * Rx(x) * Ry(y)
  // x = asin(m21)
  const xRad = Math.asin(clamp(m21, -1, 1))
  let zRad = 0
  let yRad = 0
  const cx = Math.cos(xRad)
  if (Math.abs(cx) > 1e-6) {
    zRad = Math.atan2(-m01, m11)
    yRad = Math.atan2(-m20, m22)
  } else {
    // Gimbal lock
    zRad = Math.atan2(m10, m00)
    yRad = 0
  }

  return { x: rad2deg(xRad), y: rad2deg(yRad), z: rad2deg(zRad) }
}

function rad2deg(r: number) {
  return (r * 180) / Math.PI
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}


// Build a stable rotation from two reference directions (reduces twist jitter for shoulders/torso).
function buildBasis(a0: Vec3, b0: Vec3): { x: Vec3; y: Vec3; z: Vec3; ok: boolean } {
  const x = norm(a0)
  if (len(x) < 1e-6) return { x: v(0, 0, 0), y: v(0, 0, 0), z: v(0, 0, 0), ok: false }

  // Orthogonalize b against x (Gram-Schmidt)
  const bProj = mul(x, dot(b0, x))
  let y = sub(b0, bProj)
  y = norm(y)
  if (len(y) < 1e-6) return { x, y: v(0, 0, 0), z: v(0, 0, 0), ok: false }

  const z = norm(cross(x, y))
  // Recompute y to enforce orthonormality
  const y2 = cross(z, x)
  return { x, y: y2, z, ok: true }
}

function quatFromMat3(
  m00: number,
  m01: number,
  m02: number,
  m10: number,
  m11: number,
  m12: number,
  m20: number,
  m21: number,
  m22: number
): Quat {
  const tr = m00 + m11 + m22
  let x = 0,
    y = 0,
    z = 0,
    w = 1

  if (tr > 0) {
    const s = Math.sqrt(tr + 1.0) * 2 // s=4*w
    w = 0.25 * s
    x = (m21 - m12) / s
    y = (m02 - m20) / s
    z = (m10 - m01) / s
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2 // s=4*x
    w = (m21 - m12) / s
    x = 0.25 * s
    y = (m01 + m10) / s
    z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2 // s=4*y
    w = (m02 - m20) / s
    x = (m01 + m10) / s
    y = 0.25 * s
    z = (m12 + m21) / s
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2 // s=4*z
    w = (m10 - m01) / s
    x = (m02 + m20) / s
    y = (m12 + m21) / s
    z = 0.25 * s
  }

  return qNormalize({ x, y, z, w })
}

function quatFromBasis(restA: Vec3, restB: Vec3, currA: Vec3, currB: Vec3): Quat {
  const r = buildBasis(restA, restB)
  const c = buildBasis(currA, currB)

  if (!r.ok || !c.ok) {
    return quatFromTwoVectors(restA, currA)
  }

  // R = C * R^T  (both are orthonormal bases; columns are axis vectors)
  const rx = r.x,
    ry = r.y,
    rz = r.z
  const cx = c.x,
    cy = c.y,
    cz = c.z

  const m00 = cx.x * rx.x + cy.x * ry.x + cz.x * rz.x
  const m01 = cx.x * rx.y + cy.x * ry.y + cz.x * rz.y
  const m02 = cx.x * rx.z + cy.x * ry.z + cz.x * rz.z

  const m10 = cx.y * rx.x + cy.y * ry.x + cz.y * rz.x
  const m11 = cx.y * rx.y + cy.y * ry.y + cz.y * rz.y
  const m12 = cx.y * rx.z + cy.y * ry.z + cz.y * rz.z

  const m20 = cx.z * rx.x + cy.z * ry.x + cz.z * rz.x
  const m21 = cx.z * rx.y + cy.z * ry.y + cz.z * rz.y
  const m22 = cx.z * rx.z + cy.z * ry.z + cz.z * rz.z

  return quatFromMat3(m00, m01, m02, m10, m11, m12, m20, m21, m22)
}

// ---- MediaPipe BVH rig (Stage2+) ----
// Base: pose-only minimal humanoid (S2-4A)
// Extension: add hand/finger joints (S2-5A)

// Keep the rig joint type flexible to avoid brittle mega-unions.
type RigJoint = string

const PARENT: Record<RigJoint, RigJoint | null> = {
  Hips: null,
  Spine: 'Hips',
  Chest: 'Spine',
  Neck: 'Chest',
  Head: 'Neck',

  LeftShoulder: 'Chest',
  LeftElbow: 'LeftShoulder',
  LeftWrist: 'LeftElbow',

  RightShoulder: 'Chest',
  RightElbow: 'RightShoulder',
  RightWrist: 'RightElbow',

  LeftHip: 'Hips',
  LeftKnee: 'LeftHip',
  LeftAnkle: 'LeftKnee',

  RightHip: 'Hips',
  RightKnee: 'RightHip',
  RightAnkle: 'RightKnee'
}

const MAIN_CHILD: Partial<Record<RigJoint, RigJoint>> = {
  Hips: 'Spine',
  Spine: 'Chest',
  Chest: 'Neck',
  Neck: 'Head',

  LeftShoulder: 'LeftElbow',
  LeftElbow: 'LeftWrist',

  RightShoulder: 'RightElbow',
  RightElbow: 'RightWrist',

  LeftHip: 'LeftKnee',
  LeftKnee: 'LeftAnkle',

  RightHip: 'RightKnee',
  RightKnee: 'RightAnkle'
}

const ORDER: RigJoint[] = [
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftElbow',
  'LeftWrist',
  'RightShoulder',
  'RightElbow',
  'RightWrist',
  'LeftHip',
  'LeftKnee',
  'LeftAnkle',
  'RightHip',
  'RightKnee',
  'RightAnkle'
]

type Side = 'Left' | 'Right'

type HandNode = {
  rig: RigJoint
  lm: string // MediaPipe hand landmark name (without LH_/RH_)
  parent: RigJoint
}

const HAND_CHAINS: Array<{ finger: string; parts: Array<{ rigPart: string; lm: string }> }> = [
  {
    finger: 'Thumb',
    parts: [
      { rigPart: 'Thumb_CMC', lm: 'THUMB_CMC' },
      { rigPart: 'Thumb_MCP', lm: 'THUMB_MCP' },
      { rigPart: 'Thumb_IP', lm: 'THUMB_IP' },
      { rigPart: 'Thumb_TIP', lm: 'THUMB_TIP' }
    ]
  },
  {
    finger: 'Index',
    parts: [
      { rigPart: 'Index_MCP', lm: 'INDEX_FINGER_MCP' },
      { rigPart: 'Index_PIP', lm: 'INDEX_FINGER_PIP' },
      { rigPart: 'Index_DIP', lm: 'INDEX_FINGER_DIP' },
      { rigPart: 'Index_TIP', lm: 'INDEX_FINGER_TIP' }
    ]
  },
  {
    finger: 'Middle',
    parts: [
      { rigPart: 'Middle_MCP', lm: 'MIDDLE_FINGER_MCP' },
      { rigPart: 'Middle_PIP', lm: 'MIDDLE_FINGER_PIP' },
      { rigPart: 'Middle_DIP', lm: 'MIDDLE_FINGER_DIP' },
      { rigPart: 'Middle_TIP', lm: 'MIDDLE_FINGER_TIP' }
    ]
  },
  {
    finger: 'Ring',
    parts: [
      { rigPart: 'Ring_MCP', lm: 'RING_FINGER_MCP' },
      { rigPart: 'Ring_PIP', lm: 'RING_FINGER_PIP' },
      { rigPart: 'Ring_DIP', lm: 'RING_FINGER_DIP' },
      { rigPart: 'Ring_TIP', lm: 'RING_FINGER_TIP' }
    ]
  },
  {
    finger: 'Pinky',
    parts: [
      { rigPart: 'Pinky_MCP', lm: 'PINKY_MCP' },
      { rigPart: 'Pinky_PIP', lm: 'PINKY_PIP' },
      { rigPart: 'Pinky_DIP', lm: 'PINKY_DIP' },
      { rigPart: 'Pinky_TIP', lm: 'PINKY_TIP' }
    ]
  }
]

const HAND_NODES: Record<Side, HandNode[]> = { Left: [], Right: [] }

function buildHandRig(side: Side) {
  const wrist: RigJoint = `${side}Wrist`

  // Use index MCP as the wrist's primary child to estimate a reasonable wrist rotation.
  MAIN_CHILD[wrist] = `${side}Index_MCP`

  const nodes: HandNode[] = []
  for (const chain of HAND_CHAINS) {
    let parent: RigJoint = wrist
    for (const part of chain.parts) {
      const rig: RigJoint = `${side}${part.rigPart}`
      nodes.push({ rig, lm: part.lm, parent })
      PARENT[rig] = parent
      // Set a main child along the finger chain (local rotations)
      const nextIdx = chain.parts.findIndex((p) => p.rigPart === part.rigPart) + 1
      if (nextIdx < chain.parts.length) {
        MAIN_CHILD[rig] = `${side}${chain.parts[nextIdx]!.rigPart}`
      }
      parent = rig
    }
  }
  HAND_NODES[side] = nodes

  // Insert into ORDER after the corresponding wrist so hierarchy emits under the wrist.
  const wristIndex = ORDER.indexOf(wrist)
  if (wristIndex >= 0) {
    const rigNames = nodes.map((n) => n.rig)
    ORDER.splice(wristIndex + 1, 0, ...rigNames)
  }
}

// Build hand rigs once at module load.
buildHandRig('Left')
buildHandRig('Right')

function poseKey(name: string) {
  return `POSE_${name}`
}

function getPose(frame: SkeletonFrame, name: string): Joint | null {
  return frame.joints[poseKey(name)] ?? null
}

function handKey(side: Side, name: string) {
  return `${side === 'Left' ? 'LH' : 'RH'}_${name}`
}

function getHand(frame: SkeletonFrame, side: Side, name: string): Joint | null {
  return frame.joints[handKey(side, name)] ?? null
}

function avg(a: Vec3 | null, b: Vec3 | null): Vec3 | null {
  if (!a || !b) return a || b
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

function toBVHCoords(j: Joint, scale: number): Vec3 {
  // x/y are normalized 0..1, y-down. z is relative depth (often negative towards camera).
  const x = (j.x - 0.5) * scale
  const y = (0.5 - j.y) * scale
  const z = -(typeof j.z === 'number' && Number.isFinite(j.z) ? j.z : 0) * scale
  return { x, y, z }
}

function rigPositions(frame: SkeletonFrame, scale: number): Record<RigJoint, Vec3 | null> {
  const lh = getPose(frame, 'LEFT_HIP')
  const rh = getPose(frame, 'RIGHT_HIP')
  const ls = getPose(frame, 'LEFT_SHOULDER')
  const rs = getPose(frame, 'RIGHT_SHOULDER')

  const lhip = lh ? toBVHCoords(lh, scale) : null
  const rhip = rh ? toBVHCoords(rh, scale) : null
  const lsho = ls ? toBVHCoords(ls, scale) : null
  const rsho = rs ? toBVHCoords(rs, scale) : null

  const hips = avg(lhip, rhip) ?? v(0, 0, 0)
  const chest = avg(lsho, rsho) ?? hips
  const spine = avg(hips, chest) ?? hips

  const headJ = getPose(frame, 'NOSE')
  const head = headJ ? toBVHCoords(headJ, scale) : chest
  const neck = avg(chest, head) ?? chest

  const leftWristPoseJ = getPose(frame, 'LEFT_WRIST')
  const rightWristPoseJ = getPose(frame, 'RIGHT_WRIST')

  // If pose wrist is missing, fall back to hand wrist so finger joints can still export.
  const leftWristHandJ = getHand(frame, 'Left', 'WRIST')
  const rightWristHandJ = getHand(frame, 'Right', 'WRIST')

  const leftWristPos = leftWristPoseJ
    ? toBVHCoords(leftWristPoseJ, scale)
    : leftWristHandJ
      ? toBVHCoords(leftWristHandJ, scale)
      : null

  const rightWristPos = rightWristPoseJ
    ? toBVHCoords(rightWristPoseJ, scale)
    : rightWristHandJ
      ? toBVHCoords(rightWristHandJ, scale)
      : null

  const out: Record<RigJoint, Vec3 | null> = {
    Hips: hips,
    Spine: spine,
    Chest: chest,
    Neck: neck,
    Head: head,

    LeftShoulder: lsho ?? chest,
    LeftElbow: getPose(frame, 'LEFT_ELBOW') ? toBVHCoords(getPose(frame, 'LEFT_ELBOW')!, scale) : null,
    LeftWrist: leftWristPos,

    RightShoulder: rsho ?? chest,
    RightElbow: getPose(frame, 'RIGHT_ELBOW') ? toBVHCoords(getPose(frame, 'RIGHT_ELBOW')!, scale) : null,
    RightWrist: rightWristPos,

    LeftHip: lhip ?? hips,
    LeftKnee: getPose(frame, 'LEFT_KNEE') ? toBVHCoords(getPose(frame, 'LEFT_KNEE')!, scale) : null,
    LeftAnkle: getPose(frame, 'LEFT_ANKLE') ? toBVHCoords(getPose(frame, 'LEFT_ANKLE')!, scale) : null,

    RightHip: rhip ?? hips,
    RightKnee: getPose(frame, 'RIGHT_KNEE') ? toBVHCoords(getPose(frame, 'RIGHT_KNEE')!, scale) : null,
    RightAnkle: getPose(frame, 'RIGHT_ANKLE') ? toBVHCoords(getPose(frame, 'RIGHT_ANKLE')!, scale) : null
  }

  // ---- Hands: align hand landmarks to pose wrist (best-effort) ----
  const applyHand = (side: Side) => {
    const wristRig: RigJoint = `${side}Wrist`
    const wrist = out[wristRig]
    const handWristJ = getHand(frame, side, 'WRIST')
    const handWrist = handWristJ ? toBVHCoords(handWristJ, scale) : null

    const delta = wrist && handWrist ? sub(wrist, handWrist) : v(0, 0, 0)

    for (const node of HAND_NODES[side]) {
      const j = getHand(frame, side, node.lm)
      if (j) {
        out[node.rig] = add(toBVHCoords(j, scale), delta)
      } else {
        out[node.rig] = wrist
      }
    }
  }

  applyHand('Left')
  applyHand('Right')

  // Fallbacks: if elbow/wrist/knee/ankle missing, reuse parent position to avoid NaNs.
  for (const j of ORDER) {
    if (out[j] == null) {
      const p = PARENT[j]
      out[j] = p ? out[p] : v(0, 0, 0)
    }
  }
  return out
}

function bvhHierarchy(rest: Record<RigJoint, Vec3>, indent = ''): { text: string; channelOrder: RigJoint[] } {
  const channelOrder: RigJoint[] = []
  const lines: string[] = []

  const childrenOf = (parent: RigJoint | null) => ORDER.filter((j) => PARENT[j] === parent)

  const emitJoint = (name: RigJoint, depth: number) => {
    const ind = '  '.repeat(depth)
    const isRoot = PARENT[name] == null
    channelOrder.push(name)
    lines.push(`${ind}${isRoot ? 'ROOT' : 'JOINT'} ${name}`)
    lines.push(`${ind}{`)
    const parent = PARENT[name]
    const off = parent ? sub(rest[name], rest[parent]) : v(0, 0, 0)
    lines.push(`${ind}  OFFSET ${off.x.toFixed(4)} ${off.y.toFixed(4)} ${off.z.toFixed(4)}`)
    if (isRoot) {
      lines.push(`${ind}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation`)
    } else {
      lines.push(`${ind}  CHANNELS 3 Zrotation Xrotation Yrotation`)
    }

    const kids = childrenOf(name)
    if (kids.length === 0) {
      lines.push(`${ind}  End Site`)
      lines.push(`${ind}  {`)
      lines.push(`${ind}    OFFSET 0.0 0.0 0.0`)
      lines.push(`${ind}  }`)
    } else {
      for (const k of kids) emitJoint(k, depth + 1)
    }
    lines.push(`${ind}}`)
  }

  emitJoint('Hips', 0)

  return { text: lines.join('\n'), channelOrder }
}

export function skeletonToBVH(skeleton: Skeleton, opts?: { fps?: number; scale?: number }): string {
  const frames = skeleton.frames
  if (!frames || frames.length === 0) throw new Error('No frames')

  const fps = opts?.fps ?? skeleton.fps ?? 15
  const frameTime = 1 / fps
  const scale = opts?.scale ?? 200

  // Rest from first frame.
  const restPos0 = rigPositions(frames[0], scale)
  const restRoot = restPos0.Hips ?? v(0, 0, 0)

  const rest: Record<RigJoint, Vec3> = {} as any
  for (const j of ORDER) {
    const p = restPos0[j] ?? v(0, 0, 0)
    rest[j] = sub(p, restRoot) // root at origin
  }

  const { text: hierarchyText, channelOrder } = bvhHierarchy(rest)

  // Motion: local rotations (computed) + root translation
  const motionLines: string[] = []
  for (const f of frames) {
    const pos0 = rigPositions(f, scale)
    const pos: Record<RigJoint, Vec3> = {} as any
    for (const j of ORDER) {
      pos[j] = sub(pos0[j] ?? v(0, 0, 0), restRoot)
    }

    // root translation relative to rest
    const rootT = sub(pos.Hips, rest.Hips)

    // Rotations: compute locals in traversal order
    const qGlobal: Partial<Record<RigJoint, Quat>> = {}
    const qLocal: Partial<Record<RigJoint, Quat>> = {}

    qGlobal.Hips = q(0, 0, 0, 1)
    qLocal.Hips = q(0, 0, 0, 1)

    for (const joint of ORDER) {
      if (joint === 'Hips') continue
      const parent = PARENT[joint]!
      const parentQ = qGlobal[parent] ?? q(0, 0, 0, 1)

      const child = MAIN_CHILD[joint]
      if (!child) {
        qLocal[joint] = q(0, 0, 0, 1)
        qGlobal[joint] = qMul(parentQ, qLocal[joint]!)
        continue
      }

      // Special cases: use two reference directions to stabilize torso + shoulder twist.
      const parentInv = qInv(parentQ)
      let ql: Quat | null = null

      if (joint === 'Spine') {
        const restA = sub(rest['Chest'], rest['Spine'])
        const restB = sub(rest['RightShoulder'], rest['LeftShoulder'])
        const currA = qRotate(parentInv, sub(pos['Chest'], pos['Spine']))
        const currB = qRotate(parentInv, sub(pos['RightShoulder'], pos['LeftShoulder']))
        ql = quatFromBasis(restA, restB, currA, currB)
      } else if (joint === 'Chest') {
        const restA = sub(rest['Neck'], rest['Chest'])
        const restB = sub(rest['RightShoulder'], rest['LeftShoulder'])
        const currA = qRotate(parentInv, sub(pos['Neck'], pos['Chest']))
        const currB = qRotate(parentInv, sub(pos['RightShoulder'], pos['LeftShoulder']))
        ql = quatFromBasis(restA, restB, currA, currB)
      } else if (joint === 'LeftShoulder') {
        const restA = sub(rest['LeftElbow'], rest['LeftShoulder'])
        const restB = sub(rest['Chest'], rest['LeftShoulder']) // torso pole
        const currA = qRotate(parentInv, sub(pos['LeftElbow'], pos['LeftShoulder']))
        const currB = qRotate(parentInv, sub(pos['Chest'], pos['LeftShoulder']))
        ql = quatFromBasis(restA, restB, currA, currB)
      } else if (joint === 'RightShoulder') {
        const restA = sub(rest['RightElbow'], rest['RightShoulder'])
        const restB = sub(rest['Chest'], rest['RightShoulder']) // torso pole
        const currA = qRotate(parentInv, sub(pos['RightElbow'], pos['RightShoulder']))
        const currB = qRotate(parentInv, sub(pos['Chest'], pos['RightShoulder']))
        ql = quatFromBasis(restA, restB, currA, currB)
      }

      if (!ql) {
        const restV = sub(rest[child], rest[joint])
        const currV = sub(pos[child], pos[joint])

        // bring current vector into parent local frame
        const currVParent = qRotate(parentInv, currV)
        const restVParent = restV // rest pose uses identity frames

        ql = quatFromTwoVectors(restVParent, currVParent)
      }

      qLocal[joint] = ql
      qGlobal[joint] = qMul(parentQ, ql)
    }

    // Serialize channel values in the exact hierarchy order
    const values: number[] = []
    for (const j of channelOrder) {
      if (j === 'Hips') {
        values.push(rootT.x, rootT.y, rootT.z)
        // Root rotations: 0 for MVP (keeps rig stable)
        values.push(0, 0, 0)
      } else {
        const e = quatToEulerZXY(qLocal[j] ?? q(0, 0, 0, 1))
        // Order: Z X Y
        values.push(e.z, e.x, e.y)
      }
    }

    motionLines.push(values.map((n) => (Number.isFinite(n) ? n.toFixed(6) : '0.000000')).join(' '))
  }

  const out =
    `HIERARCHY\n` +
    `${hierarchyText}\n` +
    `MOTION\n` +
    `Frames: ${frames.length}\n` +
    `Frame Time: ${frameTime.toFixed(8)}\n` +
    motionLines.join('\n') +
    `\n`

  return out
}
