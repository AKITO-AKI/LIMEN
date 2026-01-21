export type Language = 'JSL' | 'ASL' | 'CSL'

export type CoordinateSpace = 'pixel' | 'normalized' | 'world'

export type JointSet =
  | 'mediapipe_holistic_v1'
  | 'mediapipe_pose_v1'
  | 'mediapipe_hands_v1'
  | 'mediapipe_pose_hands_v1'

export type Joint = {
  x: number
  y: number
  z?: number
  visibility?: number
  confidence?: number
}

export type SkeletonFrame = {
  t: number
  overallConfidence?: number
  joints: Record<string, Joint>
}

export type Skeleton = {
  schemaVersion: string
  jointSet: JointSet
  coordinateSpace: CoordinateSpace
  fps?: number
  meta?: Record<string, unknown>
  frames: SkeletonFrame[]
}

export type MeaningParams = {
  direction: { x: number; y: number; z: number }
  intensity: number
  tempo: number
  politeness: number
}

export type Meaning = {
  schemaVersion: string
  sourceLanguage: Language
  targetLanguage: Language
  intent:
    | 'greeting'
    | 'introduce_self'
    | 'thanks'
    | 'sorry'
    | 'help'
    | 'request'
    | 'slow_down'
    | 'where'
    | 'warning'
    | 'yes'
    | 'no'
  params: MeaningParams
  confidence: number
  rationale?: string
  debug?: Record<string, unknown>
}

export type Session = {
  schemaVersion: string
  sessionId: string
  createdAt: string
  sourceLanguage: Language
  targetLanguage: Language
  inputSkeleton: Skeleton
  estimatedMeaning?: Meaning
  outputSkeleton?: Skeleton
  meta?: Record<string, unknown>
}
