// Joint naming + edges for "mediapipe_pose_hands_v1" (Pose 33 + Hands 21x2)

export const POSE_LANDMARK_NAMES = [
  'NOSE',
  'LEFT_EYE_INNER',
  'LEFT_EYE',
  'LEFT_EYE_OUTER',
  'RIGHT_EYE_INNER',
  'RIGHT_EYE',
  'RIGHT_EYE_OUTER',
  'LEFT_EAR',
  'RIGHT_EAR',
  'MOUTH_LEFT',
  'MOUTH_RIGHT',
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_PINKY',
  'RIGHT_PINKY',
  'LEFT_INDEX',
  'RIGHT_INDEX',
  'LEFT_THUMB',
  'RIGHT_THUMB',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
  'LEFT_HEEL',
  'RIGHT_HEEL',
  'LEFT_FOOT_INDEX',
  'RIGHT_FOOT_INDEX'
] as const

export type PoseLandmarkName = (typeof POSE_LANDMARK_NAMES)[number]

export const HAND_LANDMARK_NAMES = [
  'WRIST',
  'THUMB_CMC',
  'THUMB_MCP',
  'THUMB_IP',
  'THUMB_TIP',
  'INDEX_FINGER_MCP',
  'INDEX_FINGER_PIP',
  'INDEX_FINGER_DIP',
  'INDEX_FINGER_TIP',
  'MIDDLE_FINGER_MCP',
  'MIDDLE_FINGER_PIP',
  'MIDDLE_FINGER_DIP',
  'MIDDLE_FINGER_TIP',
  'RING_FINGER_MCP',
  'RING_FINGER_PIP',
  'RING_FINGER_DIP',
  'RING_FINGER_TIP',
  'PINKY_MCP',
  'PINKY_PIP',
  'PINKY_DIP',
  'PINKY_TIP'
] as const

export type HandLandmarkName = (typeof HAND_LANDMARK_NAMES)[number]

export function poseJointKey(name: PoseLandmarkName): string {
  return `POSE_${name}`
}

export function leftHandJointKey(name: HandLandmarkName): string {
  return `LH_${name}`
}

export function rightHandJointKey(name: HandLandmarkName): string {
  return `RH_${name}`
}

export type Edge = [string, string]

// Rough, readable skeleton edges (not exhaustive; tuned for UI clarity)
export const POSE_EDGES: Edge[] = [
  [poseJointKey('LEFT_SHOULDER'), poseJointKey('RIGHT_SHOULDER')],
  [poseJointKey('LEFT_SHOULDER'), poseJointKey('LEFT_ELBOW')],
  [poseJointKey('LEFT_ELBOW'), poseJointKey('LEFT_WRIST')],
  [poseJointKey('RIGHT_SHOULDER'), poseJointKey('RIGHT_ELBOW')],
  [poseJointKey('RIGHT_ELBOW'), poseJointKey('RIGHT_WRIST')],
  [poseJointKey('LEFT_SHOULDER'), poseJointKey('LEFT_HIP')],
  [poseJointKey('RIGHT_SHOULDER'), poseJointKey('RIGHT_HIP')],
  [poseJointKey('LEFT_HIP'), poseJointKey('RIGHT_HIP')],
  [poseJointKey('LEFT_HIP'), poseJointKey('LEFT_KNEE')],
  [poseJointKey('LEFT_KNEE'), poseJointKey('LEFT_ANKLE')],
  [poseJointKey('RIGHT_HIP'), poseJointKey('RIGHT_KNEE')],
  [poseJointKey('RIGHT_KNEE'), poseJointKey('RIGHT_ANKLE')]
]

export const HAND_EDGES: Edge[] = (() => {
  // Standard hand graph: wrist → finger chains
  const f = (prefix: 'LH_' | 'RH_') => {
    const k = (n: HandLandmarkName) => `${prefix}${n}`
    const edges: Edge[] = []
    // Thumb
    edges.push([k('WRIST'), k('THUMB_CMC')])
    edges.push([k('THUMB_CMC'), k('THUMB_MCP')])
    edges.push([k('THUMB_MCP'), k('THUMB_IP')])
    edges.push([k('THUMB_IP'), k('THUMB_TIP')])
    // Index
    edges.push([k('WRIST'), k('INDEX_FINGER_MCP')])
    edges.push([k('INDEX_FINGER_MCP'), k('INDEX_FINGER_PIP')])
    edges.push([k('INDEX_FINGER_PIP'), k('INDEX_FINGER_DIP')])
    edges.push([k('INDEX_FINGER_DIP'), k('INDEX_FINGER_TIP')])
    // Middle
    edges.push([k('WRIST'), k('MIDDLE_FINGER_MCP')])
    edges.push([k('MIDDLE_FINGER_MCP'), k('MIDDLE_FINGER_PIP')])
    edges.push([k('MIDDLE_FINGER_PIP'), k('MIDDLE_FINGER_DIP')])
    edges.push([k('MIDDLE_FINGER_DIP'), k('MIDDLE_FINGER_TIP')])
    // Ring
    edges.push([k('WRIST'), k('RING_FINGER_MCP')])
    edges.push([k('RING_FINGER_MCP'), k('RING_FINGER_PIP')])
    edges.push([k('RING_FINGER_PIP'), k('RING_FINGER_DIP')])
    edges.push([k('RING_FINGER_DIP'), k('RING_FINGER_TIP')])
    // Pinky
    edges.push([k('WRIST'), k('PINKY_MCP')])
    edges.push([k('PINKY_MCP'), k('PINKY_PIP')])
    edges.push([k('PINKY_PIP'), k('PINKY_DIP')])
    edges.push([k('PINKY_DIP'), k('PINKY_TIP')])
    return edges
  }
  return [...f('LH_'), ...f('RH_')]
})()

export function edgesForJointSet(jointSet: string): Edge[] {
  if (jointSet === 'mediapipe_pose_hands_v1') return [...POSE_EDGES, ...HAND_EDGES]
  // Fallback: if pose-only or hands-only, show what we can.
  if (jointSet === 'mediapipe_pose_v1' || jointSet === 'mediapipe_holistic_v1') return POSE_EDGES
  if (jointSet === 'mediapipe_hands_v1') return HAND_EDGES
  return []
}
