import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult
} from '@mediapipe/tasks-vision'

export type VisionLandmarkers = {
  pose: PoseLandmarker
  hands: HandLandmarker
}

// You can override these by Vite env vars if needed.
const DEFAULT_WASM_PATH =
  import.meta.env.VITE_MP_WASM_PATH ??
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

const DEFAULT_POSE_MODEL_URL =
  import.meta.env.VITE_MP_POSE_MODEL_URL ??
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

const DEFAULT_HAND_MODEL_URL =
  import.meta.env.VITE_MP_HAND_MODEL_URL ??
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let cached: Promise<VisionLandmarkers> | null = null

export async function getLandmarkers(): Promise<VisionLandmarkers> {
  if (cached) return await cached

  cached = (async () => {
    const vision = await FilesetResolver.forVisionTasks(DEFAULT_WASM_PATH)

    const pose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: DEFAULT_POSE_MODEL_URL,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numPoses: 1
    })

    const hands = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: DEFAULT_HAND_MODEL_URL,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2
    })

    return { pose, hands }
  })()

  return await cached
}

export function detectPose(pose: PoseLandmarker, video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResult {
  return pose.detectForVideo(video, timestampMs)
}

export function detectHands(
  hands: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number
): HandLandmarkerResult {
  return hands.detectForVideo(video, timestampMs)
}
