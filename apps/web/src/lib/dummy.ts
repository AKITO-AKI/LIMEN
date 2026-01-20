import type { Language, Meaning, Skeleton } from './types'

export const dummySkeleton: Skeleton = {
  schemaVersion: '0.1.0',
  jointSet: 'mediapipe_pose_v1',
  coordinateSpace: 'normalized',
  fps: 30,
  meta: { note: 'Stage0 dummy skeleton' },
  frames: Array.from({ length: 60 }, (_, i) => {
    const t = i / 30
    const wobble = Math.sin(i / 6) * 0.02
    return {
      t,
      overallConfidence: 0.92,
      joints: {
        NOSE: { x: 0.5, y: 0.12, z: -0.1, confidence: 0.95 },
        LEFT_WRIST: { x: 0.35 - wobble, y: 0.55 - wobble, z: -0.05, confidence: 0.9 },
        RIGHT_WRIST: { x: 0.65 + wobble, y: 0.54 - wobble, z: -0.05, confidence: 0.91 }
      }
    }
  })
}

const intents: Meaning['intent'][] = [
  'greeting',
  'introduce_self',
  'thanks',
  'sorry',
  'help',
  'request',
  'slow_down',
  'where',
  'warning',
  'yes',
  'no'
]

export function dummyMeaning(sourceLanguage: Language, targetLanguage: Language): Meaning {
  const i = Math.floor(Math.random() * intents.length)
  return {
    schemaVersion: '0.1.0',
    sourceLanguage,
    targetLanguage,
    intent: intents[i] ?? 'greeting',
    params: {
      direction: { x: 0, y: 0, z: 0 },
      intensity: Math.random() * 0.9,
      tempo: Math.random() * 0.9,
      politeness: 0.6 + Math.random() * 0.4
    },
    confidence: 0.55 + Math.random() * 0.35,
    rationale: 'Stage0 dummy: fixed schema-shaped Meaning output.'
  }
}
