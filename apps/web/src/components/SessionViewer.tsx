import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Language, Skeleton, SkeletonFrame } from '../lib/types'
import { Skeleton3View } from './Skeleton3View'
import { skeletonToBVH } from '../lib/bvh'
import { estimateClipParams, pickPoseKeyframes, sliceSkeleton } from '../lib/clip'

function pickFrame(frames: SkeletonFrame[], timeSec: number): SkeletonFrame | null {
  if (frames.length === 0) return null
  let idx = 0
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t <= timeSec) idx = i
  }
  return frames[idx] ?? frames[0]
}

function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const INTENTS: Array<{ id: any; label: string }> = [
  { id: 'greeting', label: 'greeting' },
  { id: 'introduce_self', label: 'introduce_self' },
  { id: 'thanks', label: 'thanks' },
  { id: 'sorry', label: 'sorry' },
  { id: 'help', label: 'help' },
  { id: 'request', label: 'request' },
  { id: 'slow_down', label: 'slow_down' },
  { id: 'where', label: 'where' },
  { id: 'warning', label: 'warning' },
  { id: 'yes', label: 'yes' },
  { id: 'no', label: 'no' }
]

export function SessionViewer(props: {
  title: string
  sessionId?: string
  skeleton: Skeleton | null
  filenameStem?: string
  // Stage3
  apiBase?: string
  defaultTemplateLanguage?: Language
  templateSourceKind?: 'recorded' | 'loaded' | 'template'
  onTemplateSaved?: (templateId: string) => void
}) {
  const sk = props.skeleton
  const frames = sk?.frames ?? []

  const duration = useMemo(() => {
    if (frames.length < 2) return 0
    const last = frames[frames.length - 1]?.t ?? 0
    return Math.max(0, last)
  }, [frames])

  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)

  // Stage3 template UI
  const [templateOpen, setTemplateOpen] = useState(false)
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(0)
  const [tplLang, setTplLang] = useState<Language>(props.defaultTemplateLanguage ?? 'JSL')
  const [tplIntent, setTplIntent] = useState<any>('greeting')
  const [tplIntensity, setTplIntensity] = useState<number | null>(null)
  const [tplTempo, setTplTempo] = useState<number | null>(null)
  const [tplStatus, setTplStatus] = useState<string>('')
  const [tplBusy, setTplBusy] = useState(false)

  useEffect(() => {
    // reset on skeleton change
    setT(0)
    setPlaying(false)
    setTemplateOpen(false)
    setTplStatus('')

    // initialize clip to whole range
    setClipStart(0)
    setClipEnd(duration)
  }, [sk?.frames, duration])

  useEffect(() => {
    // keep default language in sync (but don't clobber manual edits when panel is open)
    if (!templateOpen) {
      setTplLang(props.defaultTemplateLanguage ?? 'JSL')
    }
  }, [props.defaultTemplateLanguage, templateOpen])

  useEffect(() => {
    if (!playing) return
    if (!sk || duration <= 0) return

    const loop = (now: number) => {
      if (!lastRef.current) lastRef.current = now
      const dt = (now - lastRef.current) / 1000
      lastRef.current = now

      setT((prev) => {
        const next = prev + dt
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastRef.current = 0
    }
  }, [playing, sk, duration])

  const frame = useMemo(() => pickFrame(frames, t), [frames, t])
  const overallConf = frame?.overallConfidence

  const stem = props.filenameStem ?? props.sessionId ?? 'session'

  const onExportBVH = () => {
    if (!sk) return
    try {
      const bvh = skeletonToBVH(sk, {
        fpsOut: 30,
        shoulderWidthCm: 40,
        normalize: true,
        rootRotation: 'yaw'
      })
      downloadText(`${stem}.bvh`, bvh, 'text/plain')
    } catch (e: any) {
      alert(`BVH export failed: ${e?.message ?? String(e)}`)
    }
  }

  const onExportJSON = () => {
    if (!sk) return
    downloadText(`${stem}.json`, JSON.stringify(sk, null, 2), 'application/json')
  }

  const clipValid = sk && duration > 0 && clipEnd > clipStart + 0.05
  const clipPreview = useMemo(() => {
    if (!sk) return null
    if (!clipValid) return null
    return sliceSkeleton(sk, clipStart, clipEnd)
  }, [sk, clipStart, clipEnd, clipValid])

  const autoParams = useMemo(() => {
    if (!clipPreview) return null
    return estimateClipParams(clipPreview)
  }, [clipPreview])

  const intensity = tplIntensity ?? autoParams?.intensity ?? 0.3
  const tempo = tplTempo ?? autoParams?.tempo ?? 0.3

  const setStartFromNow = () => {
    setClipStart(Math.max(0, Math.min(t, duration)))
    if (clipEnd <= t) setClipEnd(Math.min(duration, t + 0.25))
  }

  const setEndFromNow = () => {
    setClipEnd(Math.max(0, Math.min(t, duration)))
    if (clipStart >= t) setClipStart(Math.max(0, t - 0.25))
  }

  async function saveTemplate() {
    if (!clipPreview || !props.apiBase) return
    setTplBusy(true)
    setTplStatus('Saving...')
    try {
      const keyframes = pickPoseKeyframes(clipPreview, 3)
      const direction = autoParams?.direction ?? { x: 0, y: 0, z: 0 }

      // Primary artifact: BVH (normalized+resampled)
      const bvhText = skeletonToBVH(clipPreview, {
        fpsOut: 30,
        shoulderWidthCm: 40,
        normalize: true,
        rootRotation: 'yaw'
      })

      const payload = {
        schemaVersion: '0.1.0',
        createdAt: new Date().toISOString(),
        language: tplLang,
        intent: tplIntent,
        params: {
          direction,
          intensity,
          tempo
        },
        sourceSessionId: props.sessionId ?? '',
        clipStartSec: clipStart,
        clipEndSec: clipEnd,
        keyframes,
        skeletonClip: clipPreview,
        bvhText,
        ui: {
          sourceKind: props.templateSourceKind ?? 'recorded'
        }
      }

      const res = await fetch(`${props.apiBase}/template/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const data = (await res.json()) as { templateId?: string }
      const id = data.templateId ?? ''
      setTplStatus(id ? `Saved: ${id.slice(0, 8)}…` : 'Saved')
      if (id) props.onTemplateSaved?.(id)
    } catch (e: any) {
      setTplStatus(e?.message ?? String(e))
    } finally {
      setTplBusy(false)
    }
  }

  return (
    <div className="session-viewer">
      <div className="session-viewer-header">
        <div className="session-viewer-title">{props.title}</div>
        <div className="spacer" />
        <div className="chips">
          {props.sessionId ? <span className="chip mono">{props.sessionId.slice(0, 8)}…</span> : null}
          {sk ? <span className="chip">{frames.length}f</span> : <span className="chip">0f</span>}
          <span className="chip">dur: {duration.toFixed(1)}s</span>
          <span className="chip">t: {t.toFixed(2)}s</span>
          {typeof overallConf === 'number' ? <span className="chip">conf: {overallConf.toFixed(2)}</span> : null}
        </div>
      </div>

      {!sk ? (
        <div className="note">No skeleton selected yet.</div>
      ) : (
        <>
          <Skeleton3View skeleton={sk} timeSec={t} />

          <div className="playback">
            <button onClick={() => setPlaying((p) => !p)} disabled={duration <= 0}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => {
                setPlaying(false)
                setT(0)
              }}
              disabled={duration <= 0}
            >
              Reset
            </button>

            <input
              className="slider"
              type="range"
              min={0}
              max={Math.max(0, duration)}
              step={0.01}
              value={t}
              onChange={(e) => {
                setPlaying(false)
                setT(parseFloat(e.target.value))
              }}
              disabled={duration <= 0}
            />

            <div className="spacer" />

            <button onClick={onExportBVH} disabled={!sk}>
              Export BVH
            </button>
            <button onClick={onExportJSON} disabled={!sk}>
              Export JSON
            </button>

            <button
              onClick={() => setTemplateOpen((o) => !o)}
              disabled={!props.apiBase || props.templateSourceKind === 'template'}
              className={templateOpen ? 'tab active' : 'tab'}
              title={props.apiBase ? 'Create template from current skeleton clip' : 'Start API to enable templates'}
            >
              Template
            </button>
          </div>

          {templateOpen ? (
            <div className="template-panel">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="chip">1 Clip</span>
                <span className="chip">2 Tag</span>
                <span className="chip">3 Save</span>
                <div className="spacer" />
                {tplStatus ? <span className="note">{tplStatus}</span> : null}
              </div>

              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <span className="chip">start {clipStart.toFixed(2)}s</span>
                <button onClick={setStartFromNow} disabled={duration <= 0}>
                  start ← t
                </button>
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={Math.max(0, duration)}
                  step={0.01}
                  value={clipStart}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setClipStart(v)
                    if (clipEnd <= v) setClipEnd(Math.min(duration, v + 0.25))
                  }}
                />
              </div>

              <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
                <span className="chip">end {clipEnd.toFixed(2)}s</span>
                <button onClick={setEndFromNow} disabled={duration <= 0}>
                  end ← t
                </button>
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={Math.max(0, duration)}
                  step={0.01}
                  value={clipEnd}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setClipEnd(v)
                    if (clipStart >= v) setClipStart(Math.max(0, v - 0.25))
                  }}
                />
              </div>

              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <label className="note">
                  LANG&nbsp;
                  <select value={tplLang} onChange={(e) => setTplLang(e.target.value as Language)}>
                    <option value="JSL">JSL</option>
                    <option value="ASL">ASL</option>
                    <option value="CSL">CSL</option>
                  </select>
                </label>

                <label className="note">
                  INTENT&nbsp;
                  <select value={tplIntent} onChange={(e) => setTplIntent(e.target.value)}>
                    {INTENTS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="spacer" />

                <button
                  onClick={() => {
                    setTplIntensity(null)
                    setTplTempo(null)
                    setClipStart(0)
                    setClipEnd(duration)
                    setTplStatus('')
                  }}
                  disabled={tplBusy}
                >
                  Reset
                </button>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <span className="chip">intensity {intensity.toFixed(2)}</span>
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={intensity}
                  onChange={(e) => setTplIntensity(parseFloat(e.target.value))}
                />

                <span className="chip">tempo {tempo.toFixed(2)}</span>
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={tempo}
                  onChange={(e) => setTplTempo(parseFloat(e.target.value))}
                />
              </div>

              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <span className="chip">keyframes: 3</span>
                <span className="chip mono">
                  dir: {autoParams ? `${autoParams.direction.x.toFixed(2)},${autoParams.direction.y.toFixed(2)},${autoParams.direction.z.toFixed(2)}` : '0,0,0'}
                </span>
                <div className="spacer" />
                <button onClick={saveTemplate} disabled={!clipValid || tplBusy || !props.apiBase} className="primary">
                  Save Template
                </button>
              </div>

              {!clipValid ? <div className="note">Pick a clip (end must be > start).</div> : null}
            </div>
          ) : null}

          <div className="helper">
            3-view is fixed (Front/Side/Top). BVH export runs a normalization pipeline (center @ initial hips, scale by
            median shoulder width, resample to 30fps) and outputs world coordinates in cm. Hands/fingers are included
            using MediaPipe hand landmarks, aligned to pose wrists per frame.
          </div>
        </>
      )}
    </div>
  )
}
